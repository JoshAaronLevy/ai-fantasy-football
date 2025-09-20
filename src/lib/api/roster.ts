import type { AnalyzeResponse, ApiPlayer, RosterApiPlayer } from '../../types';

export interface RosterApiError {
  code?: string | number;
  message: string;
}

const ANALYZE_URL = '/api/v1/roster/analyze';

/**
 * Analyzes roster data using a simple blocking POST request
 * @param players - Array of players to analyze  
 * @returns Promise resolving to analysis response with players and meta
 * @throws {Error} If the request fails or response is invalid
 */
export async function analyzeRosterBlocking(players: ApiPlayer[]): Promise<AnalyzeResponse> {
  // Log payload before API call - first 2 players only
  console.log('[ANALYZE STARTERS] Payload before API call (first 2 players):', JSON.stringify(players.slice(0, 2), null, 2));
  
  const res = await fetch(ANALYZE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Send players array directly as API expects
    body: JSON.stringify(players)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Analyze failed: ${res.status} ${res.statusText} ${text}`);
  }

  // Backend returns one JSON object
  const data = (await res.json()) as AnalyzeResponse;

  // light validation
  if (!data || !Array.isArray(data.players) || !data.meta) {
    throw new Error('Analyze: unexpected response shape');
  }
  return data;
}

/**
 * Ensures each player in a roster has matchup.projectedPoints set to "0.00" for missing values.
 * This function implements the client-side projectedPoints defaulting logic as specified
 * in the requirements before making requests to ensure payload compatibility.
 *
 * @param roster - Array of roster players that may have missing projectedPoints
 * @returns New array with matchup.projectedPoints guaranteed to exist as "0.00" for missing values
 */
export function ensureProjectedPoints(roster: RosterApiPlayer[]): RosterApiPlayer[] {
  return roster.map(p => {
    // Only add projectedPoints when missing, without touching other fields
    if (p.matchup && p.matchup.projectedPoints == null) {
      p.matchup.projectedPoints = 0.00;
    }
    return p;
  });
}

/**
 * Validates that a roster array has proper structure for API calls
 * @param roster - The roster array to validate
 * @returns True if the roster has valid structure for API calls
 */
export function validateRosterStructure(roster: unknown): roster is RosterApiPlayer[] {
  if (!Array.isArray(roster)) {
    return false;
  }

  return roster.every(player => 
    player &&
    typeof player === 'object' &&
    typeof player.name === 'string' &&
    (typeof player.position === 'string' || typeof player.pos === 'string')
  );
}

/**
 * Processes roster data to ensure compatibility with streaming analysis
 * This function ensures all required fields are present and properly formatted
 * @param roster - Raw roster data from API or storage
 * @returns Processed roster ready for analysis
 */
export function prepareRosterForAnalysis(roster: RosterApiPlayer[]): RosterApiPlayer[] {
  return ensureProjectedPoints(roster).map(player => ({
    ...player,
    // Ensure position is normalized
    position: player.position || player.pos || 'N/A',
    // Ensure team structure is consistent
    team: typeof player.team === 'string'
      ? { abbr: player.team, logoUrl: `/logos/${player.team.toLowerCase()}.png` }
      : player.team,
    // Ensure fantasy team structure if present
    fantasyTeam: typeof player.fantasyTeam === 'string'
      ? { name: player.fantasyTeam }
      : player.fantasyTeam
  }));
}

/**
 * Backward compatibility wrapper for existing code that might call analyzeRosterStreaming
 * @param payload - Legacy payload (will extract players from it)
 * @param opts - Options with optional onComplete callback
 * @returns Promise resolving to legacy format for compatibility
 * @deprecated Use analyzeRosterBlocking instead
 */
export async function analyzeRosterStreaming(
  payload: { inputs: { roster: RosterApiPlayer[] } }, 
  opts?: { onComplete?: (result: { side: string; requestId: string; roster: RosterApiPlayer[] }) => void }
): Promise<{ side: string; requestId: string; roster: RosterApiPlayer[] }> {
  try {
    // Convert legacy RosterApiPlayer[] to ApiPlayer[] format
    const apiPlayers: ApiPlayer[] = payload.inputs.roster.map(player => ({
      id: player.id,
      name: player.name,
      position: player.position || player.pos || 'N/A',
      fantasyTeam: typeof player.fantasyTeam === 'string' 
        ? { name: player.fantasyTeam }
        : player.fantasyTeam,
      team: typeof player.team === 'string'
        ? { abbr: player.team, logoUrl: `/logos/${player.team.toLowerCase()}.png` }
        : { abbr: player.team.abbr, logoUrl: player.team.logoUrl },
      starter: player.starter,
      matchup: {
        week: player.matchup?.week || 1,
        type: player.matchup?.type,
        opponent: player.matchup?.opponent,
        kickoff: player.matchup?.kickoff,
        projectedScore: player.matchup?.projectedScore,
        finalScore: player.matchup?.finalScore,
        projectedPoints: {
          default: typeof player.matchup?.projectedPoints === 'number'
            ? player.matchup.projectedPoints
            : (player.matchup?.projectedPoints as { default?: number; llm?: number })?.default || null,
          llm: (player.matchup?.projectedPoints as { default?: number; llm?: number })?.llm || null
        }
      }
    }));

    const result = await analyzeRosterBlocking(apiPlayers);
    
    // Convert back to legacy format
    const legacyResult = {
      side: 'user',
      requestId: crypto.randomUUID(),
      roster: result.players.map((player: ApiPlayer) => ({
        id: player.id,
        name: player.name,
        position: player.position,
        team: player.team || { abbr: 'N/A' },
        fantasyTeam: player.fantasyTeam,
        starter: player.starter,
        matchup: {
          week: player.matchup.week,
          type: player.matchup.type,
          opponent: player.matchup.opponent,
          kickoff: player.matchup.kickoff,
          projectedScore: player.matchup.projectedScore,
          finalScore: player.matchup.finalScore,
          projectedPoints: player.matchup.projectedPoints.llm || player.matchup.projectedPoints.default || 0
        }
      })) as RosterApiPlayer[]
    };

    if (opts?.onComplete) {
      opts.onComplete(legacyResult);
    }

    return legacyResult;
  } catch (error) {
    const err: RosterApiError = {
      message: error instanceof Error ? error.message : 'Failed to analyze roster with streaming'
    };
    throw err;
  }
}