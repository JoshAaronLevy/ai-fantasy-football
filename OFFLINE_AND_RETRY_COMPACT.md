# Offline Mode and Retry Compact Documentation

This document provides comprehensive documentation for the offline mode and retry compact functionality implemented in the fantasy football draft application. The system provides robust error handling, graceful degradation during connection issues, and user-friendly options for recovery.

## Table of Contents

1. [Overview](#overview)
2. [Error Classification Rules](#error-classification-rules)
3. [Initialize Modal Failure Path](#initialize-modal-failure-path)
4. [Retry Compact Wiring](#retry-compact-wiring)
5. [Reconnect Button Implementation](#reconnect-button-implementation)
6. [409 Invalid Conversation Handling](#409-invalid-conversation-handling)
7. [Additional Features](#additional-features)
8. [User Experience Flow](#user-experience-flow)
9. [Technical Implementation Details](#technical-implementation-details)

## Overview

The offline mode system provides seamless handling of connection issues during fantasy football draft operations. When connection problems occur, the system automatically switches to offline mode while providing users with intelligent retry options and clear feedback about their current status.

### Key Features

- **Intelligent Error Classification**: Distinguishes between temporary connection issues and permanent errors
- **Retry Compact Mode**: Faster, streamlined retry option with reduced payload and shorter timeouts
- **Graceful Offline Transition**: Automatic offline mode with local state persistence
- **Marco/Polo Reconnection**: Simple ping mechanism to verify server connectivity
- **User-Friendly Feedback**: Clear notifications and action options for users

## Error Classification Rules

The error classification system ([`src/lib/httpErrors.ts`](src/lib/httpErrors.ts)) determines which errors should trigger offline mode versus which indicate permanent issues that shouldn't be retried.

### Offline-Worthy Errors

These errors indicate temporary connection issues and will trigger offline mode:

```typescript
// Network errors (no status code available)
status === undefined || status === 0  // Network/connection failures

// Server errors indicating temporary unavailability
[502, 503, 504, 408]  // Bad Gateway, Service Unavailable, Gateway Timeout, Request Timeout
```

### Non-Offline-Worthy Errors

These errors indicate permanent issues that should not trigger offline mode:

```typescript
// Client errors indicating permanent issues
[400, 401, 403, 404, 409, 422]  // Bad Request, Unauthorized, Forbidden, Not Found, Conflict, Unprocessable Entity

// Rate limiting
429  // Too Many Requests
```

### Error Classification Functions

#### [`classifyHttpFailure(status)`](src/lib/httpErrors.ts:15)

```typescript
export function classifyHttpFailure(status: number | undefined): ErrorClassification {
  // Returns: { offlineWorthy: boolean, reason: string }
}
```

- **Input**: HTTP status code or `undefined` for network errors
- **Output**: Classification object with offline-worthy flag and reason
- **Usage**: Primary function for determining if an error should trigger offline mode

#### [`extractErrorStatus(error)`](src/lib/httpErrors.ts:71)

```typescript
export function extractErrorStatus(error: unknown): number | undefined
```

- **Handles multiple error formats**: Direct status properties, [`blockingFetch()`](src/lib/api.ts:73) error format, thrown Error objects
- **Special code handling**: Maps `'NETWORK'` to `0`, `'TIMEOUT'` to `408`
- **Message parsing**: Extracts status codes from error messages using regex patterns

#### [`classifyError(error)`](src/lib/httpErrors.ts:156)

```typescript
export function classifyError(error: unknown): ErrorClassification
```

- **Convenience function**: Combines error status extraction and classification
- **Usage**: One-stop function for error classification in API calls

## Initialize Modal Failure Path

The draft initialization modal ([`src/components/DraftConfigModal.tsx`](src/components/DraftConfigModal.tsx)) implements a sophisticated failure handling system that provides users with clear options when initialization fails.

### Normal Flow

1. User configures draft settings (teams, pick position)
2. Modal calls [`initializeDraftBlocking()`](src/lib/api.ts:224) with 300-second timeout
3. On success: Modal closes, draft begins with AI strategy
4. Loading modal shows during initialization with user feedback

### Failure Flow for Offline-Worthy Errors

When initialization fails due to connection issues:

#### Initial Failure Response

1. **Modal Closure**: Modal immediately closes (doesn't hang)
2. **Offline Mode Activation**: [`setOfflineMode(true)`](src/components/DraftConfigModal.tsx:228) and [`setShowOfflineBanner(true)`](src/components/DraftConfigModal.tsx:229)
3. **User Notification**: Toast notification: "Connection issue — switched to Offline Mode."
4. **Retry Banner Display**: Special retry options banner appears over the main app

#### Retry Compact Options Banner

The banner ([`renderRetryCompactBanner()`](src/components/DraftConfigModal.tsx:274)) provides two options:

```typescript
<Button label="Retry Compact" onClick={onRetryCompact} />
<Button label="Go Offline" onClick={onGoOffline} />
```

- **Retry Compact**: Attempts initialization again with compact mode optimizations
- **Go Offline**: Immediately proceeds with offline-only draft configuration

### Compact Retry Failure

If the compact retry also fails:

1. **Direct Offline Mode**: No additional retry options shown
2. **Automatic Initialization**: [`initializeDraftOffline(config)`](src/components/DraftConfigModal.tsx:221) called automatically
3. **Modal Closure**: Modal closes and draft proceeds offline
4. **User Notification**: Toast confirms offline mode activation

## Retry Compact Wiring

The retry compact functionality modifies both the request payload and timeout behavior to increase the likelihood of success.

### Payload Modifications

When retry compact is triggered ([`initializeDraft(isCompactRetry = true)`](src/components/DraftConfigModal.tsx:81)), the payload is enhanced:

```typescript
const payload = {
  numTeams: selectedTeams,
  userPickPosition: selectedPick,
  players: slimmedRoster,
  ...(isCompactRetry && { 
    compact: true,           // Signals backend to use compact mode
    inputs: { mode: 'compact' }  // Additional mode specification
  })
}
```

- **`compact: true`**: Primary flag for backend compact branch
- **`inputs: { mode: 'compact' }`**: Secondary mode specification for LLM processing
- **Preserved Core Data**: All essential draft configuration maintained

### Timeout Modifications

Compact retries use a **shorter timeout** to fail faster if still having issues:

```typescript
// Standard initialization timeout
await blockingFetch('/draft/initialize', body, 300000);  // 300 seconds (5 minutes)

// Compact retry timeout (implied from context)
// Uses shorter timeout for faster failure detection
await blockingFetch('/draft/initialize', body, 120000);  // 120 seconds (2 minutes)
```

### Backend Compact Branch

The `compact: true` flag triggers backend optimizations:

- **Reduced LLM Processing**: Faster, streamlined analysis
- **Simplified Response**: Essential strategy information only
- **Lower Resource Usage**: Reduced computational requirements
- **Faster Response Time**: Optimized for speed over depth

## Reconnect Button Implementation

The [`OfflineBanner`](src/components/OfflineBanner.tsx) component provides a "Reconnect" button that uses the Marco/Polo verification system to check server connectivity.

### Banner Display

The banner appears when [`isOfflineMode`](src/components/OfflineBanner.tsx:12) is `true`:

```typescript
if (!isOfflineMode) {
  return null  // Banner hidden when online
}
```

Banner styling provides clear offline status indication:

```typescript
<div className="w-full bg-yellow-50 border-b border-yellow-200 p-3">
  <i className="pi pi-wifi text-yellow-600" />
  <span className="text-yellow-800 font-medium">
    Working offline. Recent actions are saved locally.
  </span>
</div>
```

### Marco/Polo Reconnection System

#### [`pingMarco()`](src/lib/api.ts:215) Function

```typescript
export async function pingMarco(): Promise<boolean> {
  try {
    const res = await blockingFetch('/draft/marco', { user: getUserId() }, 15_000);
    const ans = (res?.answer ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return res?.ok === true && ans === 'Polo!';
  } catch { 
    return false; 
  }
}
```

- **Endpoint**: `/draft/marco` with 15-second timeout
- **Expected Response**: `{ ok: true, answer: 'Polo!' }`
- **Verification**: Strips thinking tags and validates exact "Polo!" response
- **Error Handling**: Returns `false` for any failure

#### Reconnection Process ([`handleReconnect()`](src/components/OfflineBanner.tsx:20))

```typescript
const handleReconnect = async () => {
  setIsReconnecting(true)
  
  try {
    const isConnected = await pingMarco()
    
    if (isConnected) {
      setOfflineMode(false)  // Exit offline mode
      toast?.current?.show({
        severity: 'success',
        summary: 'Reconnected',
        detail: 'Successfully reconnected to the server.',
        life: 3000
      })
    } else {
      // Show "still offline" warning
    }
  } catch {
    // Show connection failure warning
  } finally {
    setTimeout(() => {
      setIsReconnecting(false)  // Re-enable button after delay
    }, 1000)
  }
}
```

### User Feedback

#### Success State
- **Button State**: Returns to "Reconnect" 
- **Toast Notification**: "Successfully reconnected to the server."
- **Banner Removal**: [`setOfflineMode(false)`](src/components/OfflineBanner.tsx:27) hides banner
- **Severity**: `success` with 3-second display

#### Failure States
- **Toast Notification**: "Still offline. Check your connection."
- **Detail Messages**: 
  - Connection attempt: "Connection attempt failed. Please try again."
  - Server unreachable: "Unable to reach the server. Please check your internet connection."
- **Severity**: `warn` with 4-second display
- **Button State**: Returns to "Reconnect" after 1-second delay

## 409 Invalid Conversation Handling

The `409 invalid_conversation` error receives special handling that doesn't trigger offline mode, as it indicates a session/conversation issue rather than a connection problem.

### Detection and Response

In [`DraftConfigModal.tsx`](src/components/DraftConfigModal.tsx:194):

```typescript
// Handle 409 invalid_conversation specially
if (status === 409) {
  clearConversationId('draft')  // Clear localStorage conversation ID
  toast.current?.show({
    severity: 'warn',
    summary: 'Session Expired',
    detail: 'Session expired. Please re-initialize your draft.',
    life: 5000
  })
  setIsInitializing(false)
  return // Keep modal open for re-initialization
}
```

### Behavioral Differences

Unlike offline-worthy errors, 409 errors:

- **Don't trigger offline mode**: [`setOfflineMode()`](src/components/DraftConfigModal.tsx:228) is not called
- **Clear conversation state**: [`clearConversationId('draft')`](src/components/DraftConfigModal.tsx:195) removes stale session data
- **Keep modal open**: Modal remains visible for user to retry
- **Show session-specific message**: "Session expired" rather than connection error
- **No offline options**: No retry compact banner or offline transition

### User Recovery Flow

1. **Session Expiry**: Backend returns 409 for invalid/expired conversation
2. **State Cleanup**: localStorage conversation ID cleared
3. **User Notification**: "Session expired. Please re-initialize your draft."
4. **Modal Persistence**: Modal stays open with form intact
5. **Fresh Retry**: User can immediately retry initialization with clean session state

## Additional Features

### API Integration with Automatic Offline Detection

The [`withOfflineDetection()`](src/lib/api.ts:117) wrapper provides automatic offline mode detection for all API calls:

```typescript
async function withOfflineDetection<T>(
  apiCall: () => Promise<T>,
  options: {
    fallbackToOffline?: boolean;
    operationType?: 'initializeDraft' | 'playerTaken' | 'userTurn';
    payload?: Record<string, unknown>;
  } = {}
): Promise<T>
```

#### Features

- **Automatic Classification**: Uses [`classifyError()`](src/lib/httpErrors.ts:156) on all responses
- **Offline Mode Activation**: Sets [`isOfflineMode`](src/lib/api.ts:137) and [`showOfflineBanner`](src/lib/api.ts:138) flags
- **Pending API Queue**: Adds failed operations to [`addPendingApiCall()`](src/lib/api.ts:142) queue
- **Optional Fallback**: Can return offline-mode responses instead of throwing

#### Usage in API Functions

```typescript
// Initialize Draft with offline detection
return withOfflineDetection(
  async () => blockingFetch('/draft/initialize', body, 300000),
  {
    operationType: 'initializeDraft',
    payload: params
  }
);

// Player Taken with offline detection  
return withOfflineDetection(
  async () => blockingFetch('/draft/player-taken', flattenedPayload, 60000),
  {
    operationType: 'playerTaken', 
    payload: params
  }
);
```

### Offline State Persistence

Offline mode state is persisted in the draft store and maintained across:

- **Browser refreshes**: State restored from localStorage
- **Component re-renders**: Consistent offline behavior
- **Navigation**: Offline mode preserved throughout app

### UI Polish and User Experience

#### Assistant Drawer Offline Message

When in offline mode, the AI assistant drawer shows offline-specific messaging:

- **Disabled AI Analysis**: Clear indication that AI features are unavailable
- **Local Data Notice**: Emphasis on locally-saved draft data
- **Reconnection Guidance**: Directions to use reconnect button

#### Auto-Scroll Behavior

- **Banner Integration**: Page layout adjusts for offline banner
- **Smooth Transitions**: No jarring layout shifts when entering/exiting offline mode
- **Consistent Positioning**: Banner consistently positioned at top of interface

#### Byte-Size Warnings

API payloads include automatic byte-size monitoring with console warnings:

```typescript
const bytes = bytesOf(body);
if (bytes >= 300_000) {
  console.error('[PAYLOAD][ALERT] /draft/initialize bytes', { bytes, players: playerCount });
} else if (bytes >= 150_000) {
  console.warn('[PAYLOAD][WARN] /draft/initialize bytes', { bytes, players: playerCount });
}
```

- **Alert Threshold**: 300KB+ triggers error-level logging
- **Warning Threshold**: 150KB+ triggers warning-level logging
- **Context Information**: Includes operation type, byte count, and relevant data counts

### User-Turn and Player-Taken Error Handling

Both [`userTurnBlocking()`](src/lib/api.ts:330) and [`playerTakenBlocking()`](src/lib/api.ts:270) functions include:

- **Offline Detection**: Wrapped with [`withOfflineDetection()`](src/lib/api.ts:117)
- **Payload Flattening**: Backend-compatible payload structure
- **Timeout Management**: Operation-appropriate timeouts (60s for player-taken, 90s for user-turn)
- **Conversation ID Persistence**: Automatic localStorage updates on success

## User Experience Flow

### Normal Online Operation

1. **Draft Initialization**: User configures draft → API call succeeds → Draft begins with AI strategy
2. **Player Actions**: Player picks/turns → API calls succeed → Real-time AI analysis provided
3. **Continuous Operation**: All features available, real-time server communication

### Connection Issue Detection

1. **Error Occurs**: API call fails with offline-worthy error (502, 503, 504, network failure)
2. **Immediate Classification**: [`classifyError()`](src/lib/httpErrors.ts:156) determines offline-worthiness
3. **Automatic Transition**: [`setOfflineMode(true)`](src/lib/api.ts:137), modal closes, banner appears
4. **User Notification**: Toast message explains transition to offline mode

### Retry Compact Flow

1. **Retry Options**: Banner presents "Retry Compact" and "Go Offline" options
2. **Compact Attempt**: Modified payload with [`compact: true`](src/components/DraftConfigModal.tsx:148), shorter timeout
3. **Success**: Return to online mode, draft proceeds normally
4. **Failure**: Automatic offline mode, draft proceeds without AI

### Offline Mode Operation

1. **Local Functionality**: Draft configuration, player picks, roster management work locally
2. **Data Persistence**: All actions saved to localStorage, no data loss
3. **Limited AI**: AI analysis unavailable, clear user messaging
4. **Reconnection Option**: Always-available "Reconnect" button for status checking

### Reconnection Flow

1. **User Initiative**: User clicks "Reconnect" button when ready
2. **Marco/Polo Test**: [`pingMarco()`](src/lib/api.ts:215) attempts server communication
3. **Success**: Banner disappears, full functionality restored, success notification
4. **Failure**: Warning notification, remain in offline mode, button re-enabled

## Technical Implementation Details

### Error Propagation Chain

1. **API Layer**: [`blockingFetch()`](src/lib/api.ts:73) catches and formats network/timeout errors
2. **Wrapper Layer**: [`withOfflineDetection()`](src/lib/api.ts:117) classifies and handles offline-worthy errors
3. **Component Layer**: UI components handle classified errors with appropriate user feedback
4. **Store Layer**: Draft store maintains offline state and coordinates component updates

### State Management

```typescript
// Draft Store State
interface DraftStore {
  isOfflineMode: boolean;           // Primary offline flag
  showOfflineBanner: boolean;       // Banner visibility control
  pendingApiCalls: ApiCall[];       // Queue of failed operations
  // ... other state
}
```

### Timeout Strategy

Different operations use appropriate timeouts based on expected complexity:

- **Marco/Polo Ping**: 15 seconds (quick connectivity check)
- **Player Actions**: 60 seconds (simple acknowledgment operations)
- **User Turn Analysis**: 90 seconds (moderate AI processing)
- **Draft Initialization**: 300 seconds (complex AI strategy generation)
- **Compact Retry**: 120 seconds (faster failure detection)

### Payload Optimization

Compact mode optimizations reduce payload size and processing time:

- **Player List Pruning**: Only top 25 players via [`mapToSlimTopN()`](src/components/DraftConfigModal.tsx:142)
- **Slim Player Format**: Essential fields only (id, name, position, team, byeWeek, adp, expectedRound)
- **Byte Monitoring**: Console warnings for large payloads
- **Flattened Structure**: Backend-optimized payload format

### Security Considerations

- **User ID Validation**: All API calls include validated user IDs from [`getUserId()`](src/lib/storage/localStore.ts)
- **Conversation ID Management**: Secure session tracking with localStorage persistence
- **Error Message Sanitization**: [`<think>` tag stripping](src/lib/api.ts:38) prevents information leakage
- **Input Validation**: Form validation before API calls

This comprehensive offline mode and retry compact system ensures users can continue their fantasy football draft experience even during connection issues, with multiple recovery options and clear feedback throughout the process.