# Frontend Streaming Audit Report

## Executive Summary

This report documents findings from a comprehensive 5-phase audit of NDJSON timeout/abort errors in the fantasy football draft initialization flow. The audit investigated scenarios where the browser receives 200 OK responses but immediately surfaces error payloads like `{"event":"error","data":{"error":"timeout","message":"This operation was aborted"}}`.

**Primary Root Cause**: Critical format schema mismatch in [`parseStreamChunk()`](src/hooks/useDraftInitializeStream.ts:88-96) where server error events use `{event, data}` schema but client parser expects `{type, data}` format, causing error payloads to be treated as regular content and permanently contaminating the UI stream.

**Secondary Issues**: Timeout coordination failures (client 235s vs proxy 300s), aggressive UI lifecycle management, and missing streaming-specific proxy configuration create perfect conditions for the format mismatch to manifest during the critical 55-115 second window.

**Impact**: Error JSON becomes permanently mixed with legitimate draft strategy content, rendering the AI assistant drawer unusable and forcing users into offline mode.

---

## Data Flow Diagram

```
DraftConfigModal Click → initializeDraft() → useDraftInitializeStream.start()
                                          ↓
                        fetch('/api/draft/initialize?stream=1')
                                          ↓
                      Vite Proxy (300s timeout) → Backend Server
                                          ↓
                            Response Stream (NDJSON chunks)
                                          ↓
                    reader.read() → TextDecoder → parseStreamChunk()
                                          ↓
                    [FORMAT MISMATCH: {event,data} vs {type,data}]
                                          ↓
                      appendAssistantStream() → draftStore update
                                          ↓
                          AIAnalysisDrawer → MarkdownRenderer
                                          ↓
                            [CONTAMINATED CONTENT DISPLAY]
```

---

## File Map

| File Path | Purpose | Key Symbols |
|-----------|---------|-------------|
| [`src/hooks/useDraftInitializeStream.ts`](src/hooks/useDraftInitializeStream.ts) | Core streaming logic | [`parseStreamChunk()`](src/hooks/useDraftInitializeStream.ts:61-110), [`start()`](src/hooks/useDraftInitializeStream.ts:112-267) |
| [`src/components/DraftConfigModal.tsx`](src/components/DraftConfigModal.tsx) | Entry point UI flow | [`initializeDraft()`](src/components/DraftConfigModal.tsx:80-270), [`onLetsDraft()`](src/components/DraftConfigModal.tsx:272) |
| [`src/components/AIAnalysisDrawer.tsx`](src/components/AIAnalysisDrawer.tsx) | Streaming content display | [`scrollToBottom()`](src/components/AIAnalysisDrawer.tsx:94-109), streaming auto-scroll |
| [`src/state/draftStore.ts`](src/state/draftStore.ts) | State management | [`openAssistantStreaming()`](src/state/draftStore.ts:432-439), [`appendAssistantStream()`](src/state/draftStore.ts:440-445) |
| [`vite.config.ts`](vite.config.ts) | Proxy configuration | [`proxy.timeout`](vite.config.ts:14-15) |

---

## Control Flow Analysis

### Phase 1: Initialization Trigger
1. [`DraftConfigModal.onLetsDraft()`](src/components/DraftConfigModal.tsx:272) → [`initializeDraft(false)`](src/components/DraftConfigModal.tsx:80)
2. [`openAssistantStreaming()`](src/components/DraftConfigModal.tsx:160) called **before** stream starts
3. [`start(wrappedPayload, callbacks)`](src/components/DraftConfigModal.tsx:162) begins streaming

### Phase 2: Network Request
4. [`useDraftInitializeStream.start()`](src/hooks/useDraftInitializeStream.ts:112) creates AbortController
5. [`setTimeout(235000ms)`](src/hooks/useDraftInitializeStream.ts:150-155) sets client timeout
6. [`fetch('/api/draft/initialize?stream=1')`](src/hooks/useDraftInitializeStream.ts:161-169) with streaming headers

### Phase 3: Stream Processing ⚠️ **CRITICAL**
7. [`reader.read()`](src/hooks/useDraftInitializeStream.ts:208) receives chunks
8. [`TextDecoder.decode()`](src/hooks/useDraftInitializeStream.ts:215) converts bytes
9. [`parseStreamChunk(decodedText)`](src/hooks/useDraftInitializeStream.ts:224) **FORMAT MISMATCH OCCURS HERE**
10. [`callback.onChunk(parsedChunk)`](src/hooks/useDraftInitializeStream.ts:226) sends contaminated content

### Phase 4: State Update & Rendering
11. [`appendAssistantStream(text)`](src/components/DraftConfigModal.tsx:168) updates store
12. [`assistantStreaming.content += text`](src/state/draftStore.ts:443) accumulates mixed content
13. [`MarkdownRenderer`](src/components/AIAnalysisDrawer.tsx:440-443) renders contaminated content

---

## Networking Configuration

### Client Fetch Options
```typescript
// src/hooks/useDraftInitializeStream.ts:161-169
fetch('/api/draft/initialize?stream=1', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream'        // ⚠️ SSE header but using NDJSON
  },
  body: JSON.stringify(payload),
  signal: controller.signal             // 235s timeout
})
```

### Critical Parser Behavior (Lines 88-96)
```typescript
// src/hooks/useDraftInitializeStream.ts:88-96
const parsed = JSON.parse(line);
if (parsed && typeof parsed === 'object' && 'type' in parsed && 'data' in parsed) {
  if (typeof parsed.data === 'string') {
    chunks.push(parsed.data);           // ✅ Expected: {type, data}
  }
} else {
  chunks.push(line);                    // ❌ Server sends: {event, data}
}
```

### Missing Headers
- No `x-accel-buffering: no` for nginx streaming
- No `Cache-Control: no-cache` 
- Accept header suggests SSE but implementation uses NDJSON

---

## Timeouts & Abort Coordination

| Source | Type | Value | Notes |
|--------|------|-------|--------|
| [`useDraftInitializeStream.ts:150`](src/hooks/useDraftInitializeStream.ts:150) | Client Safety | 235s | setTimeout abort |
| [`vite.config.ts:14-15`](vite.config.ts:14-15) | Proxy Socket | 300s | Vite dev server |
| Server (Inferred) | Response | ~120-180s | Based on error timing |
| **Gap Window** | **Critical** | **55-115s** | **Client reading, server errored** |

### Coordination Failure
- Server times out (~120-180s) and sends error event
- Client still actively reading (235s timeout not reached)
- Error payload treated as content due to format mismatch
- No cleanup or error boundary to prevent contamination

---

## UI/Lifecycle Issues

### Premature Drawer Opening
```typescript
// src/components/DraftConfigModal.tsx:160
openAssistantStreaming() // Opens BEFORE stream starts
```

### Content Contamination Flow
1. [`assistantStreaming.isOpen = true`](src/state/draftStore.ts:434) immediately
2. Error JSON arrives: `{"event":"error","data":{"error":"timeout"}}`
3. [`parseStreamChunk()`](src/hooks/useDraftInitializeStream.ts:88-96) fails to recognize format
4. Raw error JSON passed to [`appendAssistantStream()`](src/state/draftStore.ts:443)
5. [`MarkdownRenderer`](src/components/AIAnalysisDrawer.tsx:440-443) renders error as content
6. **Legitimate content permanently mixed with error JSON**

### Missing Error Boundaries
- No error boundaries around streaming components
- No content validation before rendering
- No mechanism to reset contaminated streams

---

## Proxy Configuration Analysis

### Current Vite Config
```typescript
// vite.config.ts:10-16
proxy: {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
    ws: true,
    timeout: 300_000,      // 5 min
    proxyTimeout: 300_000, // 5 min
  }
}
```

### Missing Streaming Optimizations
- No `x-accel-buffering: no` header injection
- No streaming-specific timeout coordination
- No format transformation between server/client
- No error event filtering or transformation

---

## Potential Red Flags

• **[HIGH PRIORITY]** Format schema mismatch in [`parseStreamChunk()`](src/hooks/useDraftInitializeStream.ts:88-96) expecting `{type, data}` vs server `{event, data}`

• **[HIGH PRIORITY]** Timeout coordination gap: client 235s vs proxy 300s creates 55-115s window where server errors but client still reading

• **[MEDIUM]** Premature drawer opening at [`DraftConfigModal:160`](src/components/DraftConfigModal.tsx:160) before stream validation

• **[MEDIUM]** No error boundaries around [`MarkdownRenderer`](src/components/AIAnalysisDrawer.tsx:440-443) in streaming content display

• **[MEDIUM]** Missing streaming headers: no `x-accel-buffering: no` in [`vite.config.ts`](vite.config.ts:10-16)

• **[LOW]** Aggressive auto-scroll behavior in [`AIAnalysisDrawer.scrollToBottom()`](src/components/AIAnalysisDrawer.tsx:94-109) compounds content contamination

• **[LOW]** No content validation before [`appendAssistantStream()`](src/state/draftStore.ts:443) accumulation

• **[LOW]** Header mismatch: `Accept: text/event-stream` but using NDJSON format

---

## Reproduction Notes

### Exact Request Path
```
POST /api/draft/initialize?stream=1
Content-Type: application/json
Accept: text/event-stream

{"user":"uuid","payload":{"numTeams":12,"userPickPosition":1,"players":[...]}}
```

### DevTools Observation Sequence
1. Open Network tab, filter to `initialize`
2. Trigger draft initialization via "Start Draft!" button
3. Monitor response around 55-115 second mark
4. Look for 200 OK with immediate error payload
5. Check AI Analysis Drawer for mixed content containing JSON error strings
6. Verify error text appears as rendered markdown alongside legitimate content

### Environmental Factors
- More likely during high server load
- Timing dependent on network latency  
- Browser aggressiveness with connection management
- Development vs production server response times

---

## Open Questions

### Server Coordination Needs
1. **Schema Alignment**: Should server switch to `{type, data}` format or client adapt to `{event, data}`?
2. **Error Boundaries**: Where should error events be filtered - proxy layer or client parser?
3. **Timeout Coordination**: Should all layers use consistent timeout values?
4. **Format Validation**: Should client validate JSON structure before processing?

### Implementation Priorities
1. **Immediate**: Fix format mismatch in [`parseStreamChunk()`](src/hooks/useDraftInitializeStream.ts:88-96)
2. **Short-term**: Add error boundaries and content validation
3. **Medium-term**: Coordinate timeout values across client/proxy/server
4. **Long-term**: Implement proper streaming headers and format transformation

---

*Report generated from 5-phase frontend streaming audit*  
*Focus: NDJSON timeout/abort error investigation*  
*Primary finding: Format schema mismatch causing content contamination*