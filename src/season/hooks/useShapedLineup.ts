import { useMemo } from 'react';
import { useSeasonStore } from '../../state';
import { shapeLineup } from '../lib/shapeLineup';
import type { ShapedRow } from '../lib/shapeLineup';

export function useShapedLineup(teamName: string | null): { rows: ShapedRow[] } {
  // Get the raw player data from the store
  const allPlayersData = useSeasonStore(s => s.allPlayersData);
  const myRoster = useSeasonStore(s => s.myRoster);
  const opponentRosterData = useSeasonStore(s => s.opponentRosterData);
  
  const teamPlayers = useMemo(() => {
    if (!teamName) return [];
    
    // Special handling for Boykies - use myRoster if available
    if (teamName === 'Boykies' && myRoster) {
      return myRoster;
    }
    
    // For opponent teams, first check if we have cached opponent roster data
    if (teamName !== 'Boykies' && opponentRosterData) {
      // Verify it's the right team by checking if any players match
      const hasMatchingPlayers = opponentRosterData.some(p => p.fantasyTeam === teamName);
      if (hasMatchingPlayers) {
        return opponentRosterData;
      }
    }
    
    // Fall back to extracting from allPlayersData
    if (!allPlayersData?.players) return [];
    
    return allPlayersData.players.filter(p => p.fantasyTeam === teamName);
  }, [allPlayersData, myRoster, opponentRosterData, teamName]);

  const rows = useMemo(() => shapeLineup(teamPlayers), [teamPlayers]);
  
  return { rows };
}