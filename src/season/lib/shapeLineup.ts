import type { ApiPlayer, MatchupInfo } from '../../types';

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
  matchup?: MatchupInfo; // Full matchup object containing schedule details
}

// Helper function for consistent projected points calculation
function projected(p: ApiPlayer): number {
  return p.matchup?.projectedPoints?.llm ?? p.matchup?.projectedPoints?.default ?? 0;
}

export function shapeLineup(players: ApiPlayer[]): ShapedRow[] {
  // Create a copy to avoid mutating the original array
  const availablePlayers = [...players];
  const shapedRows: ShapedRow[] = [];
  
  // Helper to create a shaped row from a player
  const createRow = (player: ApiPlayer | null, slotPosition: typeof LINEUP_POSITIONS[number]): ShapedRow => {
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
    if (player.matchup) {
      const homeAway = player.matchup.type === 'away' ? '@' : '';
      const oppAbbr = player.matchup.opponent?.abbr ?? '';
      opponent = oppAbbr ? `${homeAway}${oppAbbr}` : '';
    }
    
    const row = {
      slotPosition,
      name: player.name,
      position: player.position,
      teamAbbr: player.team?.abbr,
      teamLogoUrl: player.team?.logoUrl,
      projPoints: projected(player),
      isStarter: slotPosition !== 'BN',
      matchup: player.matchup, // Pass through the matchup data if available
      opponent: opponent || undefined,
    };

    return row;
  };
  
  // Helper to find and remove a player from available list
  const takePlayer = (condition: (p: ApiPlayer) => boolean): ApiPlayer | null => {
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
    let player = takePlayer(p => p.position === position && p.starter === true);
    
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
    p.starter === true
  );
  
  if (!flexPlayer) {
    // If no starter found, find the best remaining RB/WR/TE by projected points
    const flexCandidates = availablePlayers.filter(p =>
      p.position === 'RB' || p.position === 'WR' || p.position === 'TE'
    );
    
    if (flexCandidates.length > 0) {
      // Sort by projected points descending and take the best
      flexCandidates.sort((a, b) => projected(b) - projected(a));
      flexPlayer = takePlayer(p => p === flexCandidates[0]);
    }
  }
  
  shapedRows.push(createRow(flexPlayer, 'FLEX'));
  
  // Fill bench positions with remaining players (any position)
  for (let i = 0; i < 7; i++) {
    const benchPlayer = availablePlayers.shift() || null;
    shapedRows.push(createRow(benchPlayer, 'BN'));
  }
  
  return shapedRows;
}