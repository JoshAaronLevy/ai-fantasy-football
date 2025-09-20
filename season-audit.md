# Season Mode Architecture Report

## Overview

This document provides a comprehensive analysis of the season mode functionality within the fantasy football application. The season mode enables roster management, opponent comparison, and fantasy analysis capabilities separate from the draft mode functionality.

## Core Architecture

### 1. State Management - Zustand Store

**Location**: [`src/state/seasonStore.ts`](src/state/seasonStore.ts)

The season mode uses a dedicated Zustand store with persistence middleware for state management:

#### Key State Properties:
- **`currentMode`** (line 69): Controls whether app is in 'draft' or 'season' mode
- **`availableTeams`** (line 70): Array of [`SeasonTeam`](src/types.ts:145-150) objects representing fantasy teams
- **`selectedOpponentTeam`** (line 71): Currently selected opponent for comparison
- **`userRoster`** (line 74-79): User's roster data as [`RosterApiPlayer[]`](src/types.ts:20-30)
- **`boykiesRoster`** (line 72): Transformed roster data for Boykies team
- **`opponentRoster`** (line 73): Transformed roster data for selected opponent
- **`selectedWeek`** (line 87-91): Current NFL week selection (1-18)
- **`rosterCache`** (line 85): Caches roster data by team ID to reduce API calls

#### Key Store Actions:
- **`initializeSeasonMode()`** (line 160-221): Primary initialization method
- **`fetchUserRoster()`** (line 382-472): Loads user roster from API with fallback to mock data
- **`fetchRosterComparison()`** (line 264-379): Loads comparison data for selected teams
- **`setSelectedWeek()`** (line 112-127): Updates week and triggers data refresh

### 2. Data Types and Interfaces

**Location**: [`src/types.ts`](src/types.ts)

#### Core Player Data Structure:
```typescript
// Primary API player format (lines 20-30)
interface RosterApiPlayer {
  id?: string;
  name: string;
  position?: string;
  pos?: string;
  team: { abbr: string; logoUrl?: string } | string;
  starter?: boolean;
  matchup?: RosterMatchup;
  projectedPoints?: number;
}

// Matchup information (lines 9-18)
interface RosterMatchup {
  week: number;
  type?: 'home' | 'away';
  opponent?: TeamRef;
  kickoff?: string;
  projectedScore?: string;
  finalScore?: string;
  bye?: boolean;
  projectedPoints?: number | { default: number | null; llm: number };
}
```

#### Internal Roster Structure:
```typescript
// Transformed roster for internal use (lines 152-162)
interface RosterPlayer {
  id: string;
  name: string;
  position: string;
  team: Team;
  projectedPoints: number | null;
  isStarter: boolean;
  slotPosition: 'QB' | 'RB1' | 'RB2' | 'WR1' | 'WR2' | 'TE' | 'FLEX' | 'K' | 'DST' | 'BN1' | 'BN2' | 'BN3' | 'BN4' | 'BN5' | 'BN6' | 'BN7';
  matchup?: Matchup;
  opponent?: string;
}
```

### 3. API Integration

#### Primary Season API
**Location**: [`src/lib/api/season.ts`](src/lib/api/season.ts)

- **`fetchRosterWithMatchups()`** (line 22-62): GET request to `/api/roster/boykies/matchups/1`
- **`fetchSchedule()`** (line 71-103): GET request to `/api/schedule/{weekNumber}`
- **`analyzeRoster()`** (line 112-136): POST request to `/api/roster/analyze` for Dify analysis
- **`ensureProjectedPoints()`** (line 146-155): Ensures projected points exist for analysis

#### Roster Analysis API
**Location**: [`src/lib/api/roster.ts`](src/lib/api/roster.ts)

- **`analyzeRosterBlocking()`** (line 16-37): POST to `/api/v1/roster/analyze`
- **`prepareRosterForAnalysis()`** (line 81-95): Normalizes roster data for API consumption

### 4. Component Architecture

#### Main Container
**Location**: [`src/components/season/SeasonModeContainer.tsx`](src/components/season/SeasonModeContainer.tsx)

- Initializes season mode on mount (line 19-31)
- Renders [`WeekSelector`](src/components/season/WeekSelector.tsx), [`TeamSelector`](src/components/season/TeamSelector.tsx), and [`RosterComparison`](src/components/season/RosterComparison.tsx)
- Handles loading states and error display

#### Week Selection
**Location**: [`src/components/season/WeekSelector.tsx`](src/components/season/WeekSelector.tsx)

- PrimeReact Dropdown for weeks 1-18 (line 16-19)
- Calls [`setSelectedWeek()`](src/state/seasonStore.ts:112-127) which triggers data refresh

#### Team Selection  
**Location**: [`src/components/season/TeamSelector.tsx`](src/components/season/TeamSelector.tsx)

- Dropdown for opponent selection (excludes Boykies team)
- Handles team change via [`handleTeamChange()`](src/components/season/TeamSelector.tsx:20-38)
- Triggers [`fetchRosterComparison()`](src/state/seasonStore.ts:264-379)

#### Roster Display and Analysis
**Location**: [`src/components/season/RosterTable.tsx`](src/components/season/RosterTable.tsx)

**Features**:
- PrimeReact DataTable with checkbox selection (line 139-152)
- Position filtering via clickable position buttons (line 81-106)
- Player, team, and opponent logo display
- Projected points display with LLM/default fallback (line 216-225)
- Default points input for manual overrides (line 228-251)

**Selection Logic**:
- User table enables multi-select with position focus (line 138-252)
- Opponent table is read-only (line 253-350)
- Position emphasis highlighting (line 120-125)

### 5. Data Flow Architecture

#### Initialization Flow:
1. [`SeasonModeContainer`](src/components/season/SeasonModeContainer.tsx:19-31) calls [`initializeSeasonMode()`](src/state/seasonStore.ts:160-221)
2. Store loads roster from localStorage via [`loadRosterDataFromStorage()`](src/state/seasonStore.ts:475-524)
3. If no local data, calls [`fetchUserRoster()`](src/state/seasonStore.ts:382-472)
4. API call to [`fetchRosterWithMatchups()`](src/lib/api/season.ts:22-62)
5. Data processed via [`ensureProjectedPoints()`](src/lib/api/season.ts:146-155)
6. Stored in state and localStorage via [`saveUserRosterToStorage()`](src/state/seasonStore.ts:526-539)

#### Week/Team Selection Flow:
1. User selects week via [`WeekSelector`](src/components/season/WeekSelector.tsx:21-25)
2. Calls [`setSelectedWeek()`](src/state/seasonStore.ts:112-127) which:
   - Updates localStorage via [`setJSON()`](src/lib/storage/localStore.ts:36-37)
   - Fetches schedule data via [`fetchScheduleData()`](src/state/seasonStore.ts:598-658)
   - Re-fetches roster data for current selections
3. Team selection via [`TeamSelector`](src/components/season/TeamSelector.tsx:20-38) triggers [`fetchRosterComparison()`](src/state/seasonStore.ts:264-379)

#### Analysis Flow:
1. [`RosterComparison`](src/components/season/RosterComparison.tsx:36-42) converts [`RosterApiPlayer`](src/types.ts:20-30) to [`ApiPlayer`](src/types.ts:255-269) format
2. Calls [`useRosterAnalysisStream`](src/hooks/useRosterAnalysisStream.ts:15-28) hook
3. Hook uses [`analyzeRosterBlocking()`](src/lib/api/roster.ts:16-37) for analysis
4. Results stored as [`AnalyzeResponse`](src/types.ts:278-281) in store state

### 6. Data Persistence

#### localStorage Integration
**Location**: [`src/lib/storage/localStore.ts`](src/lib/storage/localStore.ts)

**Key Functions**:
- **`getJSON()`** / **`setJSON()`** (line 27-37): Namespaced JSON storage with `app.` prefix
- **`getUserId()`** (line 6-13): Persistent user identification

**Persistent Data**:
- **`userRoster`**: User's roster data ([`saveUserRosterToStorage()`](src/state/seasonStore.ts:526-539))
- **`seasonSelectedWeek`**: Current week selection
- **Schedule cache**: Cached by week number with timestamps

#### Cache Management:
- **Roster cache** (line 37 in seasonStore): In-memory cache by team ID  
- **Schedule cache** (line 58 in seasonStore): Persisted cache with timestamps
- **Legacy data cleanup** via [`cleanupLegacyRosterData()`](src/state/seasonStore.ts:576-590)

### 7. Lineup Transformation

**Location**: [`src/season/lib/shapeLineup.ts`](src/season/lib/shapeLineup.ts)

The [`shapeLineup()`](src/season/lib/shapeLineup.ts:17-120) function transforms raw player arrays into structured fantasy lineups:

- **Defined positions** (line 3): `['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DST', 'BN', ...]`
- **Starter prioritization** (line 82-95): Prefers players marked as starters
- **FLEX logic** (line 98-111): RB/WR/TE eligible, prioritizes starters
- **Opponent display** (line 35-40): Shows "@TEAM" for away games, "TEAM" for home

**Hook Integration**: [`useShapedLineup()`](src/season/hooks/useShapedLineup.ts) provides React integration with memoization and team filtering.

### 8. Team Data Management

**Location**: [`src/lib/teams/nflTeams.ts`](src/lib/teams/nflTeams.ts)

- **32 NFL teams** (line 8-56) with abbreviations, logos, cities, and names
- **`getTeamByAbbr()`** (line 63-65): Lookup function for team data
- **ESPN CDN integration**: Logo URLs from ESPN's team logo service

### 9. Mock Data Strategy

The application includes comprehensive mock data fallbacks:

- **Team roster data** (line 321-352 in [`seasonStore.ts`](src/state/seasonStore.ts)): Complete 16-player rosters
- **User roster data** (line 418-441 in [`seasonStore.ts`](src/state/seasonStore.ts)): Boykies team mock data
- **Schedule data fallbacks**: Ensures functionality when API unavailable

### 10. Error Handling and Loading States

#### Loading State Management:
- **`teamsLoading`** / **`rostersLoading`**: Component-level loading indicators
- **`teamsError`** / **`rostersError`**: Error state with user feedback
- **Toast notifications**: Error display via PrimeReact Toast component

#### API Error Handling:
- **Graceful degradation**: Falls back to mock data on API failures
- **Error logging**: Comprehensive console logging for debugging
- **Retry logic**: Built into store actions with fallback strategies

## Current Dependencies

### Key Libraries:
- **Zustand**: State management with persistence
- **PrimeReact**: UI components (DataTable, Dropdown, InputNumber, Button)
- **React**: Component framework with hooks

### External Integrations:
- **ESPN CDN**: Team logo hosting
- **Dify API**: Roster analysis via `/api/roster/analyze`
- **Custom Backend**: Roster and schedule data via `/api/roster/` and `/api/schedule/`

## Summary

The season mode architecture provides a robust foundation for fantasy football roster management with clear separation of concerns, comprehensive error handling, and efficient data caching. The system supports both online and offline operation through localStorage persistence and mock data fallbacks, ensuring consistent user experience regardless of API availability.