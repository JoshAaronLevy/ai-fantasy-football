# Season Mode Refactor Audit

**Generated:** 2025-01-09  
**Project:** Boykies Fantasy Football  
**Stack:** React + PrimeReact + Zustand + TypeScript  

---

## 1. Executive Summary

The current architecture suffers from critical coupling between Draft Mode and Season Mode that violates separation of concerns. The primary issue is a monolithic [`draftStore.ts`](src/state/draftStore.ts:1) (1,769 lines) that inappropriately houses Season state, forcing Season components to use draft-specific hooks and patterns. This creates artificial dependencies and makes Season Mode impossible to develop, test, or deploy independently.

**Key Isolation Problems:** Season state is nested within [`season: SeasonState`](src/state/draftStore.ts:74) in the draft store, mode routing is handled via [`useDraftStore((s) => s.season.currentMode)`](src/App.tsx:24), and all Season components must import [`useDraftStore`](src/components/season/SeasonModeContainer.tsx:3) despite having no draft-related functionality. The recommended solution is to extract Season Mode into a dedicated [`seasonStore`](src/state/seasonStore.ts:1) with its own state management, routing, and API patterns while preserving existing PrimeReact and Zustand architecture.

---

## 2. Stack & Invariants

### Required Technologies (NO REPLACEMENT)
- **PrimeReact**: [`DataTable`](src/components/season/RosterTable.tsx:116), [`ToggleButton`](src/components/common/ModeToggle.tsx:18), [`Toast`](src/components/season/SeasonModeContainer.tsx:8) components
- **Zustand**: State management via [`create()`](src/state/draftStore.ts:186) and [`persist()`](src/state/draftStore.ts:187) middleware
- **TypeScript**: Strict typing with [`SeasonState`](src/types.ts:159), [`ApiRosterPlayer`](src/types.ts:140) interfaces

### Browser Routing Approach
- **Client-side routing**: Mode switching via [`setCurrentMode('draft' | 'season')`](src/components/common/ModeToggle.tsx:14)
- **Component conditional rendering**: [`currentMode === 'draft' ? <PlayersGrid /> : <SeasonModeContainer />`](src/App.tsx:98-102)

### Global Providers & Themes
- **PrimeReact Theme**: Centralized styling via PrimeReact CSS imports
- **Toast Provider**: Global [`<Toast ref={toast} />`](src/App.tsx:91) for notifications across modes

---

## 3. Current Architecture (Discovered)

### Files Where Season Logic Lives or Leaks Into Draft Mode

| File | Responsibility | Coupling Assessment | Recommendation |
|------|---------------|---------------------|----------------|
| [`src/state/draftStore.ts`](src/state/draftStore.ts:1) | Monolithic store housing both Draft and Season state | **CRITICAL** - 1,769 lines, [`season: SeasonState`](src/state/draftStore.ts:74) nested inappropriately | **EXTRACT** - Move Season actions/state to dedicated store |
| [`src/App.tsx`](src/App.tsx:1) | Main routing logic using draft store for mode switching | **HIGH** - [`currentMode = useDraftStore((s) => s.season.currentMode)`](src/App.tsx:24) | **MOVE** - Route via independent season store |
| [`src/components/common/ModeToggle.tsx`](src/components/common/ModeToggle.tsx:1) | Mode switching component coupled to draft store | **MEDIUM** - [`useDraftStore`](src/components/common/ModeToggle.tsx:3) for season mode | **MOVE** - Use dedicated season store hook |
| [`src/components/season/SeasonModeContainer.tsx`](src/components/season/SeasonModeContainer.tsx:1) | Season container forced to use draft store | **MEDIUM** - Clean Season logic but [`useDraftStore`](src/components/season/SeasonModeContainer.tsx:3) dependency | **KEEP** - Update imports only |
| [`src/components/season/RosterComparison.tsx`](src/components/season/RosterComparison.tsx:1) | Roster comparison logic using draft store | **MEDIUM** - Pure Season functionality but draft store coupling | **KEEP** - Update imports only |
| [`src/components/season/RosterTable.tsx`](src/components/season/RosterTable.tsx:1) | Clean PrimeReact DataTable implementation | **LOW** - No direct store coupling, pure component | **KEEP** - No changes needed |
| [`src/types.ts`](src/types.ts:1) | Type definitions with mixed concerns | **LOW** - [`SeasonState`](src/types.ts:159) properly isolated | **KEEP** - Types are well-structured |

---

## 4. Findings: Coupling & Code Smells (Season Mode)

### State Issues
- **Nested State Architecture**: [`season: SeasonState`](src/state/draftStore.ts:74) buried within draft store violates single responsibility
- **Cross-Domain Actions**: Draft store contains [`setCurrentMode`](src/state/draftStore.ts:156), [`fetchAvailableTeams`](src/state/draftStore.ts:172) Season actions
- **Shared Persistence**: Season state unnecessarily persisted with draft data via [`persist()`](src/state/draftStore.ts:187) middleware

### UI Issues
- **Import Pollution**: Season components forced to [`import { useDraftStore }`](src/components/season/SeasonModeContainer.tsx:3) despite zero draft logic
- **Mode Toggle Coupling**: [`ModeToggle`](src/components/common/ModeToggle.tsx:10) accesses season mode via draft store path
- **Routing Confusion**: [`App.tsx`](src/App.tsx:24) routes to Season Mode via draft store selector

### API Layer Issues
- **Pattern Divergence**: Draft uses complex offline queuing via [`addToQueue()`](src/state/draftStore.ts:129), Season uses simple [`fetchAllRosters()`](src/components/season/RosterComparison.tsx:31)
- **Endpoint Inconsistency**: Draft APIs at `/api/draft/*`, Season at [`/api/roster/allPlayers`](src/lib/api.ts:1)
- **Error Handling Mismatch**: Draft has sophisticated retry logic, Season has basic try/catch

### Data Shaping Issues
- **Mixed Interfaces**: [`Player`](src/types.ts:6) for Draft vs [`ApiRosterPlayer`](src/types.ts:140) for Season create unnecessary complexity
- **Cache Inconsistency**: Season uses [`rosterCache`](src/types.ts:181) while Draft has elaborate action queues

---

## 5. Proposed Season Module Architecture (Suggestion)

### Directory Tree Proposal
```
src/
├── state/
│   ├── draftStore.ts          # Draft-only state (reduced size)
│   ├── seasonStore.ts         # NEW: Dedicated Season state
│   └── index.ts               # NEW: Store exports barrel
├── components/
│   ├── draft/                 # NEW: Draft-specific components
│   │   ├── PlayersGrid.tsx    # MOVE: From root components/
│   │   ├── DraftConfigModal.tsx # MOVE: From root components/
│   │   └── grid/              # MOVE: From root components/grid/
│   ├── season/                # EXISTING: Well-structured
│   │   ├── SeasonModeContainer.tsx
│   │   ├── RosterComparison.tsx
│   │   ├── RosterTable.tsx
│   │   └── TeamSelector.tsx
│   └── common/                # EXISTING: Shared components
│       └── ModeToggle.tsx     # UPDATE: Use both stores
├── hooks/
│   ├── draft/                 # NEW: Draft-specific hooks
│   └── season/                # NEW: Season-specific hooks
└── lib/
    ├── api/
    │   ├── draft.ts           # NEW: Draft API functions
    │   ├── season.ts          # NEW: Season API functions
    │   └── index.ts           # NEW: API exports barrel
    └── types/                 # NEW: Domain-specific types
        ├── draft.ts
        └── season.ts
```

### File Responsibilities
- **[`seasonStore.ts`](src/state/seasonStore.ts:1)**: Mode management, team data, roster comparisons, API integration
- **[`draftStore.ts`](src/state/draftStore.ts:1)**: Player drafting, offline queuing, AI conversation state (reduced to ~800 lines)
- **[`ModeToggle.tsx`](src/components/common/ModeToggle.tsx:1)**: Access both stores via [`useSeasonStore`](src/state/seasonStore.ts:1) and [`useDraftStore`](src/state/draftStore.ts:186)

### Routing Plan
```typescript
// App.tsx routing strategy
const seasonMode = useSeasonStore(s => s.currentMode)
const draftConfigured = useDraftStore(s => s.isDraftConfigured())

const showSeasonMode = seasonMode === 'season'
const showDraftMode = seasonMode === 'draft' && draftConfigured
```

### State Shape Draft for seasonStore
```typescript
interface SeasonStoreState {
  // Core mode management
  currentMode: 'draft' | 'season'
  
  // Team & roster data
  availableTeams: SeasonTeam[]
  selectedOpponentTeam: SeasonTeam | null
  myRoster: ApiRosterPlayer[]
  opponentRoster: ApiRosterPlayer[]
  
  // API state
  teamsLoading: boolean
  rostersLoading: boolean
  teamsError: string | null
  rostersError: string | null
  
  // Cache management
  rosterCache: Record<string, CachedRoster>
  lastCacheUpdate: number
  
  // Actions
  setCurrentMode: (mode: 'draft' | 'season') => void
  fetchTeams: () => Promise<void>
  fetchRosterComparison: (opponentId: string) => Promise<void>
  clearCache: () => void
}
```

### API Strategy
- **Dedicated API module**: [`src/lib/api/season.ts`](src/lib/api/season.ts:1) with [`fetchTeams()`](src/lib/api/season.ts:1), [`fetchRosterData()`](src/lib/api/season.ts:1)
- **Consistent error handling**: Unified error patterns across Season endpoints
- **Simple fetch patterns**: No offline queuing complexity for Season Mode

---

## 6. Lineup Shaping Spec (Authoritative)

### Exact Deterministic Rules for 16 Rows
```typescript
// Roster positions in exact display order
const LINEUP_POSITIONS = [
  'QB',    // Quarterback (1)
  'RB',    // Running Back 1 (2) 
  'RB',    // Running Back 2 (3)
  'WR',    // Wide Receiver 1 (4)
  'WR',    // Wide Receiver 2 (5)
  'TE',    // Tight End (6)
  'FLEX',  // Flex: RB/WR/TE (7)
  'K',     // Kicker (8)
  'DST',   // Defense/Special Teams (9)
  'BN',    // Bench 1 (10)
  'BN',    // Bench 2 (11)
  'BN',    // Bench 3 (12)
  'BN',    // Bench 4 (13)
  'BN',    // Bench 5 (14)
  'BN',    // Bench 6 (15)
  'BN'     // Bench 7 (16)
] as const
```

### Pure Function Signature
```typescript
interface LineupPlayer {
  id: string
  name: string
  position: string
  slotPosition: typeof LINEUP_POSITIONS[number]
  projectedPoints: number | null
  isStarter: boolean
}

/**
 * Shapes raw roster data into deterministic 16-row lineup
 * @param players - Raw player data from API
 * @returns Exactly 16 LineupPlayer objects in position order
 */
function shapeLineup(players: ApiRosterPlayer[]): LineupPlayer[] {
  // Implementation ensures exactly 16 rows with empty slots filled
  return LINEUP_POSITIONS.map((slotPosition, index) => {
    const player = findPlayerForSlot(players, slotPosition, index)
    return {
      id: player?.id || `empty-${index}`,
      name: player?.name || '---',
      position: player?.position || '',
      slotPosition,
      projectedPoints: player?.projectedPoints || null,
      isStarter: !slotPosition.startsWith('BN')
    }
  })
}
```

### Performance Notes
- **O(n) complexity**: Single pass through player array with position mapping
- **Memoization**: Use [`React.useMemo()`](src/components/season/RosterTable.tsx:27) for lineup shaping in components
- **Immutable updates**: Pure function returns new array, safe for React rendering

---

## 7. Phased Migration Plan

### Phase A: Extract Season Store (Sonnet-4)
**Duration:** 1-2 hours  
**Inputs:** Current [`draftStore.ts`](src/state/draftStore.ts:1), [`types.ts`](src/types.ts:159)  
**Outputs:** New [`seasonStore.ts`](src/state/seasonStore.ts:1), updated [`types.ts`](src/types.ts:159)  
**Blast Radius:** State management layer only  
**Acceptance Criteria:**
- [ ] [`seasonStore.ts`](src/state/seasonStore.ts:1) created with all Season actions/state
- [ ] [`SeasonState`](src/types.ts:159) interface extracted to dedicated types
- [ ] [`draftStore.ts`](src/state/draftStore.ts:1) size reduced by ~400 lines
- [ ] All Season store tests pass

### Phase B: Update Season Components (Sonnet-4)
**Duration:** 30 minutes  
**Inputs:** [`seasonStore.ts`](src/state/seasonStore.ts:1), Season components  
**Outputs:** Updated Season component imports  
**Blast Radius:** Season UI components only  
**Acceptance Criteria:**
- [ ] [`SeasonModeContainer.tsx`](src/components/season/SeasonModeContainer.tsx:3) uses [`useSeasonStore`](src/state/seasonStore.ts:1)
- [ ] [`RosterComparison.tsx`](src/components/season/RosterComparison.tsx:2) imports updated
- [ ] [`ModeToggle.tsx`](src/components/common/ModeToggle.tsx:3) accesses both stores
- [ ] Season Mode functionality unchanged

### Phase C: Update App Routing (Sonnet-4)
**Duration:** 20 minutes  
**Inputs:** Updated stores, [`App.tsx`](src/App.tsx:24)  
**Outputs:** Independent mode routing  
**Blast Radius:** Main application routing  
**Acceptance Criteria:**
- [ ] [`App.tsx`](src/App.tsx:24) uses [`useSeasonStore`](src/state/seasonStore.ts:1) for mode detection
- [ ] Mode switching works independently
- [ ] No draft store coupling for Season routing
- [ ] Both modes render correctly

### Phase D: API Layer Refactor (Opus-4)
**Duration:** 2-3 hours  
**Inputs:** Season store, existing API patterns  
**Outputs:** Dedicated Season API module  
**Blast Radius:** API integration, error handling  
**Acceptance Criteria:**
- [ ] [`src/lib/api/season.ts`](src/lib/api/season.ts:1) module created
- [ ] Season API patterns simplified vs Draft complexity
- [ ] Error handling consistent across Season endpoints
- [ ] API caching strategy implemented

---

## 8. Risk & Regression Checklist

### Routing Regressions
- [ ] **Mode Toggle**: Switching between Draft/Season preserves state
- [ ] **Deep Links**: Direct navigation to Season Mode works
- [ ] **Browser Back/Forward**: Mode changes respect browser history
- [ ] **Refresh Persistence**: Page reload maintains current mode

### State Conflicts
- [ ] **Store Isolation**: Season changes don't affect Draft state
- [ ] **Persistence**: Season store persists independently
- [ ] **Memory Leaks**: Store subscriptions cleaned up properly
- [ ] **Concurrent Access**: Both stores accessible simultaneously

### Manual QA Checklist
- [ ] **Team Selection**: Opponent team dropdown populates correctly
- [ ] **Roster Loading**: My roster and opponent roster display in tables
- [ ] **Data Freshness**: Cache invalidation works as expected
- [ ] **Error States**: Network failures show appropriate messages
- [ ] **Loading States**: Spinners display during API calls
- [ ] **Toast Notifications**: Success/error toasts appear correctly

---

## 9. Work Packages (Sonnet vs Opus)

### Small Prompts for Sonnet-4
1. **"Extract Season Store"** - Move [`season: SeasonState`](src/state/draftStore.ts:74) and related actions to new [`seasonStore.ts`](src/state/seasonStore.ts:1)
2. **"Update Season Component Imports"** - Replace [`useDraftStore`](src/components/season/SeasonModeContainer.tsx:3) with [`useSeasonStore`](src/state/seasonStore.ts:1) in Season components
3. **"Fix App.tsx Routing"** - Update [`currentMode`](src/App.tsx:24) to use Season store instead of Draft store
4. **"Update ModeToggle Component"** - Modify [`ModeToggle.tsx`](src/components/common/ModeToggle.tsx:3) to access Season store for mode state

### Opus-4 Tasks (Marked)
- 🔴 **"Create Season API Module"** - Design and implement [`src/lib/api/season.ts`](src/lib/api/season.ts:1) with error handling patterns
- 🔴 **"Implement Season Store Persistence"** - Configure Zustand persistence for Season store with cache management
- 🔴 **"Refactor Lineup Shaping Logic"** - Implement deterministic 16-row lineup shaping with performance optimization

### Suggested Prompt Titles
- "Extract Season Mode Store from Monolithic Draft Store"
- "Update Season Components to Use Dedicated Store"
- "Implement Independent Season Mode Routing"
- "Create Season API Layer with Error Handling"
- "Add Season Store Persistence and Caching"
- "Optimize Roster Data Shaping Performance"

---

## 10. Appendix

### Interfaces/Types Examples

```typescript
// Season Store State Interface
interface SeasonStoreState {
  currentMode: 'draft' | 'season'
  availableTeams: SeasonTeam[]
  selectedOpponentTeam: SeasonTeam | null
  myRoster: ApiRosterPlayer[]
  opponentRoster: ApiRosterPlayer[]
  teamsLoading: boolean
  rostersLoading: boolean
  teamsError: string | null
  rostersError: string | null
  rosterCache: Record<string, CachedRoster>
  lastCacheUpdate: number
}

// Season API Response Types
interface SeasonApiResponse {
  teams: SeasonTeam[]
  rosters: Record<string, ApiRosterPlayer[]>
  lastUpdated: number
}

// Cached Roster Type
interface CachedRoster {
  teamId: string
  players: ApiRosterPlayer[]
  timestamp: number
  projectedTotal: number
}
```

### PrimeReact DataTable Render Cell Example

```typescript
// Custom cell renderer for player position
const positionTemplate = (rowData: RosterPlayer) => {
  const displayPosition = rowData.slotPosition.startsWith('BN') 
    ? 'BN' 
    : rowData.slotPosition
  
  return (
    <span className="position-badge">
      {displayPosition}
    </span>
  )
}

// Usage in DataTable
<Column 
  field="slotPosition" 
  header="Pos" 
  body={positionTemplate}
  style={{ width: '60px', textAlign: 'center' }}
/>
```

### Zustand Store Slice Example

```typescript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface SeasonStore {
  currentMode: 'draft' | 'season'
  teams: SeasonTeam[]
  setCurrentMode: (mode: 'draft' | 'season') => void
  fetchTeams: () => Promise<void>
}

export const useSeasonStore = create<SeasonStore>()(
  persist(
    (set, get) => ({
      currentMode: 'season',
      teams: [],
      
      setCurrentMode: (mode) => set({ currentMode: mode }),
      
      fetchTeams: async () => {
        try {
          const response = await fetch('/api/season/teams')
          const teams = await response.json()
          set({ teams })
        } catch (error) {
          console.error('Failed to fetch teams:', error)
        }
      }
    }),
    {
      name: 'season-store',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
```

---

**End of Audit Document**  
**Total Estimated Refactor Time:** 4-6 hours across phases  
**Primary Risk:** State synchronization during migration  
**Success Metric:** Season Mode operates independently of Draft Mode