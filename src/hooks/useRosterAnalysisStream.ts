import { useState, useRef, useCallback } from 'react';
import type { RosterApiPlayer } from '../types';
import { analyzeRosterStreaming, createRosterAnalysisPayload } from '../lib/api/roster';

export type RosterAnalysisStreamCallbacks = {
  onStart?: () => void;
  onChunk?: (text: string) => void; // Made optional since we'll persist directly
  onDone?: () => void;
  onError?: (err: unknown) => void;
  onFirstRealEvent?: () => void;
  onMessageEnd?: (fullContent: string) => void; // Made optional since we'll persist directly
};

export function useRosterAnalysisStream(): {
  start: (payload: unknown, cb: RosterAnalysisStreamCallbacks) => Promise<void>;
  cancel: () => void;
  isStreaming: boolean;
} {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<number | null>(null);
  
  // Note: Store methods for persisting streaming content will be added when seasonStore gets conversation management
  
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


  const start = useCallback(async (payload: unknown, cb: RosterAnalysisStreamCallbacks) => {
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
      
      // Transform payload format for new API helper
      let rosterAnalysisPayload;
      if (payload && typeof payload === 'object' && 'inputs' in payload) {
        const payloadWithInputs = payload as { inputs?: { userRoster?: RosterApiPlayer[], week?: number } };
        const inputs = payloadWithInputs.inputs;
        
        if (inputs && inputs.userRoster && Array.isArray(inputs.userRoster)) {
          // Create proper payload using the new API helper function
          rosterAnalysisPayload = createRosterAnalysisPayload(
            'user', // userId
            inputs.userRoster, // userRoster (single roster format)
            inputs.week || 1, // week
            'streaming' // responseMode
          );
        } else {
          throw new Error('Invalid payload: missing userRoster');
        }
      } else {
        throw new Error('Invalid payload format');
      }

      // Check if this request is still active (not superseded)
      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      // Trigger callbacks to indicate streaming start
      cb.onFirstRealEvent?.();
      cb.onStart?.();

      // Use the new streaming API helper
      const fullContent = await analyzeRosterStreaming(rosterAnalysisPayload, {
        signal: controller.signal
      });

      // Check if this request is still active after streaming completes
      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      // Provide the full content through the chunk callback for compatibility
      cb.onChunk?.(fullContent);
      
      // Call optional callback with accumulated content
      cb.onMessageEnd?.(fullContent);
      
      cb.onDone?.();
      cleanup();
    } catch (error) {
      cleanup();
      if (import.meta.env.DEV) console.error(`[roster-analysis-stream] outer error for request ${requestId}`, error);
      
      if (controller.signal.aborted) {
        // Provide better error message instead of silent failure
        cb.onError?.(new Error('Request was cancelled during roster analysis'));
        return;
      }
      cb.onError?.(error);
    }
  }, [isStreaming, cleanup, deepEqual]);

  return {
    start,
    cancel,
    isStreaming
  };
}