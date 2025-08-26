/**
 * Centralized error classification system for determining offline-worthy errors
 */

export interface ErrorClassification {
  offlineWorthy: boolean;
  reason: string;
}

/**
 * Classifies HTTP failures to determine if they are offline-worthy
 * @param status - HTTP status code (or undefined for network errors)
 * @returns Classification with offline-worthy flag and reason
 */
export function classifyHttpFailure(status: number | undefined): ErrorClassification {
  // Network errors (no status) or connection issues
  if (!status || status === 0) {
    return { offlineWorthy: true, reason: 'network' };
  }
  
  // Server errors that indicate temporary unavailability
  if ([502, 503, 504, 408].includes(status)) {
    return { offlineWorthy: true, reason: `http_${status}` };
  }
  
  // Client errors that indicate permanent issues
  if ([400, 401, 403, 404, 409, 422].includes(status)) {
    return { offlineWorthy: false, reason: `http_${status}` };
  }
  
  // Rate limiting - should not trigger offline mode
  if (status === 429) {
    return { offlineWorthy: false, reason: 'http_429' };
  }
  
  // Default case for unknown status codes
  return { offlineWorthy: false, reason: `http_${status}` };
}

/**
 * Type guards for error checking
 */
function hasStatus(obj: unknown): obj is { status: number } {
  return typeof obj === 'object' && obj !== null && 'status' in obj && typeof (obj as Record<string, unknown>).status === 'number';
}

function hasErrorCode(obj: unknown): obj is { error: { code: string | number } } {
  return typeof obj === 'object' && obj !== null && 'error' in obj &&
    typeof (obj as Record<string, unknown>).error === 'object' &&
    (obj as Record<string, unknown>).error !== null &&
    'code' in ((obj as Record<string, unknown>).error as Record<string, unknown>);
}

function hasMessage(obj: unknown): obj is { message: string } {
  return typeof obj === 'object' && obj !== null && 'message' in obj &&
    typeof (obj as Record<string, unknown>).message === 'string';
}

function hasResponseStatus(obj: unknown): obj is { response: { status: number } } {
  return typeof obj === 'object' && obj !== null && 'response' in obj &&
    typeof (obj as Record<string, unknown>).response === 'object' &&
    (obj as Record<string, unknown>).response !== null &&
    'status' in ((obj as Record<string, unknown>).response as Record<string, unknown>) &&
    typeof ((obj as Record<string, unknown>).response as Record<string, unknown>).status === 'number';
}

/**
 * Extracts HTTP status code from various error formats
 * Handles errors from blockingFetch() and thrown errors from other API functions
 */
export function extractErrorStatus(error: unknown): number | undefined {
  // Handle null/undefined
  if (!error) {
    return undefined;
  }
  
  // Direct status property on error object
  if (hasStatus(error)) {
    return error.status;
  }
  
  // blockingFetch() error format: { error: { code: number } }
  if (hasErrorCode(error)) {
    const code = (error.error as Record<string, unknown>).code;
    
    // Handle special string codes from blockingFetch
    if (code === 'NETWORK') {
      return 0; // Network error
    }
    if (code === 'TIMEOUT') {
      return 408; // Request timeout
    }
    
    // Numeric HTTP status codes
    if (typeof code === 'number') {
      return code;
    }
    
    // Handle string numbers
    const parsed = parseInt(String(code), 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  
  // Handle thrown Error objects with status in message
  if (error instanceof Error) {
    return parseStatusFromMessage(error.message);
  }
  
  // Handle objects with message property
  if (hasMessage(error)) {
    return parseStatusFromMessage(error.message);
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return parseStatusFromMessage(error);
  }
  
  // Response object with status property
  if (hasResponseStatus(error)) {
    return error.response.status;
  }
  
  // Unable to determine status
  return undefined;
}

/**
 * Helper function to parse status codes from error messages
 */
function parseStatusFromMessage(message: string): number | undefined {
  // Match patterns like "Failed to fetch players: 502" or "HTTP 404: Not Found"
  const statusMatch = message.match(/(?:HTTP\s+|:\s*)(\d{3})/i);
  if (statusMatch) {
    return parseInt(statusMatch[1], 10);
  }
  
  // Check for timeout indicators in message
  if (message.toLowerCase().includes('timeout') || message.toLowerCase().includes('timed out')) {
    return 408;
  }
  
  // Check for network error indicators
  if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
    return 0;
  }
  
  return undefined;
}

/**
 * Convenience function that combines error status extraction and classification
 */
export function classifyError(error: unknown): ErrorClassification {
  const status = extractErrorStatus(error);
  return classifyHttpFailure(status);
}