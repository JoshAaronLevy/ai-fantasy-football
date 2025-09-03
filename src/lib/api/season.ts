import type { RosterApiPlayer, RosterMatchup } from '../../types';
import { getUserId } from '../storage/localStore';


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


export async function fetchRosterWithMatchups(teamName: string, weekNumber: number, opts?: { signal?: AbortSignal }): Promise<RosterApiPlayer[]> {
  try {
    // For now, hardcode the values as requested
    const endpoint = `/api/roster/boykies/matchups/1`;
    
    const res = await fetch(endpoint, {
      signal: opts?.signal,
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      console.error('🔥 [API] Request failed with status:', res.status);
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();

    // The API should return an array directly
    const players: RosterApiPlayer[] = Array.isArray(data) ? data : (data?.players ?? []);

    if (players.length > 0) {
      const fantasyTeams = [...new Set(players.map((p: RosterApiPlayer) => p.fantasyTeam?.name))];
      console.log('🔥 [API] Fantasy teams found:', fantasyTeams);
      console.log('🔥 [API] First player example:', players[0]);
      console.log('userRoster[0].matchup.opponent.logoUrl:', players[0].matchup?.opponent?.logoUrl);
    } else {
      console.warn('🔥 [API] WARNING: No players returned from API!');
    }

    console.log('🔥 [API] Roster with matchups fetched successfully, player count:', players.length);

    // Return the raw array from the API response without extra transforms
    return players;
  } catch (e) {
    console.error('🔥 [API] fetchRosterWithMatchups error details:', {
      error: e,
      message: e instanceof Error ? e.message : 'Unknown error',
      stack: e instanceof Error ? e.stack : undefined,
      name: e instanceof Error ? e.name : undefined
    });
    
    // Re-throw the error so the caller can handle it
    const err: SeasonApiError = {
      message: e instanceof Error ? e.message : 'Failed to fetch roster with matchups'
    };
    throw err;
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
export async function analyzeRoster(userId: string, roster: RosterApiPlayer[], week: number) {
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
 * Ensures each player in a roster has matchup.projectedPoints set to a valid number.
 * If projectedPoints is missing or not numeric, it defaults to 0.00.
 * This is required for the Dify integration where projectedPoints must be guaranteed to exist.
 *
 * @param roster - Array of roster objects that may have matchup data
 * @returns New array with matchup.projectedPoints guaranteed to exist as a number
 */
export function ensureProjectedPoints<T extends { matchup?: RosterMatchup }>(roster: T[]): T[] {
  return roster.map(p => {
    const m = p.matchup ?? {};
    const raw = (m as RosterMatchup).projectedPoints;
    const value = Number.isFinite(raw) ? Number(raw) : 0;
    // keep two decimals but store as number
    const fixed = Number(value.toFixed(2));
    return { ...p, matchup: { ...m, projectedPoints: fixed } as RosterMatchup };
  });
}