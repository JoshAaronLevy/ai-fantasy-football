import type { ApiRosterPlayer, Matchup } from '../../types';

/**
 * Schedule API response structure
 */
export interface ScheduleResponse {
  week: number;
  games: Matchup[];
}

/**
 * Gets opponent display string for a player
 * @param player - The player to get opponent for
 * @returns Formatted opponent string (e.g., "vs NYG", "@LAR") or undefined
 */
export function getPlayerOpponent(player: ApiRosterPlayer): string | undefined {
  if (!player.matchup || !player.team?.abbr) {
    return undefined;
  }

  const isHome = player.matchup.homeTeam === player.team.abbr;
  const opponent = isHome ? player.matchup.awayTeam : player.matchup.homeTeam;
  
  return isHome ? `vs${opponent}` : `@${opponent}`;
}