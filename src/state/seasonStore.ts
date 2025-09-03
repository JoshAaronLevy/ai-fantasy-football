import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SeasonState, SeasonTeam, SeasonRoster, RosterApiPlayer, RosterPlayer } from '../types'
import { fetchRosterWithMatchups, fetchSchedule, ensureProjectedPoints } from '../lib/api/season'
import { getTeamByAbbr } from '../lib/teams/nflTeams'
import { getJSON, setJSON } from '../lib/storage/localStore'

type SeasonStore = SeasonState & {
  // Mode management actions
  setCurrentMode: (mode: 'draft' | 'season') => void;
  switchToSeasonMode: () => void;
  switchToDraftMode: () => void;
  
  // Team management actions
  setAvailableTeams: (teams: SeasonTeam[]) => void;
  setSelectedOpponentTeam: (team: SeasonTeam | null) => void;
  
  // Week management actions
  selectedWeek: number;
  setSelectedWeek: (week: number) => void;
  
  // Roster management actions
  userRoster: RosterApiPlayer[] | null;
  setUserRoster: (roster: RosterApiPlayer[] | null) => void;
  setBoykiesRoster: (roster: SeasonRoster | null) => void;
  setOpponentRoster: (roster: SeasonRoster | null) => void;
  setRostersLoading: (loading: boolean) => void;
  setRostersError: (error: string | null) => void;
  setTeamsLoading: (loading: boolean) => void;
  setTeamsError: (error: string | null) => void;
  
  // Cache management actions
  rosterCache: Record<string, RosterApiPlayer[]>;
  updateRosterCache: (teamId: string, roster: RosterApiPlayer[]) => void;
  clearRosterCache: () => void;
  getRosterFromCache: (teamId: string) => RosterApiPlayer[] | null;
  
  // Data fetching actions
  initializeSeasonMode: () => Promise<void>;
  fetchAvailableTeams: () => Promise<void>;
  fetchRosterComparison: (opponentTeamId: string) => Promise<void>;
  fetchUserRoster: () => Promise<void>;
  
  // Storage actions
  loadRosterDataFromStorage: () => void;
  saveUserRosterToStorage: (roster: RosterApiPlayer[]) => void;
  validateRosterFormat: (roster: unknown) => roster is RosterApiPlayer[];
  cleanupLegacyRosterData: () => void;
  
  // Schedule state and actions
  scheduleData: unknown | null;
  scheduleLoading: boolean;
  scheduleError: string | null;
  scheduleCache: Record<number, { data: unknown; timestamp: number }>;
  setScheduleLoading: (loading: boolean) => void;
  setScheduleError: (error: string | null) => void;
  fetchScheduleData: (weekNumber: number) => Promise<void>;
  loadInitialSchedule: () => Promise<void>;
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
      userRoster: null,
      rostersLoading: false,
      rostersError: null,
      teamsLoading: false,
      teamsError: null,
      rosterCache: {},
      lastCacheUpdate: 0,
      selectedWeek: (() => {
        // Initialize from localStorage using utility
        const savedWeek = getJSON<number>('seasonSelectedWeek', 1);
        return savedWeek;
      })(),
      
      // Schedule state
      scheduleData: null,
      scheduleLoading: false,
      scheduleError: null,
      scheduleCache: {},

      // Mode management actions
      setCurrentMode: (mode) => set({ currentMode: mode }),

      switchToSeasonMode: () => set({ currentMode: 'season' }),

      switchToDraftMode: () => set({ currentMode: 'draft' }),

      // Team management actions
      setAvailableTeams: (teams) => set({ availableTeams: teams }),

      setSelectedOpponentTeam: (team) => set({ selectedOpponentTeam: team }),

      // Week management actions
      setSelectedWeek: async (week) => {
        const store = get();
        setJSON('seasonSelectedWeek', week);
        set({ selectedWeek: week });
        
        // Fetch schedule data for the new week
        await store.fetchScheduleData(week);
        
        // Re-fetch current rosters to update with new schedule data
        if (store.boykiesRoster) {
          await store.fetchRosterComparison('boykies');
        }
        if (store.selectedOpponentTeam) {
          await store.fetchRosterComparison(store.selectedOpponentTeam.id);
        }
      },

      // Roster management actions
      setUserRoster: (roster) => set({ userRoster: roster }),

      setBoykiesRoster: (roster) => set({ boykiesRoster: roster }),

      setOpponentRoster: (roster) => set({ opponentRoster: roster }),

      setRostersLoading: (loading) => set({ rostersLoading: loading }),

      setRostersError: (error) => set({ rostersError: error }),

      setTeamsLoading: (loading) => set({ teamsLoading: loading }),

      setTeamsError: (error) => set({ teamsError: error }),

      // Cache management actions
      updateRosterCache: (teamId, roster) => set((state) => ({
        rosterCache: { ...state.rosterCache, [teamId]: roster }
      })),

      clearRosterCache: () => set({ rosterCache: {} }),

      getRosterFromCache: (teamId) => {
        const state = get();
        return state.rosterCache[teamId] || null;
      },

      // Data fetching actions
      initializeSeasonMode: async () => {
        const store = get();
        try {
          store.setTeamsLoading(true);
          store.setTeamsError(null);
          
          try {
            // Fetch user roster first
            await store.fetchUserRoster();
            
            // Set up mock teams for now
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
            await store.fetchRosterComparison('boykies');
            
            // Load initial schedule data
            await store.loadInitialSchedule();
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
            await store.fetchRosterComparison('boykies');
            
            // Load initial schedule data
            await store.loadInitialSchedule();
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
            // Set up mock teams for now
            const mockTeams = [
              { id: 'boykies', name: 'Boykies', abbreviation: 'BOY', logoUrl: '/logos/boykies.png' },
              { id: 'team1', name: 'Team 1', abbreviation: 'T1', logoUrl: '/logos/team1.png' },
              { id: 'team2', name: 'Team 2', abbreviation: 'T2', logoUrl: '/logos/team2.png' },
              { id: 'team3', name: 'Team 3', abbreviation: 'T3', logoUrl: '/logos/team3.png' },
              { id: 'team4', name: 'Team 4', abbreviation: 'T4', logoUrl: '/logos/team4.png' },
              { id: 'team5', name: 'Team 5', abbreviation: 'T5', logoUrl: '/logos/team5.png' }
            ];
            
            store.setAvailableTeams(mockTeams);
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

          // Try to load schedule data but don't let it block roster display
          if (!store.scheduleData) {
            try {
              await store.fetchScheduleData(store.selectedWeek);
            } catch (scheduleError) {
              console.warn(`🏈 [ROSTER FETCH] ⚠️ Failed to load schedule data, continuing without enrichment:`, scheduleError);
              // Continue without schedule enrichment - rosters will still display
            }
          }

          let teamRoster: SeasonRoster | null = null;

          try {
            // For boykies, use the new API
            if (opponentTeamId === 'boykies') {
              if (!store.userRoster) {
                await store.fetchUserRoster();
              }
              
              if (store.userRoster) {
                // Transform RosterApiPlayer[] to SeasonRoster format
                const rosterPlayers = store.userRoster.map((player, index) => ({
                  id: player.id || `player-${index}`,
                  name: player.name,
                  position: player.position || player.pos || 'N/A',
                  team: typeof player.team === 'string'
                    ? { abbr: player.team, logoUrl: `/logos/${player.team.toLowerCase()}.png` }
                    : {
                        abbr: player.team.abbr,
                        logoUrl: player.team.logoUrl || `/logos/${player.team.abbr.toLowerCase()}.png`
                      },
                  projectedPoints: player.projectedPoints ?? null,
                  isStarter: player.starter ?? index < 9,
                  slotPosition: 'BN1' as RosterPlayer['slotPosition'], // Will be handled by components
                  matchup: undefined, // RosterMatchup type is different from Matchup, will be handled later
                  opponent: player.matchup?.opponent?.abbr
                }));
                
                teamRoster = {
                  teamId: 'boykies',
                  teamName: 'Boykies',
                  players: rosterPlayers,
                  totalProjectedPoints: rosterPlayers.reduce((sum, p) => sum + (p.projectedPoints || 0), 0),
                  lastUpdated: Date.now()
                };
              }
            } else {
              // For other teams, throw error to fall back to mock data
              throw new Error(`No API endpoint available for team: ${opponentTeamId}`);
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

      // New action to fetch user roster using the new API
      fetchUserRoster: async () => {
        const store = get();
        const selectedWeek = store.selectedWeek;
        
        try {
          // Call the new API endpoint
          const roster = await fetchRosterWithMatchups('boykies', 1);
          
          // Ensure projected points exist
          const processedRoster = ensureProjectedPoints(roster);
          
          // Store in state and localStorage
          store.setUserRoster(processedRoster);
          store.saveUserRosterToStorage(processedRoster);
          
          // Trigger analysis
          const analysisPayload = {
            response_mode: 'blocking',
            user: 'user_123',
            query: 'Analyze rosters for weekly projections.',
            inputs: {
              userRoster: processedRoster,
              opponentRoster: [],
              week: selectedWeek
            }
          };
          console.log('Analysis payload:', analysisPayload);

          // const analysisResponse = await analyzeRoster('user_123', processedRoster, selectedWeek);
          // console.log('Analysis response:', analysisResponse.kind === 'json' ? analysisResponse.data : analysisResponse.data);
        } catch (error) {
          console.warn('API not available, falling back to mock user roster data:', error);
          
          // Fall back to mock roster data
          const mockRoster = [
            // QB
            { id: '1', name: 'Mock Boykies QB', position: 'QB', team: { abbr: 'MIA', logoUrl: '/logos/mia.png' }, projectedPoints: 20.5, starter: true, matchup: { week: 1, opponent: { abbr: 'BUF', logoUrl: getTeamByAbbr('BUF')?.logoUrl || '/logos/buf.png' } } },
            // RB
            { id: '2', name: 'Mock Boykies RB1', position: 'RB', team: { abbr: 'DAL', logoUrl: '/logos/dal.png' }, projectedPoints: 18.2, starter: true, matchup: { week: 1, opponent: { abbr: 'NYG', logoUrl: getTeamByAbbr('NYG')?.logoUrl || '/logos/nyg.png' } } },
            { id: '3', name: 'Mock Boykies RB2', position: 'RB', team: { abbr: 'SF', logoUrl: '/logos/sf.png' }, projectedPoints: 15.8, starter: true, matchup: { week: 1, opponent: { abbr: 'LAR', logoUrl: getTeamByAbbr('LAR')?.logoUrl || '/logos/lar.png' } } },
            // WR
            { id: '4', name: 'Mock Boykies WR1', position: 'WR', team: { abbr: 'KC', logoUrl: '/logos/kc.png' }, projectedPoints: 16.5, starter: true, matchup: { week: 1, opponent: { abbr: 'LV', logoUrl: getTeamByAbbr('LV')?.logoUrl || '/logos/lv.png' } } },
            { id: '5', name: 'Mock Boykies WR2', position: 'WR', team: { abbr: 'BUF', logoUrl: '/logos/buf.png' }, projectedPoints: 14.3, starter: true, matchup: { week: 1, opponent: { abbr: 'MIA', logoUrl: getTeamByAbbr('MIA')?.logoUrl || '/logos/mia.png' } } },
            // TE
            { id: '6', name: 'Mock Boykies TE', position: 'TE', team: { abbr: 'KC', logoUrl: '/logos/kc.png' }, projectedPoints: 12.7, starter: true, matchup: { week: 1, opponent: { abbr: 'LV', logoUrl: getTeamByAbbr('LV')?.logoUrl || '/logos/lv.png' } } },
            // FLEX
            { id: '7', name: 'Mock Boykies FLEX', position: 'WR', team: { abbr: 'LAR', logoUrl: '/logos/lar.png' }, projectedPoints: 11.9, starter: true, matchup: { week: 1, opponent: { abbr: 'SF', logoUrl: getTeamByAbbr('SF')?.logoUrl || '/logos/sf.png' } } },
            // K
            { id: '8', name: 'Mock Boykies K', position: 'K', team: { abbr: 'BAL', logoUrl: '/logos/bal.png' }, projectedPoints: 8.5, starter: true, matchup: { week: 1, opponent: { abbr: 'PIT', logoUrl: getTeamByAbbr('PIT')?.logoUrl || '/logos/pit.png' } } },
            // DST
            { id: '9', name: 'Mock Boykies DST', position: 'DST', team: { abbr: 'SF', logoUrl: '/logos/sf.png' }, projectedPoints: 9.2, starter: true, matchup: { week: 1, opponent: { abbr: 'LAR', logoUrl: getTeamByAbbr('LAR')?.logoUrl || '/logos/lar.png' } } },
            // Bench
            { id: '10', name: 'Bench Player 1', position: 'RB', team: { abbr: 'NYG', logoUrl: '/logos/nyg.png' }, projectedPoints: 8.1, starter: false, matchup: { week: 1, opponent: { abbr: 'DAL', logoUrl: getTeamByAbbr('DAL')?.logoUrl || '/logos/dal.png' } } },
            { id: '11', name: 'Bench Player 2', position: 'WR', team: { abbr: 'PHI', logoUrl: '/logos/phi.png' }, projectedPoints: 7.3, starter: false, matchup: { week: 1, opponent: { abbr: 'WAS', logoUrl: getTeamByAbbr('WAS')?.logoUrl || '/logos/was.png' } } },
            { id: '12', name: 'Bench Player 3', position: 'QB', team: { abbr: 'GB', logoUrl: '/logos/gb.png' }, projectedPoints: 15.2, starter: false, matchup: { week: 1, opponent: { abbr: 'CHI', logoUrl: getTeamByAbbr('CHI')?.logoUrl || '/logos/chi.png' } } },
            { id: '13', name: 'Bench Player 4', position: 'TE', team: { abbr: 'DEN', logoUrl: '/logos/den.png' }, projectedPoints: 6.8, starter: false, matchup: { week: 1, opponent: { abbr: 'KC', logoUrl: getTeamByAbbr('KC')?.logoUrl || '/logos/kc.png' } } },
            { id: '14', name: 'Bench Player 5', position: 'WR', team: { abbr: 'SEA', logoUrl: '/logos/sea.png' }, projectedPoints: 5.9, starter: false, matchup: { week: 1, opponent: { abbr: 'ARI', logoUrl: getTeamByAbbr('ARI')?.logoUrl || '/logos/ari.png' } } },
            { id: '15', name: 'Bench Player 6', position: 'RB', team: { abbr: 'CHI', logoUrl: '/logos/chi.png' }, projectedPoints: 4.7, starter: false, matchup: { week: 1, opponent: { abbr: 'GB', logoUrl: getTeamByAbbr('GB')?.logoUrl || '/logos/gb.png' } } }
          ];
          
          // Ensure projected points exist for mock roster too
          const processedMockRoster = ensureProjectedPoints(mockRoster);
          
          // Store in state and localStorage
          store.setUserRoster(processedMockRoster);
          console.log('userRoster[0].matchup.opponent.logoUrl:', processedMockRoster[0].matchup.opponent.logoUrl);
          store.saveUserRosterToStorage(processedMockRoster);
          
          // Trigger analysis for mock roster too
          const analysisPayload = {
            response_mode: 'blocking',
            user: 'user_123',
            query: 'Analyze rosters for weekly projections.',
            inputs: {
              userRoster: processedMockRoster,
              opponentRoster: [],
              week: selectedWeek
            }
          };
          console.log('Analysis payload:', analysisPayload);

          try {
            // const analysisResponse = await analyzeRoster('user_123', processedMockRoster, selectedWeek);
            // console.log('Analysis response:', analysisResponse.kind === 'json' ? analysisResponse.data : analysisResponse.data);
          } catch (analysisError) {
            console.warn('Analysis failed:', analysisError);
          }
        }
      },

      // Storage actions
      loadRosterDataFromStorage: () => {
        const store = get();
        try {
          // First try to load from the new format using localStorage utilities
          const userRoster = getJSON<RosterApiPlayer[] | null>('userRoster', null);
          
          if (userRoster && store.validateRosterFormat(userRoster)) {
            store.setUserRoster(userRoster);
            console.log('💾 Loaded userRoster from localStorage (validated):', userRoster.length, 'players');
            return;
          }
          
          // Check for legacy format (direct localStorage key without namespace)
          const legacyRosterStr = localStorage.getItem('userRoster');
          if (legacyRosterStr) {
            try {
              const legacyRoster = JSON.parse(legacyRosterStr);
              console.log('💾 Found legacy userRoster format, attempting migration...');
              
              if (store.validateRosterFormat(legacyRoster)) {
                // Migrate to new format
                store.setUserRoster(legacyRoster);
                store.saveUserRosterToStorage(legacyRoster);
                
                // Clean up legacy key
                localStorage.removeItem('userRoster');
                console.log('💾 Successfully migrated userRoster to new format');
                return;
              } else {
                console.warn('💾 Legacy userRoster format is invalid, clearing...');
                localStorage.removeItem('userRoster');
              }
            } catch (parseError) {
              console.warn('💾 Failed to parse legacy userRoster, clearing...', parseError);
              localStorage.removeItem('userRoster');
            }
          }
          
          // Check for other legacy keys and clean them up
          store.cleanupLegacyRosterData();
          
          console.log('💾 No valid userRoster found in localStorage');
        } catch (error) {
          console.error('💾 Failed to load roster data from storage:', error);
        }
      },

      saveUserRosterToStorage: (roster) => {
        const store = get();
        try {
          if (!store.validateRosterFormat(roster)) {
            console.error('💾 Invalid roster format, cannot save to localStorage');
            return;
          }
          
          // Use the namespaced localStorage utility
          setJSON('userRoster', roster);
        } catch (error) {
          console.error('💾 Failed to save user roster to storage:', error);
        }
      },

      // New validation method
      validateRosterFormat: (roster: unknown): roster is RosterApiPlayer[] => {
        if (!Array.isArray(roster)) {
          console.warn('💾 Roster validation failed: not an array');
          return false;
        }
        
        if (roster.length === 0) {
          console.warn('💾 Roster validation failed: empty array');
          return false;
        }
        
        // Check that each item has required properties of RosterApiPlayer
        for (const player of roster) {
          if (typeof player !== 'object' || player === null) {
            console.warn('💾 Roster validation failed: player is not an object');
            return false;
          }
          
          const p = player as Record<string, unknown>;
          if (typeof p.name !== 'string') {
            console.warn('💾 Roster validation failed: player missing name');
            return false;
          }
          
          if (typeof p.team !== 'object' && typeof p.team !== 'string') {
            console.warn('💾 Roster validation failed: player missing team');
            return false;
          }
        }
        
        return true;
      },

      // Clean up legacy localStorage data
      cleanupLegacyRosterData: () => {
        const legacyKeys = [
          'seasonRoster',
          'boykiesRoster',
          'opponentRosterData',
          'allPlayersData'
        ];
        
        legacyKeys.forEach(key => {
          if (localStorage.getItem(key)) {
            console.log(`💾 Cleaning up legacy localStorage key: ${key}`);
            localStorage.removeItem(key);
          }
        });
      },
      
      // Schedule management actions
      setScheduleLoading: (loading) => set({ scheduleLoading: loading }),
      
      setScheduleError: (error) => set({ scheduleError: error }),
      
      // Schedule actions
      fetchScheduleData: async (weekNumber) => {
        const store = get();
        
        console.log(`📅 [SCHEDULE FETCH] Starting fetch for week ${weekNumber}`);
        
        // Set loading state and clear errors
        store.setScheduleLoading(true);
        store.setScheduleError(null);
        
        try {
          // Check cache first
          const cached = store.scheduleCache[weekNumber];
          if (cached) {
            const cacheAge = Date.now() - cached.timestamp;
            const FIVE_MINUTES = 5 * 60 * 1000;
            if (cacheAge < FIVE_MINUTES) {
              console.log(`📅 [SCHEDULE FETCH] ✅ Using cached schedule data for week ${weekNumber}`, cached.data);
              set({ scheduleData: cached.data, scheduleLoading: false });
              return;
            }
          }
          
          // Fetch from API
          console.log(`📅 [SCHEDULE FETCH] 🌐 Fetching fresh schedule data for week ${weekNumber}`);
          const scheduleData = await fetchSchedule(weekNumber);
          console.log(`📅 [SCHEDULE FETCH] ✅ Received schedule data for week ${weekNumber}:`, scheduleData);
          
          // Update cache
          const cacheEntry = { data: scheduleData, timestamp: Date.now() };
          
          // Update state
          set({
            scheduleData,
            scheduleCache: {
              ...store.scheduleCache,
              [weekNumber]: cacheEntry
            },
            scheduleError: null
          });
          
          // Save to localStorage
          setJSON(`schedule.week.${weekNumber}`, scheduleData);
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch schedule';
          console.error(`📅 [SCHEDULE FETCH] ❌ Failed to fetch schedule for week ${weekNumber}:`, error);
          
          // Try to load from localStorage as fallback
          const stored = getJSON<unknown>(`schedule.week.${weekNumber}`, null);
          if (stored) {
            console.log(`📅 [SCHEDULE FETCH] 💾 Using stored schedule data for week ${weekNumber}`, stored);
            set({ scheduleData: stored });
            store.setScheduleError(null);
          } else {
            console.log(`📅 [SCHEDULE FETCH] ❌ No fallback data available for week ${weekNumber}`);
            store.setScheduleError(errorMessage);
          }
        } finally {
          store.setScheduleLoading(false);
        }
      },
      
      loadInitialSchedule: async () => {
        const store = get();
        await store.fetchScheduleData(store.selectedWeek);
      },
    }),
    {
      name: 'season-store',
      storage: createJSONStorage(() => localStorage),
    }
  )
)