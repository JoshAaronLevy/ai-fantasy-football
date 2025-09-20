# API Bug Audit Report: Duplicate Roster API Calls

## Executive Summary

This report documents a persistent issue with duplicate console logs and network requests occurring during page load in the fantasy football React application. Despite implementing multiple guard mechanisms, the application continues to exhibit duplicate [`console.trace()`](src/state/seasonStore.ts:225) calls and corresponding API requests to fetch roster data.

**Severity**: Medium  
**Impact**: Performance degradation, unnecessary network traffic, potential race conditions  
**Status**: Unresolved after multiple attempted fixes  

## Technical Details

### Code Structure Overview

The roster data flow follows this pattern:

1. **Entry Point**: [`SeasonModeContainer`](src/components/season/SeasonModeContainer.tsx:19-31) component mounts
2. **Store Initialization**: [`useSeasonStore.initializeSeasonMode()`](src/state/seasonStore.ts:208-249) called
3. **API Request**: [`fetchRosterWithMatchups()`](src/lib/api/season.ts:27-34) executes
4. **State Update**: Roster data stored in Zustand store and localStorage

### Key Components and Responsibilities

- **[`seasonStore.ts`](src/state/seasonStore.ts)**: Zustand store managing season state and roster data
- **[`SeasonModeContainer.tsx`](src/components/season/SeasonModeContainer.tsx)**: Main container triggering initialization
- **[`season.ts`](src/lib/api/season.ts)**: API layer handling roster requests
- **[`main.tsx`](src/main.tsx:33)**: React application entry point with StrictMode enabled

## Problem Description

### Symptoms
- Duplicate [`console.trace()`](src/state/seasonStore.ts:225) logs fire consecutively on page load
- Two separate GET requests appear in browser network tab for the same roster endpoint
- Both requests target the same URL pattern: `/api/v1/roster/boykies/{week}`

### Problematic Log Location
The duplicate logging occurs in [`seasonStore.ts`](src/state/seasonStore.ts:225-229):

```typescript
console.trace('[ROSTER] Page load - roster loaded from cache:', JSON.stringify({
  week: selectedWeek,
  playerCount: migrated.length,
  players: migrated.slice(0, 2)
}, null, 2));
```

## Investigation History

### 1. React StrictMode Investigation ❌
**Attempted Fix**: Initially suspected React StrictMode double-invocation in development
**Implementation**: Confirmed [`React.StrictMode`](src/main.tsx:33) is enabled
**Result**: Issue persists; StrictMode may be contributing but guard mechanisms should prevent duplicates

### 2. Module-Level Guard Implementation ❌
**Attempted Fix**: Added [`isInitializingSeasonMode`](src/state/seasonStore.ts:9) module-level flag
**Implementation**: 
```typescript
// Module-level flag for truly synchronous duplicate prevention
let isInitializingSeasonMode = false;
```
**Guard Logic**: Lines [210-212](src/state/seasonStore.ts:210-212) and [215](src/state/seasonStore.ts:215), [247](src/state/seasonStore.ts:247)
**Result**: Failed to prevent duplicates

### 3. Store-Level State Guard ❌
**Attempted Fix**: Added [`isInitializing`](src/state/seasonStore.ts:27) state property to Zustand store
**Implementation**:
```typescript
isInitializing: boolean; // Line 27
isInitializing: false,   // Line 62
```
**Guard Usage**: [`fetchUserRoster`](src/state/seasonStore.ts:253-257) checks this flag
**Result**: Issue persists

### 4. Diagnostic Logging Enhancement ❌
**Attempted Fix**: Changed `console.log` to [`console.trace`](src/state/seasonStore.ts:225) for call stack visibility
**Purpose**: Identify the source of duplicate calls
**Result**: Trace added but duplicates still occur

## Current State Analysis

### Guard Mechanisms in Place

1. **Module-Level Flag**: [`isInitializingSeasonMode`](src/state/seasonStore.ts:9)
   - Set to `true` at start of [`initializeSeasonMode`](src/state/seasonStore.ts:215)
   - Reset to `false` in [`finally` block](src/state/seasonStore.ts:247)
   - Early return if already `true` ([lines 210-212](src/state/seasonStore.ts:210-212))

2. **Store State Flag**: [`isInitializing`](src/state/seasonStore.ts:27)
   - Set to `true` during initialization ([line 217](src/state/seasonStore.ts:217))
   - Set to `false` when complete ([line 245](src/state/seasonStore.ts:245))
   - Prevents [`fetchUserRoster`](src/state/seasonStore.ts:253-257) during init

3. **Conditional Initialization**: [`SeasonModeContainer`](src/components/season/SeasonModeContainer.tsx:20)
   - Only calls `initializeSeasonMode` when `availableTeams.length === 0`
   - Additional checks for `!teamsLoading && !teamsError`

### Data Flow Paths

**Cache Hit Path**: [Lines 221-229](src/state/seasonStore.ts:221-229)
```typescript
const stored = getJSON(LS_KEYS.roster('local', selectedWeek), null);
if (stored) {
  const migrated = migratePlayersFromStorage(stored);
  set({ userRoster: migrated });
  console.trace('[ROSTER] Page load - roster loaded from cache:', ...);
}
```

**Cache Miss Path**: [Lines 231-239](src/state/seasonStore.ts:231-239)
```typescript
const roster = await fetchRosterWithMatchups('boykies', selectedWeek);
setJSON(LS_KEYS.roster('local', selectedWeek), roster);
set({ userRoster: roster });
console.log('[ROSTER] Page load - roster fetched fresh:', ...);
```

## Potential Root Causes

### 1. React 18 Concurrent Features
React 18's concurrent rendering might cause multiple component mount attempts, potentially bypassing synchronous guards if state updates occur between guard checks.

### 2. Zustand Store Subscription Issues
Multiple components might be subscribing to the store and triggering re-initialization:
- [`SeasonModeContainer`](src/components/season/SeasonModeContainer.tsx:16) subscribes to `initializeSeasonMode`
- [`WeekSelector`](src/components/season/WeekSelector.tsx:12) subscribes to `setSelectedWeek`
- Other components may have indirect subscriptions

### 3. useEffect Dependency Array Issues
The [`useEffect`](src/components/season/SeasonModeContainer.tsx:19-31) in SeasonModeContainer depends on:
```typescript
[availableTeams.length, teamsLoading, teamsError, initializeSeasonMode, toast]
```
If `initializeSeasonMode` reference changes, it could trigger re-execution.

### 4. Race Condition in Module-Level Flag
The module-level flag might not be sufficient if multiple React renders occur simultaneously:
```typescript
if (isInitializingSeasonMode) return; // Check
isInitializingSeasonMode = true;      // Set
```
A race condition could occur between check and set operations.

### 5. Component Re-mounting
React StrictMode or router navigation might cause [`SeasonModeContainer`](src/components/season/SeasonModeContainer.tsx) to mount/unmount/remount rapidly, each time triggering initialization.

### 6. Week Selection Side Effects
The [`setSelectedWeek`](src/state/seasonStore.ts:64-69) function calls [`fetchUserRoster()`](src/state/seasonStore.ts:68), which might interact poorly with the initialization process:
```typescript
setSelectedWeek: (w: number) => {
  setJSON(LS_KEYS.week, w);
  set({ selectedWeek: w });
  useSeasonStore.getState().fetchUserRoster(); // Could cause issues during init
},
```

## Suggested Next Steps

### 1. Enhanced Debug Logging
Add more granular logging to identify the exact call sequence:
```typescript
console.trace('[ROSTER] initializeSeasonMode called', {
  isInitializingModule: isInitializingSeasonMode,
  isInitializingStore: useSeasonStore.getState().isInitializing,
  availableTeamsLength: useSeasonStore.getState().availableTeams.length,
  timestamp: Date.now()
});
```

### 2. React 18 useId Hook Implementation
Use React 18's `useId()` hook to create component-specific initialization tracking:
```typescript
const componentId = useId();
const initializeSeasonModeOnce = useCallback(() => {
  console.log('[ROSTER] Init attempt from component:', componentId);
  return initializeSeasonMode();
}, [componentId, initializeSeasonMode]);
```

### 3. AbortController Integration
Implement request cancellation to handle rapid successive calls:
```typescript
export async function fetchRosterWithMatchups(
  teamName: string, 
  weekNumber: number, 
  signal?: AbortSignal
): Promise<ApiPlayer[]> {
  const res = await fetch(buildRosterUrl(teamName, weekNumber), { signal });
  // ... rest of implementation
}
```

### 4. Ref-Based Guard Enhancement
Replace module-level flag with a ref-based approach:
```typescript
const initializationRef = useRef<Promise<void> | null>(null);

const initializeSeasonMode = useCallback(async () => {
  if (initializationRef.current) {
    return initializationRef.current;
  }
  
  initializationRef.current = performInitialization();
  try {
    await initializationRef.current;
  } finally {
    initializationRef.current = null;
  }
}, []);
```

### 5. Zustand Subscription Audit
Add logging to track all store subscriptions and their triggers:
```typescript
const originalSubscribe = useSeasonStore.subscribe;
useSeasonStore.subscribe = (listener) => {
  console.log('[STORE] New subscription:', listener.name || 'anonymous');
  return originalSubscribe(listener);
};
```

### 6. Component Lifecycle Monitoring
Add mount/unmount logging to [`SeasonModeContainer`](src/components/season/SeasonModeContainer.tsx):
```typescript
useEffect(() => {
  console.log('[COMPONENT] SeasonModeContainer mounted');
  return () => console.log('[COMPONENT] SeasonModeContainer unmounted');
}, []);
```

### 7. Network Request Deduplication
Implement request-level deduplication using a request cache or React Query:
```typescript
const activeRequests = new Map<string, Promise<ApiPlayer[]>>();

export async function fetchRosterWithMatchups(teamName: string, weekNumber: number): Promise<ApiPlayer[]> {
  const key = `${teamName}-${weekNumber}`;
  if (activeRequests.has(key)) {
    return activeRequests.get(key)!;
  }
  
  const promise = performFetch(teamName, weekNumber);
  activeRequests.set(key, promise);
  
  try {
    return await promise;
  } finally {
    activeRequests.delete(key);
  }
}
```

## Recommendations

1. **Immediate**: Implement enhanced debug logging to identify the exact call sequence
2. **Short-term**: Add React 18 `useId()` hook for component-specific tracking
3. **Medium-term**: Implement AbortController for request cancellation
4. **Long-term**: Consider migrating to React Query or SWR for better request deduplication and caching

The combination of React StrictMode, Zustand store subscriptions, and component lifecycle interactions likely creates a complex scenario where multiple initialization attempts occur despite guard mechanisms. A systematic approach with enhanced logging should reveal the exact cause.