import type { ApiPlayer } from '../../types';
import { getUserId } from '../storage/localStore';
import { normalizePlayers } from '../../season/lib/normalizePlayer';

// At top-level of this module (near imports)
const activeRosterRequests = new Map<string, Promise<ApiPlayer[]>>();

export interface SeasonApiError {
  code?: string | number;
  message: string;
}

export interface ApiErrorResponse {
  error: {
    code: string | number;
    message: string;
  };
}

export interface RosterAnalysisResponse {
  [key: string]: unknown;
}


export function buildRosterUrl(team: string, week: number | string): string {
  return `/api/v1/roster/${encodeURIComponent(team)}/${encodeURIComponent(String(week))}`;
}

export async function fetchRosterWithMatchups(teamName: string, weekNumber: number | string): Promise<ApiPlayer[]> {
  const key = `${teamName}:${String(weekNumber)}`;

  if (activeRosterRequests.has(key)) {
    if (import.meta?.env?.DEV) console.debug('[API] single-flight reuse', key);
    return activeRosterRequests.get(key)!;
  }

  const p = (async () => {
    const res = await fetch(buildRosterUrl(teamName, weekNumber));
    if (!res.ok) throw new Error(`Roster fetch failed: ${res.status}`);
    const raw = await res.json();
    const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.roster) ? raw.roster : []);
    return normalizePlayers(arr);
  })();

  activeRosterRequests.set(key, p);
  try {
    return await p;
  } finally {
    activeRosterRequests.delete(key);
  }
}

/**
 * Fetch schedule data for a specific week
 * @param weekNumber - The week number to fetch schedule for
 * @param opts - Optional configuration including abort signal
 * @returns Schedule data for the specified week
 * @throws {SeasonApiError} If the request fails or week number is invalid
 */
export async function fetchSchedule(weekNumber: number, opts?: { signal?: AbortSignal }): Promise<unknown> {
  // Validate week number
  if (!Number.isInteger(weekNumber) || weekNumber < 1) {
    const err: SeasonApiError = { message: 'Invalid week number' };
    throw err;
  }

  try {
    console.log(`🏈 [SCHEDULE API] Fetching schedule for week ${weekNumber}`);
    const userId = getUserId();
    const res = await fetch(`/api/schedule/${weekNumber}`, {
      signal: opts?.signal,
      headers: {
        'Accept': 'application/json',
        'X-User-Id': userId
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    console.log(`🏈 [SCHEDULE API] Raw response for week ${weekNumber}:`, data);
    console.log(`🏈 [SCHEDULE API] Response structure:`, {
      hasWeek: 'week' in data,
      hasGames: 'games' in data,
      gamesCount: Array.isArray(data.games) ? data.games.length : 'not array',
      firstGameStructure: Array.isArray(data.games) && data.games.length > 0 ? Object.keys(data.games[0]) : 'no games'
    });
    return data;
  } catch (e) {
    console.error(`🏈 [SCHEDULE API] Failed to fetch schedule for week ${weekNumber}:`, e);
    const err: SeasonApiError = { message: e instanceof Error ? e.message : 'Failed to fetch schedule' };
    throw err;
  }
}

/**
 * Analyze roster data using Dify API with blocking response mode
 * @param userId - User identifier for the Dify request
 * @param roster - The roster array to analyze (should have matchup.projectedPoints)
 * @param week - The week number for analysis context
 * @returns Raw response from Dify API with content-type detection
 */
export async function analyzeRoster(userId: string, roster: ApiPlayer[], week: number) {
  const body = {
    response_mode: 'blocking',
    user: String(userId),
    query: 'Analyze rosters for weekly projections.',
    inputs: {
      userRoster: roster,       // AS-IS
      opponentRoster: [],
      week
    }
  };
  const res = await fetch('/api/roster/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const data = await res.json();
    return { kind: 'json', status: res.status, data };
  } else {
    const data = await res.text();
    return { kind: 'text', status: res.status, data };
  }
}

/**
 * Legacy function - now a no-op since normalizePlayers handles projected points.
 * Kept for compatibility but does nothing since ApiPlayer already has proper structure.
 */
export function ensureProjectedPoints<T>(roster: T[]): T[] {
  return roster;
}