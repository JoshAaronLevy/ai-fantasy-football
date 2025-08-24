# LLM Streaming Architecture Plan

## Executive Summary

This document outlines the architectural plan for implementing a robust LLM streaming system in the Boykies Fantasy Football application. The streaming system will support both POST+fetch streaming (with Authorization headers) and GET+EventSource (for cookie/session auth) to ensure maximum compatibility and reliability.

## Current State Analysis

### Current API Authentication Approach

**Findings from `src/lib/api.ts`:**
- **No Authentication Currently**: The existing API uses no authentication headers
- **Simple JSON Requests**: All current endpoints use POST with JSON bodies
- **Standard Error Handling**: Centralized error handling via `makeApiRequest()` helper
- **Environment Configuration**: API base URL configurable via `VITE_API_BASE_URL`

**Current Request Pattern:**
```typescript
const defaultOptions: RequestInit = {
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
};
```

**Limitations:**
- No authentication mechanism in place
- No support for streaming responses
- No authorization header handling
- All requests are synchronous request-response pattern

### Current LLM Usage Patterns

**Findings from `src/components/AIAnalysisDrawer.tsx`:**
- **Message-Based UI**: Built around `ConversationMessage` objects
- **Real-time State Updates**: Uses Zustand store for live updates
- **Loading States**: Integrated loading spinners and progress indicators
- **Message Types**: Supports 'strategy', 'player-taken', 'user-turn', 'loading'
- **Scrollable History**: Uses PrimeReact ScrollPanel for message display

**Current Message Flow:**
1. API call initiated → `setApiLoading(true)`
2. Response received → message added to `conversationMessages[]`
3. UI updates automatically via Zustand state subscription

### Existing Type Definitions

**Current Types (`src/types.ts`):**
```typescript
export interface ConversationMessage {
  id: string;
  type: 'strategy' | 'player-taken' | 'user-turn' | 'loading';
  content: string;
  timestamp: number;
  player?: Player;
  round?: number;
  pick?: number;
}
```

**Missing Types for Streaming:**
- No streaming event types
- No transport mode definitions
- No error handling types for streaming
- No connection state types

### State Management Patterns

**Zustand Store (`src/state/draftStore.ts`):**
- **Persistence**: Uses localStorage with `zustand/persist`
- **Conversation State**: `conversationId`, `conversationMessages[]`, `isApiLoading`
- **Message Management**: `addConversationMessage()`, `setApiLoading()`
- **Complex Draft Logic**: Snake draft calculations, turn management

**Current Limitations:**
- No streaming state management
- No connection status tracking
- No retry mechanisms
- Single loading state for all API operations

## Recommended Architecture

### File Structure for Streaming Components

```
src/
├── lib/
│   ├── api.ts                    # Existing API functions
│   ├── streaming/
│   │   ├── index.ts             # Public API exports
│   │   ├── StreamingClient.ts   # Main streaming client class
│   │   ├── transports/
│   │   │   ├── FetchStreaming.ts    # POST + fetch implementation
│   │   │   ├── EventSourceStreaming.ts  # GET + EventSource implementation
│   │   │   └── TransportBase.ts     # Abstract base class
│   │   ├── types.ts             # Streaming-specific types
│   │   ├── utils.ts             # Parsing, retry logic
│   │   └── config.ts            # Default configurations
├── hooks/
│   ├── useStreaming.ts          # React hook for streaming
│   ├── useStreamingConnection.ts # Connection management hook
│   └── useRetry.ts              # Retry logic hook
├── components/
│   ├── streaming/
│   │   ├── StreamingMessage.tsx     # Individual streaming message
│   │   ├── StreamingIndicator.tsx   # Connection status indicator
│   │   └── StreamingProgress.tsx    # Real-time progress display
│   └── AIAnalysisDrawer.tsx     # Updated to use streaming
└── state/
    ├── draftStore.ts            # Enhanced with streaming state
    └── streamingStore.ts        # Dedicated streaming state (optional)
```

### Integration Points with Existing UI Components

#### 1. AIAnalysisDrawer Component Enhancement

**Current Integration Points:**
- `conversationMessages` array for message display
- `isApiLoading` state for loading indicators
- `addConversationMessage()` for new messages

**Streaming Integration:**
```typescript
// Enhanced message types
type StreamingConversationMessage = ConversationMessage & {
  isStreaming?: boolean;
  streamingProgress?: number;
  chunkCount?: number;
}

// Real-time chunk updates
const useStreamingMessages = () => {
  const { streamingClient } = useStreaming();
  const addMessage = useDraftStore(s => s.addConversationMessage);
  
  // Handle streaming chunks
  streamingClient.onChunk(chunk => {
    // Update partial message content
  });
}
```

**UI Updates:**
- Add streaming indicator next to loading spinner
- Real-time text updates as chunks arrive
- Progress bars for long analyses
- Connection status in header

#### 2. Draft Store Integration

**Enhanced State:**
```typescript
// Additional state for streaming
type DraftState = {
  // ... existing state
  
  // Streaming state
  streamingConnections: Map<string, StreamingConnection>;
  activeStreamId: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError: string | null;
  retryCount: number;
}
```

**New Actions:**
```typescript
// Streaming actions
setStreamingConnection: (id: string, connection: StreamingConnection) => void;
setConnectionStatus: (status: ConnectionStatus) => void;
handleStreamingChunk: (chunk: StreamingChunk) => void;
handleStreamingError: (error: Error) => void;
retryConnection: () => void;
```

#### 3. Header Component Integration

**Connection Status Display:**
- Add streaming status indicator
- Show retry button on connection failures
- Display active stream count

### Transport Mode Selection Strategy

#### Decision Matrix

| Scenario | Preferred Transport | Reason |
|----------|-------------------|---------|
| Authentication via Bearer token | POST + fetch | Authorization headers supported |
| Cookie/session authentication | GET + EventSource | Automatic cookie handling |
| Cross-origin requests | POST + fetch | Better CORS control |
| Simple same-origin | GET + EventSource | Simpler implementation |
| Mobile/unreliable networks | POST + fetch | Better error handling |

#### Implementation Strategy

```typescript
class StreamingClient {
  private selectTransport(options: StreamingOptions): StreamingTransport {
    // 1. Check if authorization headers are provided
    if (options.headers?.['Authorization']) {
      return new FetchStreaming(options);
    }
    
    // 2. Check if we're in a cross-origin scenario
    if (this.isCrossOrigin(options.endpoint)) {
      return new FetchStreaming(options);
    }
    
    // 3. Check browser support for EventSource
    if (!window.EventSource) {
      return new FetchStreaming(options);
    }
    
    // 4. Default to EventSource for simplicity
    return new EventSourceStreaming(options);
  }
  
  private isCrossOrigin(endpoint: string): boolean {
    return !endpoint.startsWith(window.location.origin);
  }
}
```

#### Fallback Strategy

```typescript
class StreamingClient {
  async connect(options: StreamingOptions): Promise<void> {
    let lastError: Error | null = null;
    
    // Try preferred transport first
    const primaryTransport = this.selectTransport(options);
    try {
      await primaryTransport.connect();
      this.activeTransport = primaryTransport;
      return;
    } catch (error) {
      lastError = error;
      await primaryTransport.disconnect();
    }
    
    // Fallback to alternative transport
    const fallbackTransport = this.getFallbackTransport(options);
    try {
      await fallbackTransport.connect();
      this.activeTransport = fallbackTransport;
      return;
    } catch (error) {
      throw new Error(`Both transports failed: ${lastError?.message}, ${error.message}`);
    }
  }
}
```

### Error Handling and Retry Strategy

#### Error Categories

1. **Connection Errors**: Network failures, CORS issues
2. **Authentication Errors**: Invalid tokens, expired sessions
3. **Server Errors**: 5xx responses, malformed SSE data
4. **Client Errors**: Invalid request parameters

#### Retry Logic

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

class ExponentialBackoff {
  private retryCount = 0;
  
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig
  ): Promise<T> {
    try {
      const result = await operation();
      this.retryCount = 0; // Reset on success
      return result;
    } catch (error) {
      if (!this.shouldRetry(error, config)) {
        throw error;
      }
      
      if (this.retryCount >= config.maxRetries) {
        throw new Error(`Max retries (${config.maxRetries}) exceeded: ${error.message}`);
      }
      
      const delay = this.calculateDelay(config);
      await this.sleep(delay);
      this.retryCount++;
      
      return this.executeWithRetry(operation, config);
    }
  }
  
  private calculateDelay(config: RetryConfig): number {
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, this.retryCount);
    return Math.min(delay, config.maxDelay);
  }
  
  private shouldRetry(error: Error, config: RetryConfig): boolean {
    return config.retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    );
  }
}
```

#### Connection Recovery

```typescript
class StreamingClient {
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  
  private async handleConnectionLoss(): Promise<void> {
    this.connectionStatus = 'error';
    
    // Exponential backoff for reconnection
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(this.lastOptions);
        this.reconnectAttempts = 0;
      } catch (error) {
        this.reconnectAttempts++;
        if (this.reconnectAttempts < 5) {
          this.handleConnectionLoss();
        } else {
          this.connectionStatus = 'disconnected';
          this.emit('maxRetriesExceeded', error);
        }
      }
    }, delay);
  }
}
```

#### Error Boundaries

```typescript
// React Error Boundary for streaming components
class StreamingErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Streaming error:', error, errorInfo);
    
    // Report to error tracking service
    this.reportError(error, errorInfo);
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <StreamingErrorFallback 
          error={this.state.error}
          onRetry={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    
    return this.props.children;
  }
}
```

## Detailed Component Specifications

### StreamingClient Class

```typescript
interface StreamingOptions {
  endpoint: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  transportPreference?: 'fetch' | 'eventsource' | 'auto';
  retryConfig?: RetryConfig;
  heartbeatInterval?: number;
}

interface StreamingEvent {
  type: 'chunk' | 'done' | 'error' | 'heartbeat';
  data?: any;
  id?: string;
  retry?: number;
}

class StreamingClient extends EventTarget {
  private activeTransport?: StreamingTransport;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private heartbeatTimer?: NodeJS.Timeout;
  
  async connect(options: StreamingOptions): Promise<void>;
  async disconnect(): Promise<void>;
  async send(data: any): Promise<void>;
  
  on(event: string, listener: Function): void;
  off(event: string, listener: Function): void;
  
  getConnectionStatus(): ConnectionStatus;
  getTransportType(): 'fetch' | 'eventsource' | null;
}
```

### React Hooks

```typescript
// Main streaming hook
function useStreaming(endpoint: string, options?: StreamingOptions) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<StreamingEvent[]>([]);
  const [error, setError] = useState<Error | null>(null);
  
  const connect = useCallback(async () => {
    // Implementation
  }, [endpoint, options]);
  
  const disconnect = useCallback(async () => {
    // Implementation
  }, []);
  
  const retry = useCallback(async () => {
    // Implementation
  }, [connect]);
  
  return {
    connectionStatus,
    messages,
    error,
    connect,
    disconnect,
    retry
  };
}

// Connection management hook
function useStreamingConnection() {
  const draftStore = useDraftStore();
  
  const initializeStreaming = useCallback(async (conversationId: string) => {
    const endpoint = `/api/llm/stream`;
    const options: StreamingOptions = {
      headers: {
        'Content-Type': 'application/json',
        // Add authorization if available
      },
      body: JSON.stringify({ conversationId })
    };
    
    // Implementation
  }, []);
  
  return { initializeStreaming };
}
```

## Implementation Phases

### Phase 1: Core Streaming Infrastructure
1. Implement `StreamingClient` class
2. Create transport implementations (`FetchStreaming`, `EventSourceStreaming`)
3. Add streaming types and interfaces
4. Basic error handling and retry logic

### Phase 2: React Integration
1. Create streaming hooks (`useStreaming`, `useStreamingConnection`)
2. Enhance draft store with streaming state
3. Create streaming UI components

### Phase 3: UI Integration
1. Update `AIAnalysisDrawer` with streaming support
2. Add connection status indicators
3. Implement real-time message updates
4. Add error boundaries and fallback UI

### Phase 4: Enhanced Features
1. Connection recovery and heartbeat
2. Advanced retry strategies
3. Performance optimizations
4. Comprehensive error handling

## Security Considerations

### Authentication
- Support for Bearer token authentication
- Secure cookie handling for session-based auth
- Token refresh mechanisms for long-lived connections

### Data Validation
- Validate all incoming SSE data
- Sanitize message content for XSS prevention
- Rate limiting on client side

### Connection Security
- Prefer HTTPS for all streaming connections
- Implement connection timeouts
- Secure headers configuration

## Performance Considerations

### Memory Management
- Limit message history size
- Clean up event listeners on disconnect
- Garbage collection for closed connections

### Network Optimization
- Implement heartbeat to detect stale connections
- Use compression for large payloads
- Connection pooling for multiple streams

### UI Performance
- Virtual scrolling for large message lists
- Debounced updates for rapid chunks
- Efficient re-rendering strategies

This architectural plan provides a comprehensive foundation for implementing robust LLM streaming in the Boykies Fantasy Football application while maintaining compatibility with existing patterns and ensuring reliability across different authentication and network scenarios.