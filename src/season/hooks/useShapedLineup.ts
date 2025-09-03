import { useMemo } from 'react';
import { useSeasonStore } from '../../state';
import { shapeLineup } from '../lib/shapeLineup';
import type { ShapedRow } from '../lib/shapeLineup';

export function useShapedLineup(teamName: string | null): { rows: ShapedRow[] } {
  // Get the primary data source - allPlayers from Season API
  const allPlayers = useSeasonStore(s => s.allPlayers);
  
  // Get enriched roster data if available (includes schedule matchups)
  const boykiesRoster = useSeasonStore(s => s.boykiesRoster);
  const opponentRoster = useSeasonStore(s => s.opponentRoster);
  const selectedOpponentTeam = useSeasonStore(s => s.selectedOpponentTeam);
  
  const teamPlayers = useMemo(() => {
    if (!teamName) {
      console.log(`📊 [USE SHAPED LINEUP] No team name provided`);
      return [];
    }
    
    if (allPlayers && allPlayers.length > 0) {
      const filteredPlayers = allPlayers.filter(p => {
        const match = teamName === 'Boykies'
          ? p.fantasyTeam?.toLowerCase().includes('boykies')
          : p.fantasyTeam === teamName;

        return match;
      });
      
      // Check if we have enriched data to enhance the players
      if (teamName === 'Boykies' && boykiesRoster?.players) {
        // Create a map for quick lookup
        const enrichmentMap = new Map(boykiesRoster.players.map(p => [p.id, p]));
        
        return filteredPlayers.map(player => {
          const enrichedData = enrichmentMap.get(player.id);
          return {
            ...player,
            matchup: enrichedData?.matchup || player.matchup,
            opponent: enrichedData?.opponent || player.opponent
          };
        });
      } else if (teamName !== 'Boykies' && opponentRoster?.players && selectedOpponentTeam?.name === teamName) {
        // Create a map for quick lookup
        const enrichmentMap = new Map(opponentRoster.players.map(p => [p.id, p]));
        
        return filteredPlayers.map(player => {
          const enrichedData = enrichmentMap.get(player.id);
          return {
            ...player,
            matchup: enrichedData?.matchup || player.matchup,
            opponent: enrichedData?.opponent || player.opponent
          };
        });
      }
      
      return filteredPlayers;
    }
    
    // Fallback: If allPlayers is not available, try enriched rosters
    if (teamName === 'Boykies' && boykiesRoster?.players) {
      return boykiesRoster.players.map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        team: p.team,
        fantasyTeam: 'Boykies',
        projectedPoints: p.projectedPoints,
        isStarter: p.isStarter,
        slotPosition: p.slotPosition,
        matchup: p.matchup,
        opponent: p.opponent
      }));
    }
    
    if (teamName !== 'Boykies' && opponentRoster?.players && selectedOpponentTeam?.name === teamName) {
      return opponentRoster.players.map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        team: p.team,
        fantasyTeam: teamName,
        projectedPoints: p.projectedPoints,
        isStarter: p.isStarter,
        slotPosition: p.slotPosition,
        matchup: p.matchup,
        opponent: p.opponent
      }));
    }
    
    return [];
  }, [allPlayers, boykiesRoster, opponentRoster, selectedOpponentTeam, teamName]);

  const rows = useMemo(() => {
    const shapedRows = shapeLineup(teamPlayers);
    return shapedRows;
  }, [teamPlayers]);
  
  return { rows };
}