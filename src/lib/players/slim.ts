/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Slim player types and builders for minimal payloads
 * 
 * Usage rules:
 * - For /player-taken and /user-drafted: use toMinimalPickPlayer for minimal subset
 * - For /user-turn and /initialize: lists must be ≤ 25 players; use mapToSlimTopN or slice accordingly
 */

export type SlimTeam = { abbr: string };

export type SlimPlayer = {
  id: string;
  name: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';
  team: SlimTeam;
  byeWeek: number | null;
  adp: number | null;
  expectedRound: number | null;
  // Optional extended fields (pass only when appropriate):
  previousOverallRank?: number | null;
  newOverallRank?: number | null;
  previousPositionRank?: number | null;
  newPositionRank?: number | null;
  newTeam?: boolean;
  yearsPro?: number | null;
  stats?: Record<string, unknown>;
};

/**
 * Build a SlimPlayer from any player object
 */
export function toSlimPlayer(p: any): SlimPlayer {
  return {
    id: String(p?.id ?? ''),
    name: String(p?.name ?? ''),
    position: p?.position ?? 'WR',
    team: { abbr: p?.team?.abbr ?? '' },
    byeWeek: p?.byeWeek ?? null,
    adp: p?.adp ?? null,
    expectedRound: p?.expectedRound ?? null,
    // keep other extended fields only if already present and small
    previousOverallRank: p?.previousOverallRank ?? null,
    newOverallRank: p?.newOverallRank ?? null,
    previousPositionRank: p?.previousPositionRank ?? null,
    newPositionRank: p?.newPositionRank ?? null,
    newTeam: p?.newTeam ?? false,
    yearsPro: p?.yearsPro ?? null,
    stats: p?.stats ?? undefined,
  };
}

/**
 * Build minimal pick payload from SlimPlayer (for /player-taken, /user-drafted)
 */
export function toMinimalPickPlayer(p: SlimPlayer) {
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    team: { abbr: p.team.abbr },
    byeWeek: p.byeWeek,
    adp: p.adp,
    expectedRound: p.expectedRound,
  };
}

/**
 * Map array to slim players and clamp to top N (default 25)
 */
// OLD: export function mapToSlimTopN(players: any[], n = 25): SlimPlayer[] {
export function mapToSlimTopN(players: any[], n: number): SlimPlayer[] {
  if (!Array.isArray(players)) return [];
  return players.slice(0, Math.max(0, n)).map(toSlimPlayer);
}

/**
 * Build minimal pick payload directly from any player object
 */
export function toMinimalPickFromAny(p: any) {
  return toMinimalPickPlayer(toSlimPlayer(p));
}