# Streaming Client for LLM Integration

This directory contains a robust streaming client implementation for LLM integration with support for both POST+fetch and GET+EventSource transports.

## Overview

The streaming client provides a comprehensive solution for streaming LLM responses with:

- **Dual Transport Support**: POST+fetch (preferred) and GET+EventSource (fallback)
- **Robust SSE Parsing**: Handles Server-Sent Events format with proper buffering
- **Error Handling**: Comprehensive error types with retry logic and backoff
- **TypeScript Support**: Full type safety with detailed interfaces
- **Authentication**: Support for both Authorization headers and cookies
- **Cancellation**: AbortController integration for request cancellation

## Architecture

### Files Structure

```
src/lib/streaming/
├── index.ts              # Public API exports
├── types.ts              # TypeScript type definitions
├── StreamingClient.ts    # Main client implementation
├── sse-parser.ts         # SSE parsing utilities
├── transport.ts          # Transport detection and configuration
├── test-integration.ts   # Integration test examples
└── README.md            # This documentation
```

### Transport Selection

The client automatically detects the best available transport:

1. **POST+fetch** (preferred): Supports Authorization headers, better control
2. **GET+EventSource** (fallback): Cookie-based auth, automatic reconnection

## Usage Examples

### Basic Streaming

```typescript
import { streamLLM } from './lib/streaming';

const body = {
  message: "Hello, tell me about TypeScript",
  conversationId: "conv-123",
  maxTokens: 500,
  temperature: 0.7,
};

try {
  for await (const event of streamLLM(body)) {
    switch (event.type) {
      case 'chunk':
        console.log('Content:', event.data.content);
        break;
      case 'done':
        console.log('Stream completed');
        return;
      case 'error':
        console.error('Error:', event.data.error);
        break;
    }
  }
} catch (error) {
  console.error('Streaming failed:', error);
}
```

### Advanced Configuration

```typescript
import { createStreamingClient } from './lib/streaming';

const client = createStreamingClient({
  apiBase: '/api',
  authToken: 'your-auth-token',
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
  withCredentials: true,
});

// Use specific transport
for await (const event of client.streamWithFetch(body, abortSignal)) {
  // Handle events
}
```

### EventSource Fallback

```typescript
import { streamWithEventSource } from './lib/streaming';

const eventSource = streamWithEventSource({
  message: "Hello",
  stream: true,
});

eventSource.onMessage((event) => {
  console.log('Event:', event);
});

eventSource.onError((error) => {
  console.error('Error:', error);
});

// Cleanup
eventSource.close();
```

## API Reference

### Main Functions

- `streamLLM(body, config?, signal?)` - High-level streaming interface
- `streamWithFetch(body, signal?, config?)` - Direct fetch streaming
- `streamWithEventSource(params, config?)` - Direct EventSource streaming
- `createStreamingClient(config?)` - Create configured client instance
- `detectTransport()` - Detect best available transport

### Event Types

- `chunk` - Partial content from LLM
- `done` - Stream completion
- `error` - Error occurred
- `heartbeat` - Keep-alive signal

### Configuration Options

```typescript
interface StreamingClientConfig {
  apiBase?: string;           // API base URL
  authToken?: string;         // Authorization token
  mode?: TransportMode;       // Force transport mode
  timeout?: number;           // Request timeout
  retryAttempts?: number;     // Retry attempts
  retryDelay?: number;        // Base retry delay
  withCredentials?: boolean;  // Include credentials
  bufferSize?: number;        // SSE buffer size
  maxLineLength?: number;     // Max SSE line length
}
```

## Backend Integration

The client expects the backend to expose:

- `POST /api/llm/stream` - Primary streaming endpoint
- `GET /api/llm/stream` - EventSource fallback endpoint

Both endpoints should return SSE format:

```
data: {"type": "chunk", "data": {"content": "Hello"}}
data: {"type": "done", "data": {"reason": "stop"}}
```

## Error Handling

The client provides structured error handling:

```typescript
import { StreamingError } from './lib/streaming';

try {
  // Streaming code
} catch (error) {
  if (error instanceof StreamingError) {
    console.log('Error type:', error.type);
    console.log('Retryable:', error.retryable);
    console.log('Code:', error.code);
  }
}
```

## Testing

See `test-integration.ts` for comprehensive examples and integration tests.

## Integration with Existing API

The streaming client follows the same patterns as `src/lib/api.ts`:

- Uses the same `API_BASE` environment variable
- Compatible with existing error handling patterns
- Maintains TypeScript interface consistency
- Supports the same authentication mechanisms