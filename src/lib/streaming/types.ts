/**
 * Streaming client types and interfaces
 */

/**
 * Supported transport modes for streaming
 */
export type TransportMode = 'fetch' | 'eventsource';

/**
 * SSE event types that can be received from the streaming API
 */
export type StreamingEventType = 'ack' | 'phase' | 'chunk' | 'done' | 'error' | 'heartbeat';

/**
 * Base streaming event structure
 */
export interface StreamingEvent {
  type: StreamingEventType;
  data?: any;
  id?: string;
  retry?: number;
  content?: string; // For backward compatibility with chunk events
  message?: string; // For error events
  conversationId?: string; // For conversation management
  [key: string]: any; // Allow additional properties
}

/**
 * Chunk event with partial content
 */
export interface ChunkEvent extends StreamingEvent {
  type: 'chunk';
  data: {
    content: string;
    delta?: string;
  };
}

/**
 * Stream completion event
 */
export interface DoneEvent extends StreamingEvent {
  type: 'done';
  data: {
    reason: 'stop' | 'length' | 'error';
    totalTokens?: number;
    durationMs?: number;
    duration?: string;
  };
}

/**
 * Error event
 */
export interface ErrorEvent extends StreamingEvent {
  type: 'error';
  data: {
    error: string;
    code?: string;
    retryable?: boolean;
  };
}

/**
 * Heartbeat event for connection monitoring
 */
export interface HeartbeatEvent extends StreamingEvent {
  type: 'heartbeat';
  data: {
    timestamp: number;
  };
}

/**
 * LLM request body for streaming
 */
export interface LlmBody {
  message: string;
  conversationId?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

/**
 * Parameters for LLM streaming requests
 */
export interface LlmStreamParams extends LlmBody {
  stream: true;
}

/**
 * Transport configuration options
 */
export interface TransportConfig {
  mode?: TransportMode;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  withCredentials?: boolean;
}

/**
 * SSE parser configuration
 */
export interface SSEParserConfig {
  bufferSize?: number;
  maxLineLength?: number;
}

/**
 * Streaming client configuration
 */
export interface StreamingClientConfig extends TransportConfig, SSEParserConfig {
  apiBase?: string;
  authToken?: string;
  withCredentials?: boolean;
}

/**
 * Streaming error types
 */
export type StreamingErrorType = 
  | 'network_error'
  | 'parse_error' 
  | 'auth_error'
  | 'timeout_error'
  | 'abort_error'
  | 'server_error';

/**
 * Custom streaming error class
 */
export class StreamingError extends Error {
  public readonly type: StreamingErrorType;
  public readonly code?: string;
  public readonly retryable: boolean;

  constructor(
    message: string, 
    type: StreamingErrorType, 
    code?: string,
    retryable = false
  ) {
    super(message);
    this.name = 'StreamingError';
    this.type = type;
    this.code = code;
    this.retryable = retryable;
  }
}