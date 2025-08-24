/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Player } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''; // if set, use it; else use Vite proxy

// LEGACY: Initialize interfaces removed - now using streaming payload format
// New format: { action: "initialize", conversationId: null, user: uuid, payload: { numTeams, userPickPosition, players } }

export interface PlayerTakenRequest {
  player: Player;
  conversationId: string;
}

export interface PlayerTakenResponse {
  success: true;
  confirmation: string;
  conversationId: string;
}

export interface UserTurnRequest {
  player: Player;
  round: number;
  pick: number;
  userRoster: Player[];
  availablePlayers: Player[];
  conversationId: string;
}

export interface UserTurnResponse {
  success: true;
  analysis: string;
  conversationId: string;
}

// Helper function for making API requests with proper error handling
async function makeApiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}/api${endpoint}`;
  const defaultOptions: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  };
  
  const res = await fetch(url, { ...defaultOptions, ...options });
  
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API request failed: ${res.status} ${text}`);
  }
  
  return res.json();
}

// Existing function - fetch initial player data
export async function fetchPlayers(): Promise<Player[]> {
  return makeApiRequest<Player[]>('/players');
}

// LEGACY: initializeDraft function removed - now using streaming via useLlmStream hook
// Initialize requests should use: POST /api/llm/stream with { action: "initialize", ... }

// Notify AI when a player is taken in the draft
export async function playerTaken(
  request: PlayerTakenRequest
): Promise<PlayerTakenResponse> {
  return makeApiRequest<PlayerTakenResponse>('/draft/player-taken', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// Get AI analysis when it's the user's turn
export async function userTurn(
  request: UserTurnRequest
): Promise<UserTurnResponse> {
  return makeApiRequest<UserTurnResponse>('/draft/user-turn', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

// Blocking draft initialization
export async function initializeDraftBlocking(params: {
  user: string;
  conversationId: string | null;
  payload: {
    numTeams: number;
    userPickPosition: number;
    players: Array<Record<string, any>>;
  };
}): Promise<{ ok: true; conversationId: string | null; answer: string | null; raw?: any }> {
  console.debug('INIT DRAFT API: start');
  
  try {
    console.debug('INIT DRAFT API: POST /api/draft/initialize');
    const res = await fetch('/api/draft/initialize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    
    console.debug('INIT DRAFT API: response received', res.status);
    
    if (!res.ok) {
      throw new Error(`Initialize request failed: ${res.status}`);
    }
    
    const data = await res.json();
    if (!data.ok) {
      throw new Error(`Initialize failed: ${data.error || 'Unknown error'}`);
    }
    
    console.debug('INIT DRAFT API: success');
    return {
      ok: true,
      conversationId: data.conversationId || null,
      answer: data.answer || null,
      raw: data
    };
  } catch (err) {
    console.debug('INIT DRAFT API: error', err);
    throw err;
  }
}

// Blocking draft reset
export async function resetDraftBlocking(params: {
  user: string;
}): Promise<{ ok: true; resetAcknowledged: true }> {
  const res = await fetch('/api/draft/reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  
  if (!res.ok) {
    throw new Error(`Reset request failed: ${res.status}`);
  }
  
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Reset failed: ${data.error || 'Unknown error'}`);
  }
  
  return {
    ok: true,
    resetAcknowledged: true
  };
}
