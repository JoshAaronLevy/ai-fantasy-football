import { useRef, useCallback } from 'react';
import type { AnalyzeResponse, ApiPlayer } from '../types';
import { analyzeRosterBlocking } from '../lib/api/roster';
import { useSeasonStore } from '../state/seasonStore';

export interface RosterAnalysisStreamCallbacks {
  onProgress?: (data: unknown) => void; // unused now
  onComplete?: (data: AnalyzeResponse) => void;
  onError?: (err: Error) => void;
}

export function useRosterAnalysisStream() {
  const isStreaming = useSeasonStore((state) => state.isStreaming);
  const setIsStreaming = useSeasonStore((state) => state.setIsStreaming);
  const inFlight = useRef(false);

  const start = useCallback(async (players: ApiPlayer[], cb?: RosterAnalysisStreamCallbacks) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsStreaming(true);
    try {
      const data = await analyzeRosterBlocking(players);
      cb?.onComplete?.(data);
    } catch (e: unknown) {
      cb?.onError?.(e instanceof Error ? e : new Error(String(e)));
    } finally {
      inFlight.current = false;
      setIsStreaming(false);
    }
  }, [setIsStreaming]);

  const cancel = useCallback(() => {
    // No-op for API compatibility, blocking requests can't be cancelled easily
    inFlight.current = false;
    setIsStreaming(false);
  }, [setIsStreaming]);

  return { start, cancel, isStreaming };
}