import type { ApiRosterPlayer } from '../../types';

export interface SeasonApiError {
  code?: string | number;
  message: string;
}

export async function fetchAllPlayers(opts?: { signal?: AbortSignal }): Promise<ApiRosterPlayer[]> {
  try {
    const res = await fetch('/api/roster/allPlayers', { 
      signal: opts?.signal, 
      headers: { 'Accept': 'application/json' } 
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // Expecting an array of ApiRosterPlayer; if wrapped, adapt accordingly
    return Array.isArray(data) ? data : (data?.players ?? []);
  } catch (e) {
    const err: SeasonApiError = { message: e instanceof Error ? e.message : 'Failed to fetch all players' };
    throw err;
  }
}