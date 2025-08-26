# Offline Mode Implementation Documentation

## Overview

This document provides comprehensive technical documentation for the offline mode functionality implemented in the Boykies Fantasy Football application. The offline mode system allows the application to gracefully handle network connectivity issues by detecting offline-worthy errors, switching to offline mode, and providing reconnection capabilities.

## 1. Error Classification System

### Location
- **Primary Implementation**: [`src/lib/httpErrors.ts`](src/lib/httpErrors.ts)

### Core Functions

#### `classifyHttpFailure(status: number | undefined): ErrorClassification`
**Location**: [`src/lib/httpErrors.ts:15-38`](src/lib/httpErrors.ts:15-38)

Classifies HTTP failures to determine if they warrant switching to offline mode.

**Offline-Worthy Status Codes**:
- `undefined` or `0` - Network errors (no connection)
- `502` - Bad Gateway
- `503` - Service Unavailable  
- `504` - Gateway Timeout
- `408` - Request Timeout

**Non-Offline-Worthy Status Codes**:
- `400`, `401`, `403`, `404`, `409`, `422` - Client errors (permanent issues)
- `429` - Rate limiting (should not trigger offline mode)

#### `extractErrorStatus(error: unknown): number | undefined`
**Location**: [`src/lib/httpErrors.ts:71-128`](src/lib/httpErrors.ts:71-128)

Extracts HTTP status codes from various error formats, including:
- Direct status properties
- `blockingFetch()` error format: `{ error: { code: number } }`
- Special string codes: `'NETWORK'` → `0`, `'TIMEOUT'` → `408`
- Error messages with embedded status codes

#### `classifyError(error: unknown): ErrorClassification`
**Location**: [`src/lib/httpErrors.ts:156-159`](src/lib/httpErrors.ts:156-159)

Convenience function that combines error status extraction and classification.

### Error Classification Interface
```typescript
interface ErrorClassification {
  offlineWorthy: boolean;
  reason: string;
}
```

## 2. Critical API Calls Integration

### Draft Initialization
**File**: [`src/components/DraftConfigModal.tsx`](src/components/DraftConfigModal.tsx)  
**API Endpoint**: `/draft/initialize`  
**Integration Location**: Lines 179-183

```typescript
} catch (e: unknown) {
  const cls = classifyError(e);
  if (cls.offlineWorthy) {
    setOfflineMode(true);
    toast.current?.show({
      severity: 'warn',
      summary: 'Connection Issue',
      detail: 'Switched to Offline Mode. Draft configuration saved locally.',
      life: 5000
    });
    // Fallback to offline initialization
    initializeDraftOffline(config);
  } else {
    // Show specific error for non-offline-worthy errors
    toast.current?.show({
      severity: 'error',
      summary: 'Draft Initialization Failed',
      detail: `Failed (${cls.reason}). Check your configuration and try again.`,
      life: 5000
    });
  }
}
```

### Player Taken Endpoint
**File**: [`src/components/PlayersGrid.tsx`](src/components/PlayersGrid.tsx)  
**API Endpoint**: `/draft/player-taken`  
**Integration Location**: Lines 331-350

```typescript
} catch (e: unknown) {
  const cls = classifyError(e);
  if (cls.offlineWorthy) {
    setOfflineMode(true);
    toast.current?.show({
      severity: 'warn',
      summary: 'Connection Issue', 
      detail: 'Switched to Offline Mode.',
      life: 5000
    });
    // Continue with local player tracking
    markPlayerTaken(data.id, data, 'Player taken (offline)', activeConversationId);
  } else {
    toast.current?.show({
      severity: 'error',
      summary: 'Operation Failed',
      detail: `Failed (${cls.reason}). Check inputs and try again.`,
      life: 5000
    });
  }
}
```

### User Turn Endpoint  
**File**: [`src/components/PlayersGrid.tsx`](src/components/PlayersGrid.tsx)  
**API Endpoint**: `/draft/user-turn`  
**Integration Location**: Lines 693-720

```typescript
const cls = classifyError(e);
if (cls.offlineWorthy) {
  setOfflineMode(true);
  toast.current?.show({
    severity: 'warn',
    summary: 'Connection Issue',
    detail: 'Switched to Offline Mode. Your draft action was saved locally.',
    life: 5000
  });
  // Continue with local draft action
  draftPlayer(data.id);
} else {
  toast.current?.show({
    severity: 'error', 
    summary: 'Draft Failed',
    detail: `Failed (${cls.reason}). Check inputs and try again.`,
    life: 5000
  });
}
```

### Error Handling Pattern
All critical API calls follow this consistent pattern:
1. **Try** the API call
2. **Catch** any errors  
3. **Classify** the error using [`classifyError()`](src/lib/httpErrors.ts:156)
4. **If offline-worthy**: Switch to offline mode, show warning toast, continue with local fallback
5. **If not offline-worthy**: Show error toast with specific reason, halt operation

## 3. Reconnection Mechanism

### Marco/Polo Protocol
**Function**: [`pingMarco()`](src/lib/api.ts:132-138)  
**Location**: [`src/lib/api.ts:132-138`](src/lib/api.ts:132-138)

```typescript
export async function pingMarco(): Promise<boolean> {
  try {
    const res = await blockingFetch('/draft/marco', { user: getUserId() }, 15_000);
    const ans = (res?.answer ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return res?.ok === true && ans === 'Polo!';
  } catch { return false; }
}
```

**Configuration**:
- **Timeout**: 15 seconds (15,000ms)
- **Endpoint**: `/draft/marco`
- **Expected Response**: `"Polo!"` with `ok: true`
- **Error Handling**: Returns `false` on any failure

### Reconnection Flow
1. User clicks "Reconnect" button in [`OfflineBanner`](src/components/OfflineBanner.tsx)
2. [`pingMarco()`](src/lib/api.ts:132) is called with 15-second timeout
3. If successful (`"Polo!"` response), offline mode is disabled
4. If failed, user is notified to check connection
5. Button includes loading state to prevent rapid clicking

## 4. UI Components

### OfflineBanner Component
**File**: [`src/components/OfflineBanner.tsx`](src/components/OfflineBanner.tsx)

**Key Features**:
- Only displays when `isOfflineMode` is `true`
- Yellow warning styling with WiFi icon
- "Reconnect" button with loading state and spinner
- Toast notifications for reconnection success/failure
- 1-second delay after reconnection attempt to prevent rapid clicking

**Reconnection Logic** (Lines 20-55):
```typescript
const handleReconnect = async () => {
  setIsReconnecting(true);
  try {
    const isConnected = await pingMarco();
    if (isConnected) {
      setOfflineMode(false);
      // Success toast
    } else {
      // Still offline toast
    }
  } catch {
    // Connection failed toast  
  } finally {
    setTimeout(() => setIsReconnecting(false), 1000);
  }
};
```

### Header Component Offline Indicator
**File**: [`src/components/Header.tsx`](src/components/Header.tsx)  
**Location**: Lines 73-84

Displays an "Offline" tag next to the application title when in offline mode:

```typescript
{isOfflineMode && (
  <Tag
    value="Offline"
    severity="warning" 
    className="text-xs"
    style={{
      backgroundColor: 'rgba(255, 193, 7, 0.9)',
      color: '#856404',
      fontWeight: '600'
    }}
  />
)}
```

### AI Analysis Drawer
**File**: [`src/components/AIAnalysisDrawer.tsx`](src/components/AIAnalysisDrawer.tsx)  
**Location**: Line 49

The AI Analysis drawer checks `isOfflineMode` state to conditionally disable AI-related functionality when offline, since AI analysis requires server connectivity.

## 5. State Management

### Draft Store Configuration
**File**: [`src/state/draftStore.ts`](src/state/draftStore.ts)

#### Offline Mode State
```typescript
// Offline mode state
isOfflineMode: boolean;
showOfflineBanner: boolean;
pendingApiCalls: Array<{
  id: string;
  type: 'initializeDraft' | 'playerTaken' | 'userTurn';
  payload: Record<string, unknown>;
  timestamp: number;
}>;
```

#### Key Actions
- **`setOfflineMode(isOffline: boolean)`**: Controls offline state
- **`setShowOfflineBanner(show: boolean)`**: Controls banner visibility  
- **`addPendingApiCall(type, payload)`**: Stores failed API calls for potential retry
- **`initializeDraftOffline(config)`**: Offline fallback for draft initialization
- **`clearPendingApiCalls()`**: Clears pending API call queue

### LocalStorage Persistence
The draft store uses Zustand's `persist` middleware with `createJSONStorage()` to automatically persist offline state and pending API calls to localStorage, ensuring offline mode persists across browser sessions.

### State Transitions
```
Online → Offline:  API call fails with offline-worthy error
Offline → Online:  Successful pingMarco() response
Reset Draft:       Always returns to online mode (line 234)
```

## 6. Error Handling Patterns

### Standard Error Handling Flow
1. **API Call**: Attempt the network request
2. **Success Check**: Verify response doesn't contain error object
3. **Error Classification**: Use [`classifyError()`](src/lib/httpErrors.ts:156) on caught exceptions
4. **Conditional Response**:
   - **Offline-worthy**: Enable offline mode, show warning toast, continue with local fallback
   - **Not offline-worthy**: Show error toast with specific reason, halt operation

### Toast Message Categories

#### Offline Mode Activation
- **Severity**: `warn`
- **Summary**: "Connection Issue"  
- **Detail**: Context-specific message about switching to offline mode
- **Life**: 5000ms

#### Reconnection Success
- **Severity**: `success`
- **Summary**: "Reconnected"
- **Detail**: "Successfully reconnected to the server."
- **Life**: 3000ms

#### Reconnection Failure  
- **Severity**: `warn`
- **Summary**: "Still offline. Check your connection."
- **Detail**: Connection-specific failure message
- **Life**: 4000ms

#### API Errors (Non-offline)
- **Severity**: `error`
- **Summary**: Operation-specific summary
- **Detail**: Formatted error with reason from classification
- **Life**: 4000-5000ms

### Offline Fallback Behaviors

#### Draft Initialization
- Save configuration locally via [`initializeDraftOffline()`](src/state/draftStore.ts)
- Show info toast: "Draft Initialized (Offline)"
- Disable AI analysis features

#### Player Actions
- Continue with local player tracking
- Add "(offline)" suffix to confirmation messages
- Maintain draft state consistency locally

## 7. Implementation Files Summary

### Core Files Modified/Created

#### New Files
- **[`src/lib/httpErrors.ts`](src/lib/httpErrors.ts)** - Complete error classification system
- **[`src/components/OfflineBanner.tsx`](src/components/OfflineBanner.tsx)** - Offline mode banner with reconnection

#### Modified Files
- **[`src/lib/api.ts`](src/lib/api.ts)** - Added [`pingMarco()`](src/lib/api.ts:132) reconnection function
- **[`src/components/DraftConfigModal.tsx`](src/components/DraftConfigModal.tsx)** - Integrated offline error handling for draft initialization
- **[`src/components/PlayersGrid.tsx`](src/components/PlayersGrid.tsx)** - Added offline error handling for player-taken and user-turn APIs
- **[`src/components/Header.tsx`](src/components/Header.tsx)** - Added offline mode indicator
- **[`src/components/AIAnalysisDrawer.tsx`](src/components/AIAnalysisDrawer.tsx)** - Added offline mode awareness
- **[`src/state/draftStore.ts`](src/state/draftStore.ts)** - Extended with offline mode state and actions
- **[`src/App.tsx`](src/App.tsx)** - Added offline mode handling for initial player loading

### Key Functions and Integration Points

#### Error Classification Functions
- **[`classifyError()`](src/lib/httpErrors.ts:156)** - Main error classification entry point
- **[`classifyHttpFailure()`](src/lib/httpErrors.ts:15)** - HTTP status code classification  
- **[`extractErrorStatus()`](src/lib/httpErrors.ts:71)** - Status code extraction from various error formats

#### State Management Functions
- **[`setOfflineMode()`](src/state/draftStore.ts)** - Central offline mode toggle
- **[`pingMarco()`](src/lib/api.ts:132)** - Connectivity testing
- **[`initializeDraftOffline()`](src/state/draftStore.ts)** - Offline draft initialization fallback

#### UI Integration Points
- **DraftConfigModal**: Lines 29-31, 179-200 (offline mode state and error handling)
- **PlayersGrid**: Lines 75-77, 331-350, 583-585, 693-720 (offline mode state and error handling)  
- **OfflineBanner**: Lines 12-13, 26-27 (offline mode state and reconnection)
- **Header**: Lines 17, 73-84 (offline mode state and indicator)

### Component Dependencies
```
App.tsx → OfflineBanner.tsx → pingMarco() → classifyError()
     ↓                     ↓
DraftConfigModal.tsx → classifyError() → httpErrors.ts
     ↓
PlayersGrid.tsx → classifyError() → httpErrors.ts
     ↓
draftStore.ts (offline state management)
```

## Integration Testing

### Test Scenarios
1. **Network Disconnection**: Verify automatic offline mode activation
2. **Server Errors**: Test 502/503/504 responses trigger offline mode  
3. **Client Errors**: Verify 4xx errors don't trigger offline mode
4. **Reconnection**: Test marco/polo protocol and UI state updates
5. **Persistence**: Verify offline state survives browser refresh
6. **Fallback Functions**: Test local draft operations work in offline mode

### Error Simulation
To test offline mode behavior, simulate network errors by:
- Disconnecting network connection
- Using browser dev tools to simulate server errors
- Modifying [`pingMarco()`](src/lib/api.ts:132) to always return `false`
- Blocking specific API endpoints in network tab

This implementation provides robust offline functionality while maintaining a consistent user experience and preserving draft data integrity across connectivity interruptions.