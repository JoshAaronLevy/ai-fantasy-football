/**
 * Public API exports for the streaming client
 */

// Main streaming functions
export {
  streamWithFetch,
  parseSSEChunk,
  STREAM_ENDPOINT
} from './StreamingClient';

// Types and interfaces
export type {
  TransportMode,
  StreamingEventType,
  StreamingEvent,
  ChunkEvent,
  DoneEvent,
  ErrorEvent,
  HeartbeatEvent,
  LlmBody,
  LlmStreamParams,
  TransportConfig,
  SSEParserConfig,
  StreamingClientConfig,
  StreamingErrorType
} from './types';

// Error class
export { StreamingError } from './types';

// Re-export for convenience
export * from './types';