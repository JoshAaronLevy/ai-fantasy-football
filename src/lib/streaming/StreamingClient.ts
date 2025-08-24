import type { StreamingEvent } from './types';
import { STREAM_DEBUG } from '../debug/devFlags';

export const STREAM_ENDPOINT = '/api/llm/stream';

/**
 * Debug logging helper for SSE events
 */
function debugEventLog(label: string, evt: any): void {
  if (!STREAM_DEBUG) return;
  
  try {
    const jsonStr = JSON.stringify(evt);
    const truncated = jsonStr.length > 500 ? jsonStr.slice(0, 500) + '...' : jsonStr;
    console.log(`[STREAM][${label}]`, truncated);
  } catch (error) {
    console.log(`[STREAM][${label}]`, String(evt));
  }
}

/**
 * Normalize Dify-native frames to internal events
 */
function normalizeEvent(raw: any): StreamingEvent[] {
  // Pass through if already in our internal format
  if (raw.type && ['ack', 'phase', 'chunk', 'error', 'done', 'heartbeat'].includes(raw.type)) {
    return [raw];
  }
  
  const events: StreamingEvent[] = [];
  
  // Dify message patterns
  if (raw.event === 'message' && raw.data?.content) {
    const content = raw.data.content;
    if (typeof content === 'string' && content.trim()) {
      events.push({ type: 'chunk', content });
    }
  }
  
  // Dify data.answer or data.text patterns
  if (raw.data?.answer && typeof raw.data.answer === 'string' && raw.data.answer.trim()) {
    events.push({ type: 'chunk', content: raw.data.answer });
  }
  
  if (raw.data?.text && typeof raw.data.text === 'string' && raw.data.text.trim()) {
    events.push({ type: 'chunk', content: raw.data.text });
  }
  
  // Top-level answer
  if (raw.answer && typeof raw.answer === 'string' && raw.answer.trim()) {
    events.push({ type: 'chunk', content: raw.answer });
  }
  
  // Dify completion patterns
  if (raw.event === 'message_end' || raw.event === 'end' || raw.event === 'completed') {
    events.push({ type: 'done', data: { reason: 'stop' } });
  }
  
  // Dify error patterns
  if (raw.event === 'error' || raw.error) {
    const message = raw.message || raw.error || 'stream error';
    events.push({ type: 'error', message });
  }
  
  // OpenAI-like patterns
  if (raw.choices && Array.isArray(raw.choices) && raw.choices[0]?.delta?.content) {
    const content = raw.choices[0].delta.content;
    if (typeof content === 'string' && content.trim()) {
      events.push({ type: 'chunk', content });
    }
  }
  
  // If no patterns matched, log as unknown but don't emit
  if (events.length === 0) {
    debugEventLog('raw-unknown', raw);
    return [];
  }
  
  return events;
}

/**
 * Format stream duration in a human-readable format
 */
function formatStreamDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    const seconds = ms / 1000;
    if (seconds < 10) {
      return `${seconds.toFixed(2)}s`;
    } else {
      return `${seconds.toFixed(1)}s`;
    }
  } else {
    const minutes = Math.floor(ms / 60000);
    const remainingSeconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
  }
}

export function parseSSEChunk(chunk: Uint8Array | string): StreamingEvent[] {
  const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk, { stream: true });
  const frames = text.split('\n\n');
  const evts: StreamingEvent[] = [];
  
  for (const frame of frames) {
    if (!frame.trim()) continue;
    
    const lines = frame.split('\n').map(l => l.trim());
    for (const line of lines) {
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('data:')) {
        const json = line.slice(5).trim();
        if (!json) continue;
        try { 
          evts.push(JSON.parse(json)); 
        } catch {
          // Ignore malformed JSON
        }
      }
    }
  }
  return evts;
}

export async function* streamWithFetch(
  body: Record<string, any>,
  signal?: AbortSignal
): AsyncIterable<StreamingEvent> {
  // Capture stream start time for duration tracking
  const streamStartTime = Date.now();
  
  // [Draft Init 3/4] Log before sending payload
  const method = 'POST';
  const bodyString = JSON.stringify(body);
  const bodyBytes = new TextEncoder().encode(bodyString).length;
  
  // Create sanitized body preview (first ~200 chars)
  let bodyPreview: any;
  try {
    // Try to parse for prettier output
    const parsed = JSON.parse(bodyString);
    bodyPreview = JSON.stringify(parsed).substring(0, 200);
    if (bodyString.length > 200) bodyPreview += '...';
  } catch {
    // Fall back to string preview
    bodyPreview = bodyString.substring(0, 200);
    if (bodyString.length > 200) bodyPreview += '...';
  }
  
  console.info('[Draft Init 3/4] Sending init payload to /api/llm/stream', {
    method,
    contentType: 'application/json',
    bodyPreview,
    bodyBytes
  });

  const res = await fetch(STREAM_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: bodyString,
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`);
  }

  // [Draft Init 4/4] Log successful stream opening
  const status = res.status;
  const statusText = res.statusText;
  const contentType = res.headers.get('content-type') || undefined;
  const requestId = res.headers.get('x-request-id') || res.headers.get('x-correlation-id') || undefined;
  
  console.info('[Draft Init 4/4] Stream opened successfully', {
    status,
    statusText,
    contentType,
    ...(requestId && { requestId })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let loggedFirstChunk = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const rawEvt of parseSSEChunk(frame)) {
          // Debug log raw event
          debugEventLog('in', rawEvt);
          
          // Normalize the event
          const normalizedEvents = normalizeEvent(rawEvt);
          if (normalizedEvents.length === 0) {
            continue;
          }
          
          for (const evt of normalizedEvents) {
            // Debug log normalized event
            debugEventLog('norm', evt);
            
            // Log first meaningful chunk once
            if (!loggedFirstChunk && evt.type === 'chunk' && evt.content) {
              const chunkPreview = String(evt.content).substring(0, 200);
              console.debug('[Draft Init 4/4] First stream chunk received', { chunkPreview });
              loggedFirstChunk = true;
            }
            
            // Enhance done events with duration information
            if (evt.type === 'done') {
              const streamDurationMs = Date.now() - streamStartTime;
              const streamDuration = formatStreamDuration(streamDurationMs);
              
              // Add duration fields to the done event
              const enhancedEvent = {
                ...evt,
                durationMs: streamDurationMs,
                duration: streamDuration,
                data: {
                  ...evt.data,
                  durationMs: streamDurationMs,
                  duration: streamDuration
                }
              };
              yield enhancedEvent;
            } else {
              yield evt;
            }
          }
        }
      }
    }

    // Process any remaining buffer content
    if (buf) {
      for (const rawEvt of parseSSEChunk(buf)) {
        // Debug log raw event
        debugEventLog('in', rawEvt);
        
        // Normalize the event
        const normalizedEvents = normalizeEvent(rawEvt);
        if (normalizedEvents.length === 0) {
          continue;
        }
        
        for (const evt of normalizedEvents) {
          // Debug log normalized event
          debugEventLog('norm', evt);
          
          // Log first meaningful chunk once (for remaining buffer)
          if (!loggedFirstChunk && evt.type === 'chunk' && evt.content) {
            const chunkPreview = String(evt.content).substring(0, 200);
            console.debug('[Draft Init 4/4] First stream chunk received', { chunkPreview });
            loggedFirstChunk = true;
          }
          
          // Enhance done events with duration information
          if (evt.type === 'done') {
            const streamDurationMs = Date.now() - streamStartTime;
            const streamDuration = formatStreamDuration(streamDurationMs);
            
            // Add duration fields to the done event
            const enhancedEvent = {
              ...evt,
              durationMs: streamDurationMs,
              duration: streamDuration,
              data: {
                ...evt.data,
                durationMs: streamDurationMs,
                duration: streamDuration
              }
            };
            yield enhancedEvent;
          } else {
            yield evt;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}