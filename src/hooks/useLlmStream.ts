import { useCallback, useRef, useState } from 'react';
import { getConversationId, setConversationId, getUserId } from '../lib/storage/localStore';
import { streamWithFetch, type StreamingEvent } from '../lib/streaming';
import { calculatePayloadCharacterCount } from '../lib/payloadUtils';

type StartParams = { 
  scope: string; 
  action: 'initialize' | 'reset' | 'player-taken' | 'user-turn'; 
  payload: any 
};

export function useLlmStream() {
  const [tokens, setTokens] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConv] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<StreamingEvent | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (p: StartParams) => {
    setError(null);
    setIsStreaming(true);
    setTokens('');
    
    const user = getUserId();
    let conv = getConversationId(p.scope);
    if (p.action === 'initialize' || !conv) conv = null;
    setConv(conv);

    let attempts = 0;
    let receivedAny = false;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      abortRef.current = new AbortController();
      
      try {
        // This body format is correct for the new backend streaming endpoint
        const body = {
          action: p.action,
          conversationId: conv,
          user,
          payload: p.payload
        };

        // Calculate and log payload character count before sending to API
        const payloadCharacterCount = calculatePayloadCharacterCount(body);
        console.log('Payload character count before API call:', payloadCharacterCount);

        for await (const ev of streamWithFetch(body, abortRef.current.signal)) {
          setLastEvent(ev);
          receivedAny = true;

          if (ev.type === 'chunk') {
            const text = typeof ev.content === 'string' ? ev.content
                      : typeof (ev as any).answer === 'string' ? (ev as any).answer
                      : typeof (ev as any).data?.content === 'string' ? (ev as any).data.content
                      : '';
            if (text) {
              receivedAny = true;
              setTokens(t => t + text);
            }
          }

          if (ev.conversationId && ev.conversationId !== conv) {
            conv = ev.conversationId;
            setConv(conv);
            setConversationId(p.scope, conv);
          }

          if (ev.type === 'error') {
            throw new Error(ev.message || 'stream error');
          }

          if (ev.type === 'done') {
            // Extract duration from the done event, preferring formatted duration
            let durationString = 'unknown';
            if (ev.duration) {
              durationString = ev.duration;
            } else if (ev.durationMs) {
              // Format locally if only ms provided
              const ms = ev.durationMs;
              if (ms < 1000) {
                durationString = `${ms}ms`;
              } else if (ms < 60000) {
                const seconds = ms / 1000;
                durationString = seconds < 10 ? `${seconds.toFixed(2)}s` : `${seconds.toFixed(1)}s`;
              } else {
                const minutes = Math.floor(ms / 60000);
                const remainingSeconds = Math.floor((ms % 60000) / 1000);
                durationString = `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`;
              }
            }
            
            console.info('[Stream Complete 4/4] Duration:', durationString);
            break;
          }
        }
        break; // success path
      } catch (e: any) {
        if (e?.name === 'AbortError') break; // user cancelled
        if (receivedAny || attempts >= maxAttempts) {
          setError(String(e?.message || e));
          break;
        }
        // Retry with backoff only if no data received yet
        await new Promise(r => setTimeout(r, attempts === 1 ? 400 : 1200));
      }
    }
    
    setIsStreaming(false);
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setTokens('');
    setError(null);
  }, []);

  return [
    { tokens, error, isStreaming, conversationId, lastEvent }, 
    { start, abort, clear }
  ] as const;
}