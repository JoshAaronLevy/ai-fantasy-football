import { useState, useRef, useCallback } from 'react';
import { useDraftStore } from '../state/draftStore';
import type { ConversationMessage } from '../types';

export type InitStreamCallbacks = {
  onStart?: () => void;
  onChunk?: (text: string) => void; // Made optional since we'll persist directly
  onDone?: () => void;
  onError?: (err: unknown) => void;
  onFirstRealEvent?: () => void;
  onMessageEnd?: (fullContent: string) => void; // Made optional since we'll persist directly
};

export function useDraftInitializeStream(): {
  start: (payload: unknown, cb: InitStreamCallbacks) => Promise<void>;
  cancel: () => void;
  isStreaming: boolean;
} {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  
  // Access store methods for persisting streaming content
  const { addConversationMessage, updateConversationMessage } = useDraftStore();
  
  // StrictMode/double-start protection refs
  const activeRequestIdRef = useRef<string | null>(null);
  const isStartingRef = useRef(false);
  const startedOnceRef = useRef(false);
  const lastPayloadRef = useRef<unknown>(null);

  // Deep equal comparison for payloads
  const deepEqual = useCallback((a: unknown, b: unknown): boolean => {
    return JSON.stringify(a) === JSON.stringify(b);
  }, []);

  const cleanup = useCallback(() => {
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Release reader
    if (readerRef.current) {
      readerRef.current.releaseLock();
      readerRef.current = null;
    }

    // Abort controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset state
    activeRequestIdRef.current = null;
    isStartingRef.current = false;
    setIsStreaming(false);
  }, []);

  const cancel = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const parseStreamChunk = useCallback((text: string, onFirstRealEvent: () => void): { content: string; hasRealEvent: boolean; error?: { status?: number; contentType?: string; bodyPreview?: string } } => {
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
  }, []);

  const start = useCallback(async (payload: unknown, cb: InitStreamCallbacks) => {
    // Generate request ID for tracking
    const requestId = Math.random().toString(36).substr(2, 9);
    
    // StrictMode protection: prevent double-start with same payload
    if (isStartingRef.current) {
      return;
    }
    
    // Check if already streaming with same payload - don't abort, just ignore
    if (isStreaming && deepEqual(payload, lastPayloadRef.current)) {
      return;
    }
    
    // If different payload and currently streaming, abort current request
    if (isStreaming && !deepEqual(payload, lastPayloadRef.current)) {
      cleanup();
    }

    // Mark as starting to prevent race conditions
    isStartingRef.current = true;
    startedOnceRef.current = true;
    lastPayloadRef.current = payload;
    activeRequestIdRef.current = requestId;
    setIsStreaming(true);
    
    // Create abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;


    try {
      // Mark starting complete to allow new requests with different payloads
      isStartingRef.current = false;
      
      const response = await fetch('/api/draft/initialize?stream=1', {
        method: 'POST',
        headers: {
          'Accept': 'application/x-ndjson',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      // Check if this request is still active (not superseded)
      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        cleanup();
        cb.onError?.(new Error(`HTTP ${response.status}: ${errorText}`));
        return;
      }

      if (!response.body) {
        // Fallback for no streaming body
        const fullText = await response.text();
        cb.onStart?.();
        cb.onChunk?.(fullText);
        cb.onDone?.();
        cleanup();
        return;
      }

      // Set up streaming
      const reader = response.body.getReader();
      readerRef.current = reader;
      const decoder = new TextDecoder();
      let hasOpenedDrawer = false;
      let hasCreatedMessage = false;
      const STABLE_MESSAGE_ID = 'initialize-latest';

      let isStreamComplete = false;
      
      try {
        while (true) {
          // Check if request is still active before each read
          if (activeRequestIdRef.current !== requestId) {
            break;
          }
          
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }

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
                    
                    // Mark the persisted message as done
                    if (hasCreatedMessage) {
                      updateConversationMessage(STABLE_MESSAGE_ID, {
                        status: 'done'
                      });
                    }
                    
                    // Call optional callback
                    cb.onMessageEnd?.('');
                    break;
                  }
                  
                  if (parsed && parsed.event === 'error') {
                    const errorMsg = parsed.data?.status && parsed.data?.contentType && parsed.data?.bodyPreview
                      ? `HTTP ${parsed.data.status} (${parsed.data.contentType}): ${parsed.data.bodyPreview}`
                      : 'Stream error occurred';
                    cb.onError?.(new Error(errorMsg));
                    return;
                  }
                } catch {
                  // Not valid JSON, continue
                }
              }
              
              const result = parseStreamChunk(decodedText, () => {
                if (!hasOpenedDrawer) {
                  hasOpenedDrawer = true;
                  cb.onFirstRealEvent?.();
                  cb.onStart?.();
                  
                  // Create or reuse the stable message entry in persisted conversation messages
                  if (!hasCreatedMessage) {
                    hasCreatedMessage = true;
                    
                    // Check if a message with the stable ID already exists
                    const { conversationMessages } = useDraftStore.getState();
                    const existingMessage = conversationMessages.find(msg => msg.id === STABLE_MESSAGE_ID);
                    
                    if (existingMessage) {
                      // Reset existing message for new streaming
                      updateConversationMessage(STABLE_MESSAGE_ID, {
                        content: '',
                        timestamp: Date.now(),
                        status: 'streaming'
                      });
                    } else {
                      // Create new message if none exists
                      const newMessage: ConversationMessage = {
                        id: STABLE_MESSAGE_ID,
                        type: 'strategy',
                        content: '',
                        timestamp: Date.now(),
                        status: 'streaming'
                      };
                      addConversationMessage(newMessage);
                    }
                  }
                }
              });
              
              // Handle errors
              if (result.error) {
                const errorMsg = result.error.status && result.error.contentType && result.error.bodyPreview
                  ? `HTTP ${result.error.status} (${result.error.contentType}): ${result.error.bodyPreview}`
                  : 'Stream error occurred';
                cb.onError?.(new Error(errorMsg));
                break;
              }
              
              // Append content directly to persisted message
              if (result.content) {
                cb.onChunk?.(result.content);
                
                // Update the persisted message content by appending the new chunk
                updateConversationMessage(STABLE_MESSAGE_ID, {
                  content: result.content, // This will be appended by the store implementation
                });
              }
              
              // If stream is complete, break out of the loop
              if (isStreamComplete) {
                break;
              }
            }
          }
        }
        cb.onDone?.();
      } catch (error) {
        if (import.meta.env.DEV) console.error(`[init-stream] error for request ${requestId}`, error);
        
        if (controller.signal.aborted) {
          // Provide better error message instead of silent failure
          cb.onError?.(new Error('Stream was cancelled during initialization'));
          return;
        }
        cb.onError?.(error);
      } finally {
        cleanup();
      }
    } catch (error) {
      cleanup();
      if (import.meta.env.DEV) console.error(`[init-stream] outer error for request ${requestId}`, error);
      
      if (controller.signal.aborted) {
        // Provide better error message instead of silent failure
        cb.onError?.(new Error('Request was cancelled during initialization'));
        return;
      }
      cb.onError?.(error);
    }
  }, [isStreaming, cleanup, parseStreamChunk, deepEqual]);

  return {
    start,
    cancel,
    isStreaming
  };
}