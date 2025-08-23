import type { Player } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || ''; // if set, use it; else use Vite proxy

// TypeScript interfaces for API responses
export interface InitializeDraftRequest {
  numTeams: number;
  userPickPosition: number;
  players: Player[];
}

export interface InitializeDraftResponse {
  success: true;
  strategy: string;
  conversationId: string;
}

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

// Initialize draft with Dify AI
export async function initializeDraft(
  request: InitializeDraftRequest
): Promise<InitializeDraftResponse> {
  return makeApiRequest<InitializeDraftResponse>('/draft/initialize', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

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
