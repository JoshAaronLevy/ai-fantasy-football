/**
 * Transport detection and selection logic for streaming
 */

import type { TransportMode, TransportConfig } from './types';

/**
 * Browser capability detection results
 */
interface BrowserCapabilities {
  supportsFetch: boolean;
  supportsEventSource: boolean;
  supportsReadableStream: boolean;
  supportsAbortController: boolean;
}

/**
 * Detect browser capabilities for streaming
 */
function detectBrowserCapabilities(): BrowserCapabilities {
  return {
    supportsFetch: typeof fetch !== 'undefined',
    supportsEventSource: typeof EventSource !== 'undefined',
    supportsReadableStream: typeof ReadableStream !== 'undefined',
    supportsAbortController: typeof AbortController !== 'undefined',
  };
}

/**
 * Determine the best transport mode based on browser capabilities and configuration
 */
export function detectTransport(config: TransportConfig = {}): TransportMode {
  // If mode is explicitly configured, validate and use it
  if (config.mode) {
    if (isTransportSupported(config.mode)) {
      return config.mode;
    }
    console.warn(`Configured transport mode '${config.mode}' is not supported, falling back to auto-detection`);
  }

  const capabilities = detectBrowserCapabilities();

  // Prefer fetch for better control over headers and auth
  if (capabilities.supportsFetch && capabilities.supportsReadableStream) {
    return 'fetch';
  }

  // Fallback to EventSource
  if (capabilities.supportsEventSource) {
    return 'eventsource';
  }

  // Should not happen in modern browsers, but provide fallback
  throw new Error('No supported streaming transport available');
}

/**
 * Check if a specific transport mode is supported by the current browser
 */
export function isTransportSupported(mode: TransportMode): boolean {
  const capabilities = detectBrowserCapabilities();

  switch (mode) {
    case 'fetch':
      return capabilities.supportsFetch && capabilities.supportsReadableStream;
    case 'eventsource':
      return capabilities.supportsEventSource;
    default:
      return false;
  }
}

/**
 * Get transport-specific configuration recommendations
 */
export function getTransportRecommendations(mode: TransportMode): Partial<TransportConfig> {
  switch (mode) {
    case 'fetch':
      return {
        timeout: 30000, // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000, // 1 second
      };
    case 'eventsource':
      return {
        timeout: 45000, // 45 seconds (EventSource handles retries internally)
        retryAttempts: 1, // Let EventSource handle retries
        retryDelay: 0,
      };
    default:
      return {};
  }
}

/**
 * Check if the current environment supports Authorization headers in streaming
 * EventSource does not support custom headers, so this only applies to fetch
 */
export function supportsAuthHeaders(mode: TransportMode): boolean {
  return mode === 'fetch';
}

/**
 * Check if the current environment supports credentials (cookies/session auth)
 */
export function supportsCredentials(_mode: TransportMode): boolean {
  // Both modes support credentials, but in different ways
  return true;
}

/**
 * Get the appropriate endpoint URL for the selected transport mode
 */
export function getStreamingEndpoint(baseUrl: string, mode: TransportMode): string {
  const base = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  
  switch (mode) {
    case 'fetch':
      return `${base}/api/llm/stream`; // POST endpoint for fetch
    case 'eventsource':
      return `${base}/api/llm/stream`; // GET endpoint for EventSource
    default:
      throw new Error(`Unknown transport mode: ${mode}`);
  }
}

/**
 * Validate transport configuration
 */
export function validateTransportConfig(config: TransportConfig): void {
  if (config.mode && !isTransportSupported(config.mode)) {
    throw new Error(`Transport mode '${config.mode}' is not supported in this environment`);
  }

  if (config.timeout && (config.timeout < 1000 || config.timeout > 300000)) {
    throw new Error('Timeout must be between 1 second and 5 minutes');
  }

  if (config.retryAttempts && (config.retryAttempts < 0 || config.retryAttempts > 10)) {
    throw new Error('Retry attempts must be between 0 and 10');
  }

  if (config.retryDelay && (config.retryDelay < 0 || config.retryDelay > 60000)) {
    throw new Error('Retry delay must be between 0 and 60 seconds');
  }
}

/**
 * Calculate backoff delay for retries
 */
export function calculateBackoffDelay(attempt: number, baseDelay: number): number {
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
  return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
}

/**
 * Create appropriate request options for the selected transport mode
 */
export function createTransportRequestOptions(
  mode: TransportMode,
  config: TransportConfig,
  authToken?: string
): RequestInit | undefined {
  if (mode === 'fetch') {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    };

    // Add Authorization header if token is provided
    if (authToken) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${authToken}`;
    }

    return {
      method: 'POST',
      headers,
      credentials: config.withCredentials ? 'include' : 'same-origin',
    };
  }

  // EventSource doesn't use RequestInit
  return undefined;
}

/**
 * Create EventSource configuration
 */
export function createEventSourceConfig(config: TransportConfig): EventSourceInit | undefined {
  return {
    withCredentials: config.withCredentials || false,
  };
}