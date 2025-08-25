/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Player } from '../types'
import { getUserId } from './storage/localStore'

// Lightweight local types for API client
type SlimLike = {
  id: string;
  name: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';
  team: { abbr: string };
  byeWeek: number | null;
  adp: number | null;
  expectedRound: number | null;
};

type MinimalPickPlayer = SlimLike;

/**
 * Helper function to extract text from LLM response data
 */
export function getTextFromLlmResponse(res: any): string {
  return res?.content ?? res?.answer ?? res?.data?.content ?? res?.data?.answer ?? '';
}

/**
 * Helper function to format API error messages consistently
 */
export function formatApiError(data: any, defaultMessage = 'Request failed'): string {
  if (data?.error?.code && data?.error?.message) {
    const { code, message } = data.error;
    
    // Handle common HTTP status codes with user-friendly context
    if (code === 400) {
      // Check for specific missing user field error
      if (message.toLowerCase().includes('missing required field: user')) {
        return 'Session issue: missing user id. Please refresh the page.';
      }
      return `Validation: ${message}`;
    } else if (code === 502) {
      return `Server Error: ${message}`;
    } else if (code === 504 || code === 'TIMEOUT') {
      return `Timeout: ${message}`;
    }
    
    // Default format for other error codes
    return `${code}: ${message}`;
  }
  
  return defaultMessage;
}

// Shared helper for blocking fetch with per-call timeout
async function blockingFetch(
  endpoint: string,
  body: any,
  timeoutMs: number = 30000
): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const res = await fetch(`/api${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => ({}));
    
    // Don't throw on server errors - return them as JSON for UI handling
    if (!res.ok && data?.error) {
      return data;
    }
    
    if (!res.ok) {
      return { error: { code: res.status, message: `HTTP ${res.status}` } };
    }
    
    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      return { error: { code: 'TIMEOUT', message: 'Request timed out' } };
    }
    return { error: { code: 'NETWORK', message: err instanceof Error ? err.message : 'Network error' } };
  }
}

// Existing function - fetch initial player data
export async function fetchPlayers(): Promise<Player[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout
  
  try {
    const res = await fetch('/api/players', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      throw new Error(`Failed to fetch players: ${res.status}`);
    }
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Request timed out while fetching players');
    }
    throw err;
  }
}

// Ping endpoint to check if Dify LLM is responsive
export async function marcoPingBlocking(): Promise<{ answer: string; upstreamStatus: number; duration_ms: number }> {
  const user = getUserId();
  const resp = await blockingFetch('/draft/marco', { user }, 60_000); // 60s timeout for ACK ping
  // Expect { ok, answer, upstreamStatus, duration_ms }
  return { answer: resp.answer ?? '', upstreamStatus: resp.upstreamStatus ?? 0, duration_ms: resp.duration_ms ?? 0 };
}

// Initialize draft - does NOT send conversationId on first call
export async function initializeDraftBlocking(params: {
  numTeams: number;
  userPickPosition: number;
  players: Array<SlimLike>;
}): Promise<any> {
  const user = getUserId();
  const payload = params;
  console.log('Initializing draft with payload: ', payload);
  return blockingFetch('/draft/initialize', { user, payload }, 300000); // 300s timeout
}

// Reset draft
export async function resetBlocking(params: {
  conversationId?: string;
  user: string;
}): Promise<any> {
  return blockingFetch('/draft/reset', params, 60000); // 60s timeout for ACK operation
}

// Player taken notification
export async function playerTakenBlocking(params: {
  user: string;
  conversationId: string;
  payload: {
    round: number;
    pick: number;
    player: MinimalPickPlayer;
  };
}): Promise<any> {
  return blockingFetch('/draft/player-taken', params, 60000); // 60s timeout for ACK operation
}

// Player drafted notification
export async function playerDraftedBlocking(params: {
  user: string;
  conversationId: string;
  payload: {
    round: number;
    pick: number;
    player: MinimalPickPlayer;
  };
}): Promise<any> {
  return blockingFetch('/draft/player-drafted', params, 60000); // 60s timeout for ACK operation
}

// User turn analysis
export async function userTurnBlocking(params: {
  user: string;
  conversationId: string;
  payload: {
    round: number;
    pick: number;
    roster: SlimLike[];
    availablePlayers: SlimLike[];
    numTeams: number;
    slot: number;
  };
}): Promise<any> {
  return blockingFetch('/draft/user-turn', params, 90000); // 90s timeout for user-turn operation
}
