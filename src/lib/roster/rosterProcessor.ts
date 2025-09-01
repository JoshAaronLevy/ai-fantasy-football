import type { SeasonRoster, RosterPlayer, SeasonTeam } from '../../types'

interface RawRosterData {
  teams: Array<{
    id: string;
    name: string;
    abbreviation: string;
    logoUrl: string;
    players: Array<{
      id: string;
      name: string;
      position: string;
      team: {
        abbr: string;
        logoUrl: string;
      };
      projectedPoints?: number;
      isStarter?: boolean;
      slotPosition?: string;
    }>;
  }>;
}

interface ProcessedRosterData {
  teams: SeasonTeam[];
  rosters: Record<string, SeasonRoster>;
}

/**
 * Define the exact 16-row lineup order for Season Mode
 */
const ROSTER_SLOT_ORDER = [
  'QB',    // 1
  'RB',    // 2  
  'RB',    // 3
  'WR',    // 4
  'WR',    // 5
  'TE',    // 6
  'FLEX',  // 7
  'K',     // 8
  'DST',   // 9
  'BN',    // 10
  'BN',    // 11
  'BN',    // 12
  'BN',    // 13
  'BN',    // 14
  'BN',    // 15
  'BN'     // 16
] as const;

/**
 * Convert raw API roster data into the standardized 16-row format
 */
export function processRosterData(rawData: RawRosterData): ProcessedRosterData {
  const teams: SeasonTeam[] = [];
  const rosters: Record<string, SeasonRoster> = {};

  for (const rawTeam of rawData.teams) {
    // Process team data
    const team: SeasonTeam = {
      id: rawTeam.id,
      name: rawTeam.name,
      abbreviation: rawTeam.abbreviation,
      logoUrl: rawTeam.logoUrl
    };
    teams.push(team);

    // Process roster data
    const processedPlayers = processTeamRoster(rawTeam.players);
    const totalProjectedPoints = calculateTotalProjectedPoints(processedPlayers);

    rosters[rawTeam.id] = {
      teamId: rawTeam.id,
      teamName: rawTeam.name,
      players: processedPlayers,
      totalProjectedPoints,
      lastUpdated: Date.now()
    };
  }

  return { teams, rosters };
}

/**
 * Process a team's raw player data into the 16-row format
 */
function processTeamRoster(rawPlayers: Array<{
  id: string;
  name: string;
  position: string;
  team: { abbr: string; logoUrl: string };
  projectedPoints?: number;
  isStarter?: boolean;
  slotPosition?: string;
}>): RosterPlayer[] {
  const processedPlayers: RosterPlayer[] = [];
  
  // Group players by position
  const playersByPosition = groupPlayersByPosition(rawPlayers);
  
  // Assign players to the 16 roster slots
  for (let i = 0; i < ROSTER_SLOT_ORDER.length; i++) {
    const slotType = ROSTER_SLOT_ORDER[i];
    const slotPosition = generateSlotPosition(slotType, i);
    
    let assignedPlayer: RosterPlayer;
    
    if (slotType === 'BN') {
      // For bench slots, assign any remaining player
      assignedPlayer = assignBenchPlayer(playersByPosition, slotPosition);
    } else if (slotType === 'FLEX') {
      // For FLEX, assign best available RB/WR/TE
      assignedPlayer = assignFlexPlayer(playersByPosition, slotPosition);
    } else {
      // For starter positions, assign best available player of that position
      assignedPlayer = assignStarterPlayer(playersByPosition, slotType, slotPosition);
    }
    
    processedPlayers.push(assignedPlayer);
  }
  
  return processedPlayers;
}

/**
 * Group players by their position for easier assignment
 */
function groupPlayersByPosition(players: Array<{
  id: string;
  name: string;
  position: string;
  team: { abbr: string; logoUrl: string };
  projectedPoints?: number;
}>): Record<string, Array<{
  id: string;
  name: string;
  position: string;
  team: { abbr: string; logoUrl: string };
  projectedPoints: number;
}>> {
  const grouped: Record<string, Array<{
    id: string;
    name: string;
    position: string;
    team: { abbr: string; logoUrl: string };
    projectedPoints: number;
  }>> = {};
  
  for (const player of players) {
    const pos = player.position;
    if (!grouped[pos]) {
      grouped[pos] = [];
    }
    
    grouped[pos].push({
      ...player,
      projectedPoints: player.projectedPoints || 0
    });
  }
  
  // Sort each position group by projected points (descending)
  for (const position in grouped) {
    grouped[position].sort((a, b) => (b.projectedPoints || 0) - (a.projectedPoints || 0));
  }
  
  return grouped;
}

/**
 * Generate slot position identifier based on slot type and index
 */
function generateSlotPosition(slotType: string, index: number): RosterPlayer['slotPosition'] {
  if (slotType === 'RB') {
    return index === 1 ? 'RB1' : 'RB2';
  }
  if (slotType === 'WR') {
    return index === 3 ? 'WR1' : 'WR2';
  }
  if (slotType === 'BN') {
    const benchIndex = index - 9; // Bench starts at index 9
    return `BN${benchIndex + 1}` as RosterPlayer['slotPosition'];
  }
  return slotType as RosterPlayer['slotPosition'];
}

/**
 * Assign a starter player for the given position
 */
function assignStarterPlayer(
  playersByPosition: Record<string, Array<{
    id: string;
    name: string;
    position: string;
    team: { abbr: string; logoUrl: string };
    projectedPoints: number;
  }>>,
  position: string,
  slotPosition: RosterPlayer['slotPosition']
): RosterPlayer {
  const availablePlayers = playersByPosition[position] || [];
  
  if (availablePlayers.length > 0) {
    const player = availablePlayers.shift()!; // Take the best available
    return {
      id: player.id,
      name: player.name,
      position: player.position,
      team: player.team,
      projectedPoints: player.projectedPoints,
      isStarter: true,
      slotPosition
    };
  }
  
  // Return empty slot if no player available
  return createEmptySlot(slotPosition, position);
}

/**
 * Assign a FLEX player (best available RB/WR/TE)
 */
function assignFlexPlayer(
  playersByPosition: Record<string, Array<{
    id: string;
    name: string;
    position: string;
    team: { abbr: string; logoUrl: string };
    projectedPoints: number;
  }>>,
  slotPosition: RosterPlayer['slotPosition']
): RosterPlayer {
  // Find best available RB, WR, or TE for FLEX
  const flexPositions = ['RB', 'WR', 'TE'];
  let bestPlayer: {
    id: string;
    name: string;
    position: string;
    team: { abbr: string; logoUrl: string };
    projectedPoints: number;
  } | null = null;
  let bestPosition = '';
  
  for (const pos of flexPositions) {
    const players = playersByPosition[pos] || [];
    if (players.length > 0 && (!bestPlayer || players[0].projectedPoints > bestPlayer.projectedPoints)) {
      bestPlayer = players[0];
      bestPosition = pos;
    }
  }
  
  if (bestPlayer) {
    // Remove from the position group
    const index = playersByPosition[bestPosition].indexOf(bestPlayer);
    playersByPosition[bestPosition].splice(index, 1);
    
    return {
      id: bestPlayer.id,
      name: bestPlayer.name,
      position: bestPlayer.position,
      team: bestPlayer.team,
      projectedPoints: bestPlayer.projectedPoints,
      isStarter: true,
      slotPosition
    };
  }
  
  return createEmptySlot(slotPosition, 'FLEX');
}

/**
 * Assign a bench player (any remaining player)
 */
function assignBenchPlayer(
  playersByPosition: Record<string, Array<{
    id: string;
    name: string;
    position: string;
    team: { abbr: string; logoUrl: string };
    projectedPoints: number;
  }>>,
  slotPosition: RosterPlayer['slotPosition']
): RosterPlayer {
  // Find any remaining player with highest projected points
  let bestPlayer: {
    id: string;
    name: string;
    position: string;
    team: { abbr: string; logoUrl: string };
    projectedPoints: number;
  } | null = null;
  let bestPosition = '';
  
  for (const position in playersByPosition) {
    const players = playersByPosition[position];
    if (players.length > 0 && (!bestPlayer || players[0].projectedPoints > bestPlayer.projectedPoints)) {
      bestPlayer = players[0];
      bestPosition = position;
    }
  }
  
  if (bestPlayer) {
    // Remove from the position group
    const index = playersByPosition[bestPosition].indexOf(bestPlayer);
    playersByPosition[bestPosition].splice(index, 1);
    
    return {
      id: bestPlayer.id,
      name: bestPlayer.name,
      position: bestPlayer.position,
      team: bestPlayer.team,
      projectedPoints: bestPlayer.projectedPoints,
      isStarter: false,
      slotPosition
    };
  }
  
  return createEmptySlot(slotPosition, 'BN');
}

/**
 * Create an empty roster slot
 */
function createEmptySlot(slotPosition: RosterPlayer['slotPosition'], displayPosition: string): RosterPlayer {
  return {
    id: `empty-${slotPosition}`,
    name: '---',
    position: displayPosition === 'BN' ? 'BN' : displayPosition,
    team: { abbr: '---', logoUrl: '' },
    projectedPoints: null,
    isStarter: !slotPosition.startsWith('BN'),
    slotPosition
  };
}

/**
 * Calculate total projected points for a roster (starters only)
 */
function calculateTotalProjectedPoints(players: RosterPlayer[]): number {
  return players
    .filter(player => player.isStarter && player.projectedPoints !== null)
    .reduce((total, player) => total + (player.projectedPoints || 0), 0);
}

/**
 * Extract teams list from processed roster data
 */
export function extractTeams(rawData: RawRosterData): SeasonTeam[] {
  return rawData.teams.map(team => ({
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    logoUrl: team.logoUrl
  }));
}

/**
 * Extract teams list from flat API response format
 */
export function extractTeamsFromFlatData(apiResponse: {
  ok: boolean;
  data: Array<{
    name: string;
    position: string;
    fantasyTeam: string;
    team: { abbr: string; logoUrl: string | null };
    starter: boolean;
  }>
}): SeasonTeam[] {
  if (!apiResponse.ok || !apiResponse.data || !Array.isArray(apiResponse.data)) {
    throw new Error('Invalid API response format');
  }

  // Group players by fantasy team to get unique team names
  const teamMap = new Map<string, string>();
  
  for (const player of apiResponse.data) {
    if (player.fantasyTeam && !teamMap.has(player.fantasyTeam)) {
      teamMap.set(player.fantasyTeam, player.fantasyTeam);
    }
  }

  // Create SeasonTeam objects from the unique fantasy teams
  const teams: SeasonTeam[] = Array.from(teamMap.entries()).map(([teamName]) => {
    // Create a normalized ID from the team name
    const id = teamName.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '');
    
    return {
      id,
      name: teamName,
      abbreviation: teamName.substring(0, 3).toUpperCase(),
      logoUrl: `/logos/${id}.png`
    };
  });

  return teams;
}

/**
 * Extract a single team roster from processed data
 */
export function extractTeamRoster(rawData: RawRosterData, teamId: string): SeasonRoster | null {
  const team = rawData.teams.find(t => t.id === teamId);
  if (!team) return null;
  
  const processedPlayers = processTeamRoster(team.players);
  const totalProjectedPoints = calculateTotalProjectedPoints(processedPlayers);
  
  return {
    teamId: team.id,
    teamName: team.name,
    players: processedPlayers,
    totalProjectedPoints,
    lastUpdated: Date.now()
  };
}