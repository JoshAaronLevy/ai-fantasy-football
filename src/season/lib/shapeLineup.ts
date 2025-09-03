import type { ApiRosterPlayer, Matchup } from '../../types';

export const LINEUP_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DST', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN'] as const;

export interface ShapedRow {
  slotPosition: typeof LINEUP_POSITIONS[number];
  name: string;
  position: string; // 'QB'|'RB'|'WR'|'TE'|'K'|'D/ST'
  teamAbbr?: string;
  teamLogoUrl?: string;
  projPoints?: number | null;
  isStarter: boolean; // false for BN rows
  opponent?: string; // Opponent abbreviation for display (e.g., "vs NYG", "@LAR")
  matchup?: Matchup; // Full matchup object containing schedule details
}

export function shapeLineup(players: ApiRosterPlayer[]): ShapedRow[] {  
  // Create a copy to avoid mutating the original array
  const availablePlayers = [...players];
  const shapedRows: ShapedRow[] = [];
  
  // Helper to create a shaped row from a player
  const createRow = (player: ApiRosterPlayer | null, slotPosition: typeof LINEUP_POSITIONS[number]): ShapedRow => {
    if (!player) {
      // Create empty row
      return {
        slotPosition,
        name: '---',
        position: slotPosition === 'DST' ? 'D/ST' : slotPosition.replace(/[0-9]/g, ''),
        isStarter: slotPosition !== 'BN',
      };
    }
    
    // Determine opponent display if matchup is available
    let opponent: string | undefined;
    if (player.matchup && player.team?.abbr) {
      const isHome = player.matchup.homeTeam === player.team.abbr;
      const opponentTeam = isHome ? player.matchup.awayTeam : player.matchup.homeTeam;
      opponent = isHome ? opponentTeam : `@${player.matchup.homeTeam}`;
    }
    
    const row = {
      slotPosition,
      name: player.name,
      position: player.position,
      teamAbbr: player.team?.abbr,
      teamLogoUrl: player.team?.logoUrl,
      projPoints: player.projectedPoints ?? null,
      isStarter: slotPosition !== 'BN',
      matchup: player.matchup, // Pass through the matchup data if available
      opponent: opponent || (player.opponent as string | undefined), // Use computed opponent, fallback to original
    };

    return row;
  };
  
  // Helper to find and remove a player from available list
  const takePlayer = (condition: (p: ApiRosterPlayer) => boolean): ApiRosterPlayer | null => {
    const index = availablePlayers.findIndex(condition);
    if (index >= 0) {
      return availablePlayers.splice(index, 1)[0];
    }
    return null;
  };
  
  // Fill primary positions first (QB, RB, RB, WR, WR, TE, K, DST)
  const primaryPositions: Array<{ slot: typeof LINEUP_POSITIONS[number], position: string }> = [
    { slot: 'QB', position: 'QB' },
    { slot: 'RB', position: 'RB' },
    { slot: 'RB', position: 'RB' },
    { slot: 'WR', position: 'WR' },
    { slot: 'WR', position: 'WR' },
    { slot: 'TE', position: 'TE' },
    { slot: 'K', position: 'K' },
    { slot: 'DST', position: 'D/ST' },
  ];
  
  // Track used RB/WR/TE count for duplicate positions
  const positionCounts: Record<string, number> = {};
  
  primaryPositions.forEach(({ slot, position }) => {
    // First try to find a starter for this position
    let player = takePlayer(p => p.position === position && p.isStarter === true);
    
    // If no starter, take first available for that position
    if (!player) {
      player = takePlayer(p => p.position === position);
    }
    
    shapedRows.push(createRow(player, slot));
    
    if (player) {
      positionCounts[position] = (positionCounts[position] || 0) + 1;
    }
  });
  
  // Fill FLEX position
  // FLEX = highest-priority RB/WR/TE not already placed
  // Prefer one with starter === true if present, else first eligible
  let flexPlayer = takePlayer(p => 
    (p.position === 'RB' || p.position === 'WR' || p.position === 'TE') && 
    p.isStarter === true
  );
  
  if (!flexPlayer) {
    flexPlayer = takePlayer(p => 
      p.position === 'RB' || p.position === 'WR' || p.position === 'TE'
    );
  }
  
  shapedRows.push(createRow(flexPlayer, 'FLEX'));
  
  // Fill bench positions with remaining players (any position)
  for (let i = 0; i < 7; i++) {
    const benchPlayer = availablePlayers.shift() || null;
    shapedRows.push(createRow(benchPlayer, 'BN'));
  }
  
  return shapedRows;
}