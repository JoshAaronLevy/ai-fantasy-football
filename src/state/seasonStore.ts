import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SeasonState, SeasonTeam, SeasonRoster, AllPlayersApiResponse, ApiRosterPlayer, RosterPlayer } from '../types'
import { fetchAllRosters } from '../lib/api'
import { fetchAllPlayers } from '../lib/api/season'
import { extractTeams, extractTeamRoster, extractTeamsFromFlatData } from '../lib/roster/rosterProcessor'

type SeasonStore = SeasonState & {
  // Mode management actions
  setCurrentMode: (mode: 'draft' | 'season') => void;
  switchToSeasonMode: () => void;
  switchToDraftMode: () => void;
  
  // Team management actions
  setAvailableTeams: (teams: SeasonTeam[]) => void;
  setSelectedOpponentTeam: (team: SeasonTeam | null) => void;
  
  // Roster management actions
  setBoykiesRoster: (roster: SeasonRoster | null) => void;
  setOpponentRoster: (roster: SeasonRoster | null) => void;
  setRostersLoading: (loading: boolean) => void;
  setRostersError: (error: string | null) => void;
  setTeamsLoading: (loading: boolean) => void;
  setTeamsError: (error: string | null) => void;
  
  // Cache management actions
  updateRosterCache: (teamId: string, roster: SeasonRoster) => void;
  clearRosterCache: () => void;
  getRosterFromCache: (teamId: string) => SeasonRoster | null;
  isCacheValid: (teamId: string, maxAgeMs?: number) => boolean;
  
  // Data fetching actions
  initializeSeasonMode: () => Promise<void>;
  fetchAvailableTeams: () => Promise<void>;
  fetchRosterComparison: (opponentTeamId: string) => Promise<void>;
  
  // New roster data management actions
  setAllPlayersData: (data: AllPlayersApiResponse | null) => void;
  setMyRoster: (roster: ApiRosterPlayer[] | null) => void;
  setOpponentRosterData: (roster: ApiRosterPlayer[] | null) => void;
  extractMyRoster: (allPlayersData: AllPlayersApiResponse) => ApiRosterPlayer[];
  extractOpponentRoster: (allPlayersData: AllPlayersApiResponse, teamName: string) => ApiRosterPlayer[];
  loadRosterDataFromStorage: () => void;
  saveAllPlayersDataToStorage: (data: AllPlayersApiResponse) => void;
  saveOpponentRosterToStorage: (roster: ApiRosterPlayer[]) => void;
  
  // New Season API state and actions
  allPlayers: ApiRosterPlayer[];
  allPlayersLoading: boolean;
  allPlayersError: string | null;
  lastFetchedAt: number | null;
  fetchAllPlayers: (force?: boolean) => Promise<void>;
}

export const useSeasonStore = create<SeasonStore>()(
  persist(
    (set, get) => ({
      // Initial state
      currentMode: 'season',
      availableTeams: [],
      selectedOpponentTeam: null,
      boykiesRoster: null,
      opponentRoster: null,
      allPlayersData: null,
      myRoster: null,
      opponentRosterData: null,
      rostersLoading: false,
      rostersError: null,
      teamsLoading: false,
      teamsError: null,
      rosterCache: {},
      lastCacheUpdate: 0,
      
      // New Season API state
      allPlayers: [],
      allPlayersLoading: false,
      allPlayersError: null,
      lastFetchedAt: null,

      // Mode management actions
      setCurrentMode: (mode) => set({ currentMode: mode }),

      switchToSeasonMode: () => set({ currentMode: 'season' }),

      switchToDraftMode: () => set({ currentMode: 'draft' }),

      // Team management actions
      setAvailableTeams: (teams) => set({ availableTeams: teams }),

      setSelectedOpponentTeam: (team) => set({ selectedOpponentTeam: team }),

      // Roster management actions
      setBoykiesRoster: (roster) => set({ boykiesRoster: roster }),

      setOpponentRoster: (roster) => set({ opponentRoster: roster }),

      setRostersLoading: (loading) => set({ rostersLoading: loading }),

      setRostersError: (error) => set({ rostersError: error }),

      setTeamsLoading: (loading) => set({ teamsLoading: loading }),

      setTeamsError: (error) => set({ teamsError: error }),

      // Cache management actions
      updateRosterCache: (teamId, roster) => set((state) => ({
        rosterCache: { ...state.rosterCache, [teamId]: roster },
        lastCacheUpdate: Date.now()
      })),

      clearRosterCache: () => set({ rosterCache: {}, lastCacheUpdate: 0 }),

      getRosterFromCache: (teamId) => {
        const state = get();
        return state.rosterCache[teamId] || null;
      },

      isCacheValid: (teamId, maxAgeMs = 5 * 60 * 1000) => {
        const state = get();
        const roster = state.rosterCache[teamId];
        if (!roster) return false;
        const age = Date.now() - roster.lastUpdated;
        return age <= maxAgeMs;
      },

      // Data fetching actions
      initializeSeasonMode: async () => {
        const store = get();
        try {
          store.setTeamsLoading(true);
          store.setTeamsError(null);
          
          try {
            // Fetch all players using the new Season API
            await store.fetchAllPlayers(true); // Force fetch on initialization
            
            if (store.allPlayers.length > 0) {
              // Extract teams from the fetched players data
              const uniqueTeams = new Map<string, SeasonTeam>();
              
              store.allPlayers.forEach(player => {
                if (player.fantasyTeam && !uniqueTeams.has(player.fantasyTeam)) {
                  uniqueTeams.set(player.fantasyTeam, {
                    id: player.fantasyTeam.toLowerCase().replace(/\s+/g, '-'),
                    name: player.fantasyTeam,
                    abbreviation: player.fantasyTeam.substring(0, 3).toUpperCase(),
                    logoUrl: `/logos/${player.fantasyTeam.toLowerCase().replace(/\s+/g, '-')}.png`
                  });
                }
              });
              
              const teams = Array.from(uniqueTeams.values());
              store.setAvailableTeams(teams);
              
              // Set Boykies roster as default if available
              const boykiesTeam = teams.find(t => t.name.toLowerCase().includes('boykies'));
              if (boykiesTeam) {
                await store.fetchRosterComparison(boykiesTeam.id);
              }
            } else {
              // Fall back to legacy fetchAllRosters for backward compatibility
              const rawData = await fetchAllRosters();
              
              // Extract teams from the API response using the correct function for the flat data format
              const teams = extractTeamsFromFlatData(rawData);
              store.setAvailableTeams(teams);
              
              // Set Boykies roster as default if available
              const boykiesTeam = teams.find(t => t.id === 'boykies');
              if (boykiesTeam) {
                await store.fetchRosterComparison('boykies');
              }
            }
          } catch (apiError) {
            console.warn('API not available, falling back to mock data:', apiError);
            
            // Fall back to mock teams data when API is not available
            const mockTeams = [
              { id: 'boykies', name: 'Boykies', abbreviation: 'BOY', logoUrl: '/logos/boykies.png' },
              { id: 'team1', name: 'Team 1', abbreviation: 'T1', logoUrl: '/logos/team1.png' },
              { id: 'team2', name: 'Team 2', abbreviation: 'T2', logoUrl: '/logos/team2.png' },
              { id: 'team3', name: 'Team 3', abbreviation: 'T3', logoUrl: '/logos/team3.png' },
              { id: 'team4', name: 'Team 4', abbreviation: 'T4', logoUrl: '/logos/team4.png' },
              { id: 'team5', name: 'Team 5', abbreviation: 'T5', logoUrl: '/logos/team5.png' }
            ];
            
            store.setAvailableTeams(mockTeams);
            
            // Set Boykies roster as default
            const boykiesTeam = mockTeams.find(t => t.id === 'boykies');
            if (boykiesTeam) {
              await store.fetchRosterComparison('boykies');
            }
          }
        } catch (error) {
          console.error('Failed to initialize Season Mode:', error);
          store.setTeamsError(error instanceof Error ? error.message : 'Failed to initialize Season Mode');
        } finally {
          store.setTeamsLoading(false);
        }
      },

      fetchAvailableTeams: async () => {
        const store = get();
        try {
          store.setTeamsLoading(true);
          store.setTeamsError(null);
          
          try {
            // Fetch all players using the new Season API
            await store.fetchAllPlayers();
            
            if (store.allPlayers.length > 0) {
              // Extract teams from the fetched players data
              const uniqueTeams = new Map<string, SeasonTeam>();
              
              store.allPlayers.forEach(player => {
                if (player.fantasyTeam && !uniqueTeams.has(player.fantasyTeam)) {
                  uniqueTeams.set(player.fantasyTeam, {
                    id: player.fantasyTeam.toLowerCase().replace(/\s+/g, '-'),
                    name: player.fantasyTeam,
                    abbreviation: player.fantasyTeam.substring(0, 3).toUpperCase(),
                    logoUrl: `/logos/${player.fantasyTeam.toLowerCase().replace(/\s+/g, '-')}.png`
                  });
                }
              });
              
              const teams = Array.from(uniqueTeams.values());
              store.setAvailableTeams(teams);
            } else {
              // Fall back to legacy approach if no players data
              const rawData = await fetchAllRosters();
              const teams = extractTeams(rawData);
              store.setAvailableTeams(teams);
            }
          } catch (apiError) {
            console.warn('API not available, falling back to mock data:', apiError);
            
            // Fall back to mock teams data when API is not available
            const mockTeams = [
              { id: 'boykies', name: 'Boykies', abbreviation: 'BOY', logoUrl: '/logos/boykies.png' },
              { id: 'team1', name: 'Team 1', abbreviation: 'T1', logoUrl: '/logos/team1.png' },
              { id: 'team2', name: 'Team 2', abbreviation: 'T2', logoUrl: '/logos/team2.png' },
              { id: 'team3', name: 'Team 3', abbreviation: 'T3', logoUrl: '/logos/team3.png' },
              { id: 'team4', name: 'Team 4', abbreviation: 'T4', logoUrl: '/logos/team4.png' },
              { id: 'team5', name: 'Team 5', abbreviation: 'T5', logoUrl: '/logos/team5.png' }
            ];
            
            store.setAvailableTeams(mockTeams);
          }
        } catch (error) {
          console.error('Failed to fetch available teams:', error);
          store.setTeamsError(error instanceof Error ? error.message : 'Failed to fetch teams');
        } finally {
          store.setTeamsLoading(false);
        }
      },

      fetchRosterComparison: async (opponentTeamId) => {
        const store = get();
        try {
          store.setRostersLoading(true);
          store.setRostersError(null);

          // Check cache first
          const cachedRoster = store.getRosterFromCache(opponentTeamId);
          if (cachedRoster && store.isCacheValid(opponentTeamId)) {
            if (opponentTeamId === 'boykies') {
              store.setBoykiesRoster(cachedRoster);
            } else {
              store.setOpponentRoster(cachedRoster);
            }
            return;
          }

          let teamRoster: SeasonRoster | null = null;

          try {
            // Ensure we have player data
            if (store.allPlayers.length === 0) {
              await store.fetchAllPlayers();
            }
            
            if (store.allPlayers.length > 0) {
              // Build roster from allPlayers data
              const teamPlayers = store.allPlayers.filter(player => {
                const teamId = player.fantasyTeam?.toLowerCase().replace(/\s+/g, '-');
                return teamId === opponentTeamId ||
                       (opponentTeamId === 'boykies' && player.fantasyTeam?.toLowerCase().includes('boykies'));
              });
              
              // Transform to RosterPlayer format
              const rosterPlayers = teamPlayers.map((player, index) => ({
                id: player.id,
                name: player.name,
                position: player.position,
                team: player.team,
                projectedPoints: player.projectedPoints ?? null,
                isStarter: player.isStarter ?? index < 9, // First 9 are starters by default
                slotPosition: (player.slotPosition ?? 'BN1') as RosterPlayer['slotPosition']
              }));
              
              teamRoster = {
                teamId: opponentTeamId,
                teamName: store.availableTeams.find(t => t.id === opponentTeamId)?.name || opponentTeamId,
                players: rosterPlayers,
                totalProjectedPoints: rosterPlayers.reduce((sum, p) => sum + (p.projectedPoints || 0), 0),
                lastUpdated: Date.now()
              };
              
              // Find and set the selected opponent team
              if (opponentTeamId !== 'boykies') {
                const opponentTeam = store.availableTeams.find(t => t.id === opponentTeamId);
                if (opponentTeam) {
                  store.setSelectedOpponentTeam(opponentTeam);
                }
              }
            } else {
              // Fall back to legacy approach
              const rawData = await fetchAllRosters();
              teamRoster = extractTeamRoster(rawData, opponentTeamId);
              
              if (!teamRoster) {
                throw new Error(`Team roster not found for ${opponentTeamId}`);
              }
              
              if (opponentTeamId !== 'boykies') {
                const teams = extractTeams(rawData);
                const opponentTeam = teams.find(t => t.id === opponentTeamId);
                if (opponentTeam) {
                  store.setSelectedOpponentTeam(opponentTeam);
                }
              }
            }
          } catch (apiError) {
            console.warn('API not available, falling back to mock roster data:', apiError);
            
            // Fall back to mock roster data when API is not available
            teamRoster = {
              teamId: opponentTeamId,
              teamName: store.availableTeams.find(t => t.id === opponentTeamId)?.name || opponentTeamId,
              players: [
                // QB
                { id: '1', name: 'Mock QB', position: 'QB', team: { abbr: 'MIA', logoUrl: '/logos/mia.png' }, projectedPoints: 20.5, isStarter: true, slotPosition: 'QB' as const },
                // RB
                { id: '2', name: 'Mock RB1', position: 'RB', team: { abbr: 'DAL', logoUrl: '/logos/dal.png' }, projectedPoints: 18.2, isStarter: true, slotPosition: 'RB1' as const },
                { id: '3', name: 'Mock RB2', position: 'RB', team: { abbr: 'SF', logoUrl: '/logos/sf.png' }, projectedPoints: 15.8, isStarter: true, slotPosition: 'RB2' as const },
                // WR
                { id: '4', name: 'Mock WR1', position: 'WR', team: { abbr: 'KC', logoUrl: '/logos/kc.png' }, projectedPoints: 16.5, isStarter: true, slotPosition: 'WR1' as const },
                { id: '5', name: 'Mock WR2', position: 'WR', team: { abbr: 'BUF', logoUrl: '/logos/buf.png' }, projectedPoints: 14.3, isStarter: true, slotPosition: 'WR2' as const },
                // TE
                { id: '6', name: 'Mock TE', position: 'TE', team: { abbr: 'KC', logoUrl: '/logos/kc.png' }, projectedPoints: 12.7, isStarter: true, slotPosition: 'TE' as const },
                // FLEX
                { id: '7', name: 'Mock FLEX', position: 'WR', team: { abbr: 'LAR', logoUrl: '/logos/lar.png' }, projectedPoints: 11.9, isStarter: true, slotPosition: 'FLEX' as const },
                // K
                { id: '8', name: 'Mock K', position: 'K', team: { abbr: 'BAL', logoUrl: '/logos/bal.png' }, projectedPoints: 8.5, isStarter: true, slotPosition: 'K' as const },
                // DST
                { id: '9', name: 'Mock DST', position: 'DST', team: { abbr: 'SF', logoUrl: '/logos/sf.png' }, projectedPoints: 9.2, isStarter: true, slotPosition: 'DST' as const },
                // Bench
                { id: '10', name: 'Bench Player 1', position: 'RB', team: { abbr: 'NYG', logoUrl: '/logos/nyg.png' }, projectedPoints: 8.1, isStarter: false, slotPosition: 'BN1' as const },
                { id: '11', name: 'Bench Player 2', position: 'WR', team: { abbr: 'PHI', logoUrl: '/logos/phi.png' }, projectedPoints: 7.3, isStarter: false, slotPosition: 'BN2' as const },
                { id: '12', name: 'Bench Player 3', position: 'QB', team: { abbr: 'GB', logoUrl: '/logos/gb.png' }, projectedPoints: 15.2, isStarter: false, slotPosition: 'BN3' as const },
                { id: '13', name: 'Bench Player 4', position: 'TE', team: { abbr: 'DEN', logoUrl: '/logos/den.png' }, projectedPoints: 6.8, isStarter: false, slotPosition: 'BN4' as const },
                { id: '14', name: 'Bench Player 5', position: 'WR', team: { abbr: 'SEA', logoUrl: '/logos/sea.png' }, projectedPoints: 5.9, isStarter: false, slotPosition: 'BN5' as const },
                { id: '15', name: 'Bench Player 6', position: 'RB', team: { abbr: 'CHI', logoUrl: '/logos/chi.png' }, projectedPoints: 4.7, isStarter: false, slotPosition: 'BN6' as const },
                { id: '16', name: 'Bench Player 7', position: 'DST', team: { abbr: 'PIT', logoUrl: '/logos/pit.png' }, projectedPoints: 6.1, isStarter: false, slotPosition: 'BN7' as const }
              ],
              totalProjectedPoints: 195.8,
              lastUpdated: Date.now()
            };

            // Find and set the selected opponent team from available teams
            if (opponentTeamId !== 'boykies') {
              const opponentTeam = store.availableTeams.find(t => t.id === opponentTeamId);
              if (opponentTeam) {
                store.setSelectedOpponentTeam(opponentTeam);
              }
            }
          }

          if (teamRoster) {
            // Cache the roster
            store.updateRosterCache(opponentTeamId, teamRoster);

            // Set the appropriate roster
            if (opponentTeamId === 'boykies') {
              store.setBoykiesRoster(teamRoster);
            } else {
              store.setOpponentRoster(teamRoster);
            }
          }
          
        } catch (error) {
          console.error('Failed to fetch roster comparison:', error);
          store.setRostersError(error instanceof Error ? error.message : 'Failed to fetch roster data');
        } finally {
          store.setRostersLoading(false);
        }
      },

      // New roster data management actions
      setAllPlayersData: (data) => set({ allPlayersData: data }),

      setMyRoster: (roster) => set({ myRoster: roster }),

      setOpponentRosterData: (roster) => set({ opponentRosterData: roster }),

      extractMyRoster: (allPlayersData) => {
        // Handle different possible API response structures
        let playersArray = null;
        
        // Check for players array (expected structure)
        if (allPlayersData?.players && Array.isArray(allPlayersData.players)) {
          playersArray = allPlayersData.players;
        }
        // Check if the whole object is an array
        else if (Array.isArray(allPlayersData)) {
          playersArray = allPlayersData;
        }
        // Check for data array (includes ok/data structure)
        else if (allPlayersData?.data && Array.isArray(allPlayersData.data)) {
          playersArray = allPlayersData.data;
        }
        
        if (!playersArray) {
          console.log('❌ extractMyRoster - No players array found in any expected location');
          console.log('🔍 Available keys to explore:', allPlayersData ? Object.keys(allPlayersData) : 'none');
          return [];
        }
        
        // Check for all possible field names that might contain fantasy team info
        const possibleTeamFields = ['fantasyTeam', 'fantasy_team', 'teamName', 'team_name', 'FantasyTeam'];
        
        const teamFieldInfo = possibleTeamFields.map(fieldName => {
          const hasField = playersArray.some(p => p && typeof p === 'object' && fieldName in p);
          const uniqueValues = hasField ? [...new Set(playersArray.map(p => p[fieldName]).filter(v => v))] : [];
          return { fieldName, hasField, uniqueValues: uniqueValues.slice(0, 10) }; // Limit to first 10 values
        });
        
        // Find the correct field that has fantasy team data
        let teamField = 'fantasyTeam'; // default
        const fieldWithData = teamFieldInfo.find(field => field.hasField && field.uniqueValues.length > 0);
        if (fieldWithData) {
          teamField = fieldWithData.fieldName;
        }
        
        // Try different variations of "Boykies" to check case sensitivity
        const boykiesVariations = ['Boykies', 'boykies', 'BOYKIES', 'Boykies ', ' Boykies', 'boykies ', ' boykies'];
        const matchCounts = boykiesVariations.map(variation => ({
          variation,
          count: playersArray.filter(player => player && player[teamField] === variation).length
        }));
        
        // Find the best matching variation
        const bestMatch = matchCounts.find(match => match.count > 0);
        const teamNameToMatch = bestMatch ? bestMatch.variation : 'Boykies';
        
        // Filter for Boykies players
        const myRoster = playersArray.filter(player =>
          player &&
          typeof player === 'object' &&
          player[teamField] === teamNameToMatch
        );
        
        if (myRoster.length === 0) {
          console.log('⚠️ extractMyRoster - No players found! Debugging info:');
          console.log(' - Team field used:', teamField);
          console.log(' - Team name searched:', teamNameToMatch);
          console.log(' - Total players searched:', playersArray.length);
          console.log(' - Sample player team values:', playersArray.slice(0, 5).map(p => p[teamField]));
        }
        
        return myRoster;
      },

      extractOpponentRoster: (allPlayersData, teamName) => {
        if (!allPlayersData?.players) return [];
        return allPlayersData.players.filter(player => player.fantasyTeam === teamName);
      },

      loadRosterDataFromStorage: () => {
        const store = get();
        try {
          // Load allPlayersData
          const allPlayersDataStr = localStorage.getItem('allPlayersData');

          if (allPlayersDataStr) {
            const allPlayersData = JSON.parse(allPlayersDataStr);
            store.setAllPlayersData(allPlayersData);

            // Extract and set myRoster
            const myRoster = store.extractMyRoster(allPlayersData);
            store.setMyRoster(myRoster);
          } else {
            console.log('💾 No allPlayersData found in localStorage');
          }

          // Load opponentRoster
          const opponentRosterStr = localStorage.getItem('opponentRoster');
          if (opponentRosterStr) {
            const opponentRoster = JSON.parse(opponentRosterStr);
            store.setOpponentRosterData(opponentRoster);
            console.log('🏠 Site load - opponentRoster:', opponentRoster);
          }
        } catch (error) {
          console.error('💾 Failed to load roster data from storage:', error);
        }
      },

      saveAllPlayersDataToStorage: (data) => {
        try {
          localStorage.setItem('allPlayersData', JSON.stringify(data));
        } catch (error) {
          console.error('Failed to save all players data to storage:', error);
        }
      },

      saveOpponentRosterToStorage: (roster) => {
        try {
          localStorage.setItem('opponentRoster', JSON.stringify(roster));
        } catch (error) {
          console.error('Failed to save opponent roster to storage:', error);
        }
      },

      // New Season API action
      fetchAllPlayers: async (force = false) => {
        const store = get();
        
        // Check if we should skip fetching (not forced and recently fetched)
        if (!force && store.lastFetchedAt) {
          const timeSinceLastFetch = Date.now() - store.lastFetchedAt;
          const TWO_MINUTES = 2 * 60 * 1000;
          if (timeSinceLastFetch < TWO_MINUTES) {
            console.log('Skipping fetchAllPlayers - data is fresh');
            return;
          }
        }
        
        set({ allPlayersLoading: true, allPlayersError: null });
        
        try {
          const players = await fetchAllPlayers();
          set({
            allPlayers: players,
            allPlayersError: null,
            lastFetchedAt: Date.now()
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch players';
          console.error('Failed to fetch all players:', error);
          set({ allPlayersError: errorMessage });
          // Leave prior data intact on error
        } finally {
          set({ allPlayersLoading: false });
        }
      },
    }),
    {
      name: 'season-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
)