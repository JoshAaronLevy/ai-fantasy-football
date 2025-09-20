# Roster Double Fetch Analysis Report

## Call Graph

```
Component Mount (SeasonModeContainer)
├── useEffect [availableTeams.length, teamsLoading, teamsError, initializeSeasonMode, toast] (line 31)
│   └── initializeSeasonMode() (called when availableTeams.length === 0)
│       ├── Check cache for week-specific data (LS_KEYS.roster('local', selectedWeek))
│       ├── If cache hit: Load from localStorage
│       └── If cache miss: fetchRosterWithMatchups('boykies', selectedWeek) → API call #1
│
└── WeekSelector interaction
    └── setSelectedWeek(newWeek) (line 23 in WeekSelector.tsx)
        └── fetchUserRoster() (line 68 in seasonStore.ts) → API call #2
```

## Code Analysis

### 1. SeasonModeContainer Init Effect

**File:** `src/components/season/SeasonModeContainer.tsx` (lines 19-31)

```tsx
// Initialize Season Mode on mount
useEffect(() => {
  if (availableTeams.length === 0 && !teamsLoading && !teamsError) {
    initializeSeasonMode().catch((error) => {
      console.error('Failed to initialize Season Mode:', error)
      toast.current?.show({
        severity: 'error',
        summary: 'Season Mode Error',
        detail: 'Failed to initialize Season Mode. Please try again.',
        life: 5000
      })
    })
  }
}, [availableTeams.length, teamsLoading, teamsError, initializeSeasonMode, toast])
```

**Dependency Array Analysis:**
- `availableTeams.length`: Changes from 0 → n on initialization
- `teamsLoading`: Boolean flag for team loading state
- `teamsError`: Error state string
- `initializeSeasonMode`: Function from Zustand store selector
- `toast`: React ref object passed as prop

### 2. Store Function Definitions

**File:** `src/state/seasonStore.ts`

#### `initializeSeasonMode` (lines 208-249)
```typescript
initializeSeasonMode: async () => {
  // Prevent duplicate initialization calls using truly synchronous module-level flag
  if (isInitializingSeasonMode) {
    return;
  }
  
  // Immediately set the synchronous flag
  isInitializingSeasonMode = true;
  
  set({ loading: true, error: null, isInitializing: true });
  try {
    // Check for week-specific cached data first
    const { selectedWeek } = useSeasonStore.getState();
    const stored = getJSON(LS_KEYS.roster('local', selectedWeek), null);
    if (stored) {
      const migrated = migratePlayersFromStorage(stored);
      set({ userRoster: migrated });
      console.trace('[ROSTER] Page load - roster loaded from cache:', JSON.stringify({
        week: selectedWeek,
        playerCount: migrated.length,
        players: migrated.slice(0, 2)
      }, null, 2));
    } else {
      // fetch fresh when no week-specific cache exists
      const roster = await fetchRosterWithMatchups('boykies', selectedWeek);
      setJSON(LS_KEYS.roster('local', selectedWeek), roster);
      set({ userRoster: roster });
      console.log('[ROSTER] Page load - roster fetched fresh:', JSON.stringify({
        week: selectedWeek,
        playerCount: roster.length,
        players: roster.slice(0, 2)
      }, null, 2));
    }
  } catch (e: unknown) {
    console.error('[season] init error', e);
    set({ error: String(e) });
  } finally {
    set({ loading: false, isInitializing: false });
    // Reset the module-level flag
    isInitializingSeasonMode = false;
  }
}
```

#### `setSelectedWeek` (lines 64-69)
```typescript
setSelectedWeek: (w: number) => {
  setJSON(LS_KEYS.week, w);
  set({ selectedWeek: w });
  // Trigger fresh roster fetch for the new week
  useSeasonStore.getState().fetchUserRoster();
}
```

#### `fetchUserRoster` (lines 251-276)
```typescript
fetchUserRoster: async () => {
  // Prevent fetching during initialization to avoid duplicates
  const { isInitializing } = useSeasonStore.getState();
  if (isInitializing) {
    console.log('[ROSTER] Skipping fetchUserRoster - initialization in progress');
    return;
  }
  
  set({ loading: true, error: null });
  try {
    const { selectedWeek } = useSeasonStore.getState();
    const roster = await fetchRosterWithMatchups('boykies', selectedWeek);
    setJSON(LS_KEYS.roster('local', selectedWeek), roster);
    set({ userRoster: roster });
    console.log('[ROSTER] Roster updated due to week change:', JSON.stringify({
      week: selectedWeek,
      playerCount: roster.length,
      players: roster.slice(0, 2)
    }, null, 2));
  } catch (e: unknown) {
    console.error('[season] fetchUserRoster error', e);
    // fallback: keep existing or stored
  } finally {
    set({ loading: false });
  }
}
```

#### Module-level Guard Flag (lines 8-9)
```typescript
// Module-level flag for truly synchronous duplicate prevention
let isInitializingSeasonMode = false;
```

#### localStorage Keys (lines 36-39)
```typescript
const LS_KEYS = {
  roster: (userId?: string, week?: number) => `roster-analysis-v2-userRoster-${userId ?? 'local'}-week-${week ?? 1}`,
  week: 'seasonSelectedWeek',
};
```

### 3. API Function Definitions

**File:** `src/lib/api/season.ts`

#### `fetchRosterWithMatchups` (lines 27-34)
```typescript
export async function fetchRosterWithMatchups(teamName: string, weekNumber: number | string): Promise<ApiPlayer[]> {
  const res = await fetch(buildRosterUrl(teamName, weekNumber));
  if (!res.ok) throw new Error(`Roster fetch failed: ${res.status}`);
  const raw = await res.json();
  // Assume API returns { roster: Player[], ... } or just Player[]
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.roster) ? raw.roster : []);
  return normalizePlayers(arr);
}
```

#### `buildRosterUrl` (lines 23-25)
```typescript
export function buildRosterUrl(team: string, week: number | string): string {
  return `/api/v1/roster/${encodeURIComponent(team)}/${encodeURIComponent(String(week))}`;
}
```

### 4. Function Call References

#### `initializeSeasonMode(` - 1 reference found:
- **src/components/season/SeasonModeContainer.tsx:21** - `initializeSeasonMode().catch((error) => {`
  - Context: Inside useEffect, called when availableTeams.length === 0
  - Surrounding: `if (availableTeams.length === 0 && !teamsLoading && !teamsError) {`

#### `setSelectedWeek(` - 1 reference found:
- **src/components/season/WeekSelector.tsx:23** - `setSelectedWeek(value)`
  - Context: Inside handleWeekChange function
  - Surrounding: `if (value !== null) {` / `}`

#### `fetchUserRoster(` - 1 reference found:
- **src/state/seasonStore.ts:68** - `useSeasonStore.getState().fetchUserRoster();`
  - Context: Inside setSelectedWeek function
  - Surrounding: `set({ selectedWeek: w });` / `// Trigger fresh roster fetch for the new week`

#### `fetchRosterWithMatchups(` - 3 references found:
- **src/lib/api/season.ts:27** - Function definition
- **src/state/seasonStore.ts:232** - `const roster = await fetchRosterWithMatchups('boykies', selectedWeek);`
  - Context: Inside initializeSeasonMode, cache miss path
  - Surrounding: `// fetch fresh when no week-specific cache exists`
- **src/state/seasonStore.ts:262** - `const roster = await fetchRosterWithMatchups('boykies', selectedWeek);`
  - Context: Inside fetchUserRoster function
  - Surrounding: `const { selectedWeek } = useSeasonStore.getState();`

### 5. Week Selection Effects

**File:** `src/components/season/WeekSelector.tsx`

**No useEffect blocks found** - The WeekSelector component is purely controlled by user interaction through the Dropdown component. It does not have any useEffect hooks that automatically trigger week changes.

The week change flow is:
1. User selects new week in Dropdown (line 32)
2. `handleWeekChange` called (line 21-25)
3. `setSelectedWeek(value)` called (line 23)
4. Store function triggers `fetchUserRoster()` (line 68 in seasonStore.ts)

### 6. StrictMode Configuration

**File:** `src/main.tsx` (lines 32-37)

```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
```

**StrictMode Impact:** React.StrictMode is enabled, which causes effects to run twice in development mode. This could trigger the SeasonModeContainer initialization useEffect twice on mount.

**Other Root Wrappers:** QueryClientProvider from @tanstack/react-query is the only other wrapper.

### 7. Init Path Dependencies

**Analysis of whether `initializeSeasonMode` triggers `setSelectedWeek`:**

❌ **Direct calls:** `initializeSeasonMode` does NOT directly call `setSelectedWeek`

❌ **Indirect calls:** `initializeSeasonMode` does NOT trigger any state changes that would cause `setSelectedWeek` to be called

✅ **Week initialization:** `initializeSeasonMode` reads the current `selectedWeek` from state (line 220) but does not modify it

✅ **Cache key dependency:** The function uses `selectedWeek` to generate the localStorage cache key (line 221) but this is read-only

**Key insight:** The init path is independent of week selection changes. However, both paths can execute the same API call (`fetchRosterWithMatchups`) under different conditions.

## Root Cause Hypothesis

• **React StrictMode Double Effect:** The primary trigger is React.StrictMode causing the SeasonModeContainer useEffect to run twice on mount, potentially causing double initialization

• **Cache Miss Scenario:** When localStorage is empty (first visit or cleared cache), `initializeSeasonMode` will fetch fresh data via `fetchRosterWithMatchups`

• **Unstable Dependencies:** The `initializeSeasonMode` function reference from the Zustand store may not be stable between renders, potentially causing effect re-runs

• **Race Condition Protection:** The module-level `isInitializingSeasonMode` flag provides synchronous protection, but only prevents overlapping calls to `initializeSeasonMode` itself, not the underlying `fetchRosterWithMatchups`

• **Week Selection Independence:** User week changes trigger separate `fetchUserRoster` calls that bypass initialization guards, so rapid week changes could cause multiple concurrent API calls

• **No Effect Dependency Optimization:** The SeasonModeContainer useEffect depends on `toast` ref and `initializeSeasonMode` function, which may cause unnecessary re-runs if these references change