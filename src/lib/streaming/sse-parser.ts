/**
 * Server-Sent Events (SSE) parsing utilities
 */

import type { StreamingEvent, SSEParserConfig } from './types';
import { StreamingError as StreamingErrorClass } from './types';

/**
 * Default configuration for SSE parser
 */
const DEFAULT_CONFIG: Required<SSEParserConfig> = {
  bufferSize: 1024 * 64, // 64KB buffer
  maxLineLength: 1024 * 8, // 8KB max line length
};

/**
 * SSE parser state for handling partial chunks
 */
interface SSEParserState {
  buffer: string;
  config: Required<SSEParserConfig>;
}

/**
 * Create a new SSE parser state
 */
export function createSSEParser(config: SSEParserConfig = {}): SSEParserState {
  return {
    buffer: '',
    config: { ...DEFAULT_CONFIG, ...config },
  };
}

/**
 * Parse SSE chunk data and return streaming events
 * Handles both Uint8Array and string inputs
 */
export function parseSSEChunk(
  chunk: Uint8Array | string,
  parser: SSEParserState
): StreamingEvent[] {
  const events: StreamingEvent[] = [];
  
  try {
    // Convert Uint8Array to string if needed
    const chunkStr = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    
    // Add to buffer
    parser.buffer += chunkStr;
    
    // Split by lines and process
    const lines = parser.buffer.split('\n');
    
    // Keep the last incomplete line in buffer
    parser.buffer = lines.pop() || '';
    
    // Process complete lines
    for (const line of lines) {
      const event = parseSingleSSELine(line.trim());
      if (event) {
        events.push(event);
      }
    }
    
    // Check buffer size limit
    if (parser.buffer.length > parser.config.bufferSize) {
      throw new StreamingErrorClass(
        'SSE buffer overflow',
        'parse_error',
        'BUFFER_OVERFLOW'
      );
    }
    
  } catch (error) {
    if (error instanceof StreamingErrorClass) {
      throw error;
    }
    throw new StreamingErrorClass(
      `SSE parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'parse_error'
    );
  }
  
  return events;
}

/**
 * Parse a single SSE line and return a streaming event if valid
 */
function parseSingleSSELine(line: string): StreamingEvent | null {
  // Skip empty lines
  if (!line) {
    return null;
  }
  
  // Skip comment lines (start with :)
  if (line.startsWith(':')) {
    return null;
  }
  
  // Handle data lines
  if (line.startsWith('data: ')) {
    const jsonStr = line.substring(6); // Remove 'data: ' prefix
    
    try {
      const data = JSON.parse(jsonStr);
      
      // Validate event structure
      if (!data || typeof data !== 'object' || !data.type) {
        return null;
      }
      
      return {
        type: data.type,
        data: data.data,
        id: data.id,
        retry: data.retry,
      };
    } catch (error) {
      // Invalid JSON in data line - log but don't fail the stream
      console.warn('Invalid JSON in SSE data line:', jsonStr);
      return null;
    }
  }
  
  // Handle event type lines
  if (line.startsWith('event: ')) {
    // For future extensibility - currently not used
    return null;
  }
  
  // Handle id lines
  if (line.startsWith('id: ')) {
    // For future extensibility - currently not used
    return null;
  }
  
  // Handle retry lines
  if (line.startsWith('retry: ')) {
    // For future extensibility - currently not used
    return null;
  }
  
  // Unknown line format - ignore
  return null;
}

/**
 * Flush any remaining data in the parser buffer
 * Should be called when the stream ends
 */
export function flushSSEParser(parser: SSEParserState): StreamingEvent[] {
  if (!parser.buffer.trim()) {
    return [];
  }
  
  const events: StreamingEvent[] = [];
  const event = parseSingleSSELine(parser.buffer.trim());
  if (event) {
    events.push(event);
  }
  
  // Clear buffer
  parser.buffer = '';
  
  return events;
}

/**
 * Validate that a streaming event has the correct structure
 */
export function validateStreamingEvent(event: any): event is StreamingEvent {
  return (
    event &&
    typeof event === 'object' &&
    typeof event.type === 'string' &&
    ['chunk', 'done', 'error', 'heartbeat'].includes(event.type)
  );
}

/**
 * Extract error information from an error event
 */
export function extractErrorFromEvent(event: StreamingEvent): StreamingErrorClass {
  if (event.type !== 'error') {
    throw new Error('Event is not an error type');
  }
  
  const errorData = event.data || {};
  const message = errorData.error || 'Unknown streaming error';
  const code = errorData.code;
  const retryable = errorData.retryable || false;
  
  return new StreamingErrorClass(message, 'server_error', code, retryable);
}

/**
 * Check if an event is a heartbeat that should be ignored
 */
export function isHeartbeatEvent(event: StreamingEvent): boolean {
  return event.type === 'heartbeat';
}

/**
 * Check if an event indicates the stream has ended
 */
export function isStreamEndEvent(event: StreamingEvent): boolean {
  return event.type === 'done' || event.type === 'error';
}