/**
 * Shared streaming utilities for handling Server-Sent Events and NDJSON streams
 * Used by both draft initialization and roster analysis streaming
 */

export interface StreamChunkResult {
  content: string;
  hasRealEvent: boolean;
  error?: {
    status?: number;
    contentType?: string;
    bodyPreview?: string;
  };
}

export interface StreamReaderOptions {
  signal?: AbortSignal;
  onStart?: () => void;
  onChunk?: (text: string) => void;
  onDone?: () => void;
  onError?: (err: unknown) => void;
  onFirstRealEvent?: () => void;
  onMessageEnd?: (fullContent: string) => void;
}

/**
 * Parses a chunk of streaming text for structured events and raw content
 * @param text - The raw chunk text to parse
 * @param onFirstRealEvent - Callback for when the first real content event is detected
 * @returns Parsed content and metadata about the chunk
 */
export function parseStreamChunk(
  text: string, 
  onFirstRealEvent: () => void
): StreamChunkResult {
  const lines = text.split('\n');
  const chunks: string[] = [];
  let hasRealEvent = false;
  let errorInfo: { status?: number; contentType?: string; bodyPreview?: string } | undefined;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue; // Skip blank lines
    
    try {
      const parsed = JSON.parse(trimmedLine);
      
      // Check if this is a structured event
      if (parsed && typeof parsed === 'object' && 'event' in parsed) {
        const eventType = parsed.event;
        
        // Skip ping and debug events
        if (eventType === 'ping' || eventType === 'debug') {
          continue;
        }
        
        // Handle error events
        if (eventType === 'error' && parsed.data) {
          errorInfo = {
            status: parsed.data.status,
            contentType: parsed.data.contentType,
            bodyPreview: parsed.data.bodyPreview
          };
          continue;
        }
        
        // For first content event (message or message_delta), trigger drawer opening
        if (!hasRealEvent && (eventType === 'message' || eventType === 'message_delta')) {
          hasRealEvent = true;
          onFirstRealEvent();
        }
        
        // Extract content from message and message_delta events
        if ((eventType === 'message' || eventType === 'message_delta') && parsed.data) {
          const piece = parsed.data.answer ?? parsed.data.delta ?? parsed.data.text ?? '';
          if (piece) {
            chunks.push(piece);
          }
        }
        
        // Handle message_end event (marks stream completion)
        if (eventType === 'message_end') {
          // Stream completion will be handled in the main loop
          continue;
        }
      } else {
        // Not a structured event, treat as raw content
        if (!hasRealEvent) {
          hasRealEvent = true;
          onFirstRealEvent();
        }
        chunks.push(trimmedLine);
      }
    } catch {
      // Not valid JSON, treat as raw content
      if (!hasRealEvent) {
        hasRealEvent = true;
        onFirstRealEvent();
      }
      chunks.push(trimmedLine);
    }
  }
  
  return {
    content: chunks.join(''),
    hasRealEvent,
    error: errorInfo
  };
}

/**
 * Reads a streaming response and buffers the entire content
 * @param response - The fetch response with a readable stream body
 * @param options - Configuration options for stream processing
 * @returns Promise that resolves with the complete buffered content
 */
export async function readStreamResponse(
  response: Response,
  options: StreamReaderOptions = {}
): Promise<string> {
  if (!response.body) {
    throw new Error('No response body available for streaming');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulatedContent = '';
  let hasOpenedDrawer = false;
  let isStreamComplete = false;

  try {
    while (true) {
      // Check if request was aborted
      if (options.signal?.aborted) {
        throw new Error('Stream was aborted');
      }
      
      const { done, value } = await reader.read();
      
      if (done) break;

      if (value) {
        const decodedText = decoder.decode(value, { stream: true });
        
        if (decodedText) {
          // Check for message_end event before parsing content
          const lines = decodedText.split('\n');
          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            
            try {
              const parsed = JSON.parse(trimmedLine);
              if (parsed && parsed.event === 'message_end') {
                isStreamComplete = true;
                options.onMessageEnd?.(accumulatedContent);
                break;
              }
              
              if (parsed && parsed.event === 'error') {
                const errorMsg = parsed.data?.status && parsed.data?.contentType && parsed.data?.bodyPreview
                  ? `HTTP ${parsed.data.status} (${parsed.data.contentType}): ${parsed.data.bodyPreview}`
                  : 'Stream error occurred';
                throw new Error(errorMsg);
              }
            } catch {
              // Not valid JSON, continue parsing as content
            }
          }
          
          const result = parseStreamChunk(decodedText, () => {
            if (!hasOpenedDrawer) {
              hasOpenedDrawer = true;
              options.onFirstRealEvent?.();
              options.onStart?.();
            }
          });
          
          // Handle streaming errors
          if (result.error) {
            const errorMsg = result.error.status && result.error.contentType && result.error.bodyPreview
              ? `HTTP ${result.error.status} (${result.error.contentType}): ${result.error.bodyPreview}`
              : 'Stream error occurred';
            throw new Error(errorMsg);
          }
          
          // Buffer content without per-chunk logging
          if (result.content) {
            accumulatedContent += result.content;
            options.onChunk?.(result.content);
          }
          
          // If stream is complete, break out of the loop
          if (isStreamComplete) {
            break;
          }
        }
      }
    }

    options.onDone?.();
    return accumulatedContent;
    
  } catch (error) {
    options.onError?.(error);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Creates standard fetch options for streaming requests
 * @param payload - The request payload to send
 * @param signal - Optional abort signal
 * @returns Standardized fetch options for streaming
 */
export function createStreamingFetchOptions(
  payload: unknown,
  signal?: AbortSignal
): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Accept': 'application/x-ndjson',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    signal
  };
}