/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Player } from '../types'
import { getUserId } from './storage/localStore'
import { bytesOf } from './bytes'

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
  let text = res?.content ?? res?.answer ?? res?.data?.content ?? res?.data?.answer ?? '';
  
  // Strip leaked <think>...</think> tags from response
  if (typeof text === 'string') {
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  }
  
  return text;
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
  const body = { user, payload };
  
  // Add byte size preflight checks
  const bytes = bytesOf(body);
  const playerCount = Array.isArray(params.players) ? params.players.length : 0;

  if (bytes >= 300_000) {
    console.error('[PAYLOAD][ALERT] /draft/initialize bytes', { bytes, players: playerCount });
  } else if (bytes >= 150_000) {
    console.warn('[PAYLOAD][WARN] /draft/initialize bytes', { bytes, players: playerCount });
  }

  const res = await blockingFetch('/draft/initialize', body, 300000); // 300s timeout
  
  // Ensure conversationId persistence after successful response
  if (res?.conversationId) {
    localStorage.setItem('app.draft.conversationId', String(res.conversationId));
  }
  
  return res;
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
  // FIX: Flatten the payload structure as backend expects player, round, pick, conversationId at top level
  const flattenedPayload = {
    user: params.user,
    conversationId: params.conversationId,
    player: params.payload.player,
    round: params.payload.round,
    pick: params.payload.pick
  };
  
  return blockingFetch('/draft/player-taken', flattenedPayload, 60000); // 60s timeout for ACK operation
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
    userRoster: SlimLike[];
    availablePlayers: SlimLike[];
    leagueSize: number;
    pickSlot: number;
  };
}): Promise<any> {
  // Add byte size preflight checks
  const body = params;
  const bytes = bytesOf(body);
  const playerCount = Array.isArray(params.payload.availablePlayers) ? params.payload.availablePlayers.length : 0;

  if (bytes >= 300_000) {
    console.error('[PAYLOAD][ALERT] /draft/user-turn bytes', { bytes, players: playerCount });
  } else if (bytes >= 150_000) {
    console.warn('[PAYLOAD][WARN] /draft/user-turn bytes', { bytes, players: playerCount });
  }

  const res = await blockingFetch('/draft/user-turn', params, 90000); // 90s timeout for user-turn operation
  
  // Ensure conversationId persistence after successful response
  if (res?.conversationId) {
    localStorage.setItem('app.draft.conversationId', String(res.conversationId));
  }
  
  return res;
}
