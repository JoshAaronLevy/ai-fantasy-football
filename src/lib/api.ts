/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Player } from '../types'
import type { SlimPlayer } from './players/slim'
import { getUserId } from './storage/localStore'
import { bytesOf } from './bytes'
import { classifyError } from './httpErrors'

// Import draftStore for offline mode integration
let draftStore: any = null;
try {
  // Dynamic import to avoid circular dependencies
  import('../state/draftStore').then(module => {
    draftStore = module.useDraftStore;
  });
} catch {
  // Handle gracefully if store is not available
}

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

/**
 * API wrapper that automatically detects offline-worthy errors and triggers offline mode
 * @param apiCall - The API function to call
 * @param options - Configuration options
 * @returns The result from the API call, or handles offline mode if needed
 */
async function withOfflineDetection<T>(
  apiCall: () => Promise<T>,
  options: {
    fallbackToOffline?: boolean;
    operationType?: 'initializeDraft' | 'playerTaken' | 'userTurn';
    payload?: Record<string, unknown>;
  } = {}
): Promise<T> {
  try {
    const result = await apiCall();
    
    // Check if result indicates an error (from blockingFetch)
    if (result && typeof result === 'object' && 'error' in result) {
      const classification = classifyError(result);
      
      if (classification.offlineWorthy && draftStore) {
        const store = draftStore.getState();
        
        // Only set offline mode if not already offline
        if (!store.isOfflineMode) {
          store.setOfflineMode(true);
          store.setShowOfflineBanner(true);
          
          // Add pending API call if specified
          if (options.operationType && options.payload) {
            store.addPendingApiCall(options.operationType, options.payload);
          }
        }
        
        // If fallback is enabled, return a default offline response
        if (options.fallbackToOffline) {
          return { error: { code: 'OFFLINE', message: 'Operating in offline mode' } } as T;
        }
      }
    }
    
    return result;
  } catch (error) {
    const classification = classifyError(error);
    
    if (classification.offlineWorthy && draftStore) {
      const store = draftStore.getState();
      
      // Only set offline mode if not already offline
      if (!store.isOfflineMode) {
        store.setOfflineMode(true);
        store.setShowOfflineBanner(true);
        
        // Add pending API call if specified
        if (options.operationType && options.payload) {
          store.addPendingApiCall(options.operationType, options.payload);
        }
      }
      
      // If fallback is enabled, return a default offline response
      if (options.fallbackToOffline) {
        return { error: { code: 'OFFLINE', message: 'Operating in offline mode' } } as T;
      }
    }
    
    // Re-throw non-offline-worthy errors
    throw error;
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

// Marco/Polo reconnection mechanism
export async function pingMarco(): Promise<boolean> {
  try {
    const res = await blockingFetch('/draft/marco', { user: getUserId() }, 15_000);
    const ans = (res?.answer ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return res?.ok === true && ans === 'Polo!';
  } catch { return false; }
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

  return withOfflineDetection(
    async () => {
      const res = await blockingFetch('/draft/initialize', body, 300000); // 300s timeout
      
      // Ensure conversationId persistence after successful response
      if (res?.conversationId) {
        localStorage.setItem('app.draft.conversationId', String(res.conversationId));
      }
      
      return res;
    },
    {
      operationType: 'initializeDraft',
      payload: params
    }
  );
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
  
  // Add byte size preflight checks
  const bytes = bytesOf(flattenedPayload);
  const playerName = params.payload.player?.name || 'Unknown';

  if (bytes >= 300_000) {
    console.error('[PAYLOAD][ALERT] /draft/player-taken bytes', { bytes, player: playerName, round: params.payload.round, pick: params.payload.pick });
  } else if (bytes >= 150_000) {
    console.warn('[PAYLOAD][WARN] /draft/player-taken bytes', { bytes, player: playerName, round: params.payload.round, pick: params.payload.pick });
  }
  
  return withOfflineDetection(
    async () => blockingFetch('/draft/player-taken', flattenedPayload, 60000), // 60s timeout for ACK operation
    {
      operationType: 'playerTaken',
      payload: params
    }
  );
}

// Player drafted notification
export async function userDraftedBlocking(params: {
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
  
  return blockingFetch('/draft/user-drafted', flattenedPayload, 60000); // 60s timeout for ACK operation
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

  return withOfflineDetection(
    async () => {
      const res = await blockingFetch('/draft/user-turn', params, 90000); // 90s timeout for user-turn operation
      
      // Ensure conversationId persistence after successful response
      if (res?.conversationId) {
        localStorage.setItem('app.draft.conversationId', String(res.conversationId));
      }
      
      return res;
    },
    {
      operationType: 'userTurn',
      payload: params
    }
  );
}

/**
 * Analyze the current draft situation using the new /draft/analyze endpoint
 * @param params - Draft analysis parameters
 * @returns Promise resolving to analysis response
 */
export async function analyzeBlocking(params: {
  conversationId: string;
  round: number;
  pick: number;
  roster: SlimPlayer[];
  availablePlayers: SlimPlayer[];
  leagueSize?: number;
  pickSlot?: number;
}): Promise<any> {
  const body = {
    user: getUserId(),
    conversationId: params.conversationId,
    query: "analyze",
    payload: {
      round: params.round,
      pick: params.pick,
      userRoster: params.roster,
      availablePlayers: params.availablePlayers,
      leagueSize: params.leagueSize,
      pickSlot: params.pickSlot
    }
  };
  
  // DEBUG: Log the exact players being sent to API
  console.debug('DEBUG: analyzeBlocking payload details', {
    round: params.round,
    pick: params.pick,
    rosterSize: params.roster.length,
    availablePlayersCount: params.availablePlayers.length,
    availablePlayerNames: params.availablePlayers.map(p => ({ id: p.id, name: p.name })).slice(0, 10),
    leagueSize: params.leagueSize,
    pickSlot: params.pickSlot
  });
  
  // Add byte size preflight checks
  const bytes = bytesOf(body);
  const playerCount = Array.isArray(params.availablePlayers) ? params.availablePlayers.length : 0;

  if (bytes >= 300_000) {
    console.error('[PAYLOAD][ALERT] /draft/analyze bytes', { bytes, players: playerCount });
  } else if (bytes >= 150_000) {
    console.warn('[PAYLOAD][WARN] /draft/analyze bytes', { bytes, players: playerCount });
  }

  const res = await blockingFetch('/draft/analyze', body, 90000); // 90s timeout
  
  // Ensure conversationId persistence after successful response
  if (res?.conversationId) {
    localStorage.setItem('app.draft.conversationId', String(res.conversationId));
  }
  
  return res;
}

/**
 * Query the draft assistant with a user message using the new /draft/query endpoint
 * @param params - Draft query parameters including user message
 * @returns Promise resolving to query response with extracted text and conversationId
 */
export async function queryBlocking(params: {
  conversationId?: string | null;
  round: number;
  pick: number;
  roster: SlimPlayer[];
  availablePlayers: SlimPlayer[];
  leagueSize?: number;
  pickSlot?: number;
  userMessage: string;
}): Promise<{ text: string; conversationId?: string }> {
  const body = {
    user: getUserId(),
    conversationId: params.conversationId,
    query: params.userMessage,
    payload: {
      round: params.round,
      pick: params.pick,
      userRoster: params.roster,
      availablePlayers: params.availablePlayers,
      leagueSize: params.leagueSize,
      pickSlot: params.pickSlot
    }
  };
  
  // DEBUG: Log the exact players being sent to API
  console.debug('DEBUG: queryBlocking payload details', {
    round: params.round,
    pick: params.pick,
    rosterSize: params.roster.length,
    availablePlayersCount: params.availablePlayers.length,
    availablePlayerNames: params.availablePlayers.map(p => ({ id: p.id, name: p.name })).slice(0, 10),
    leagueSize: params.leagueSize,
    pickSlot: params.pickSlot,
    userMessage: params.userMessage
  });
  
  // Add byte size preflight checks
  const bytes = bytesOf(body);
  const playerCount = Array.isArray(params.availablePlayers) ? params.availablePlayers.length : 0;

  if (bytes >= 300_000) {
    console.error('[PAYLOAD][ALERT] /draft/query bytes', { bytes, players: playerCount });
  } else if (bytes >= 150_000) {
    console.warn('[PAYLOAD][WARN] /draft/query bytes', { bytes, players: playerCount });
  }

  const res = await blockingFetch('/draft/query', body, 90000); // 90s timeout
  
  // Extract text from response using helper function
  const text = getTextFromLlmResponse(res);
  
  // Ensure conversationId persistence after successful response
  if (res?.conversationId) {
    localStorage.setItem('app.draft.conversationId', String(res.conversationId));
  }
  
  return {
    text,
    conversationId: res?.conversationId
  };
}
