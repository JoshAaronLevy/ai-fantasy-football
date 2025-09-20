// src/state/seasonStore.ts
import { create } from 'zustand';
import type { ApiPlayer, AnalyzeResponse, SeasonTeam } from '../types';
import { normalizePlayers } from '../season/lib/normalizePlayer';
import { fetchRosterWithMatchups } from '../lib/api/season';
import { getJSON, setJSON } from '../lib/storage/localStore';

// Module-level flag for truly synchronous duplicate prevention
let isInitializingSeasonMode = false;

type SeasonState = {
  currentMode: 'season' | 'draft';
  userRoster: ApiPlayer[];
  opponentRoster: ApiPlayer[];
  availableTeams: SeasonTeam[];
  selectedOpponentTeam: SeasonTeam | null;
  selectedWeek: number;
  analysisResults: AnalyzeResponse | null;
  loading: boolean;
  error: string | null;
  isStreaming: boolean;
  // Legacy properties that components still expect
  rostersLoading: boolean;
  teamsLoading: boolean;
  teamsError: string | null;
  // Guard to prevent duplicate initialization calls
  isInitializing: boolean;
  hasBootstrappedRoster: boolean;
  initializeSeasonMode: () => Promise<void>;
  fetchUserRoster: () => Promise<void>;
  fetchRosterComparison: () => Promise<void>;
  setSelectedWeek: (w: number) => void;
  setAnalysisResults: (r: AnalyzeResponse | null) => void;
  setIsStreaming: (streaming: boolean) => void;
};

const LS_KEYS = {
  roster: (userId?: string, week?: number) => `roster-analysis-v2-userRoster-${userId ?? 'local'}-week-${week ?? 1}`,
  week: 'seasonSelectedWeek',
};

function migratePlayersFromStorage(val: unknown): ApiPlayer[] {
  // legacy may be { roster: [...] } or raw array
  const hasRoster = val && typeof val === 'object' && 'roster' in val;
  const arr = Array.isArray(val) ? val : (hasRoster && Array.isArray((val as { roster: unknown }).roster) ? (val as { roster: unknown }).roster : []);
  return normalizePlayers(Array.isArray(arr) ? arr : []);
}

export const useSeasonStore = create<SeasonState>((set) => ({
  currentMode: 'season',
  userRoster: [],
  opponentRoster: [],
  availableTeams: [],
  selectedOpponentTeam: null,
  selectedWeek: Number(getJSON(LS_KEYS.week, 1)) || 1,
  analysisResults: null,
  loading: false,
  error: null,
  isStreaming: false,
  rostersLoading: false,
  teamsLoading: false,
  teamsError: null,
  isInitializing: false,
  hasBootstrappedRoster: false,

  setSelectedWeek: (w: number) => {
    setJSON(LS_KEYS.week, w);
    set({ selectedWeek: w });
    // Trigger fresh roster fetch for the new week
    useSeasonStore.getState().fetchUserRoster();
  },

  setAnalysisResults: (r) => {
    set((state) => {
      if (!r || !Array.isArray(r.players)) {
        console.log('[DEBUG] Reset Analysis - clearing analysisResults:', r);
        console.log('[DEBUG] Reset Analysis - current userRoster projected points:',
          state.userRoster.map(p => ({
            name: p.name,
            projectedPoints: p.matchup?.projectedPoints
          }))
        );
        
        // Reset LLM projected points from userRoster when clearing analysis
        const resetUserRoster = state.userRoster.map(rosterPlayer => {
          if (!rosterPlayer.matchup?.projectedPoints || typeof rosterPlayer.matchup.projectedPoints === 'number') {
            // If projectedPoints is just a number or doesn't exist, keep as-is
            return rosterPlayer;
          }
          
          // If projectedPoints is an object with llm property, clear the llm value
          return {
            ...rosterPlayer,
            matchup: {
              ...rosterPlayer.matchup,
              projectedPoints: {
                ...rosterPlayer.matchup.projectedPoints,
                llm: null
              }
            }
          };
        });
        
        console.log('[DEBUG] Reset Analysis - updated userRoster projected points:',
          resetUserRoster.map(p => ({
            name: p.name,
            projectedPoints: p.matchup?.projectedPoints
          }))
        );
        
        // Persist reset roster to localStorage
        const { selectedWeek } = useSeasonStore.getState();
        setJSON(LS_KEYS.roster('local', selectedWeek), resetUserRoster);
        
        return {
          analysisResults: r,
          userRoster: resetUserRoster
        };
      }

      console.log('[DEBUG] Analysis results received:', {
        playerCount: r.players.length,
        players: r.players.map(p => ({
          name: p.name,
          id: p.id,
          projectedPoints: p.matchup?.projectedPoints,
          projectedPointsRef: p.matchup?.projectedPoints === r.players[0]?.matchup?.projectedPoints ? 'SHARED_REF' : 'UNIQUE_REF'
        }))
      });

      console.log('[DEBUG] Current roster players:', state.userRoster.map(p => ({
        name: p.name,
        id: p.id,
        currentProjectedPoints: p.matchup?.projectedPoints
      })));

      // Merge analysis results back into userRoster
      const updatedUserRoster = state.userRoster.map(rosterPlayer => {
        // Find matching player in analysis results
        const analysisPlayer = r.players.find(ap =>
          ap.name === rosterPlayer.name || ap.id === rosterPlayer.id
        );
        
        console.log('[DEBUG] Matching player:', {
          rosterPlayer: { name: rosterPlayer.name, id: rosterPlayer.id },
          analysisPlayer: analysisPlayer ? {
            name: analysisPlayer.name,
            id: analysisPlayer.id,
            projectedPoints: analysisPlayer.matchup?.projectedPoints
          } : null,
          matched: !!analysisPlayer
        });
        
        if (!analysisPlayer) {
          return rosterPlayer;
        }

        // Create a deep copy of the projected points to avoid reference sharing
        const newProjectedPoints = analysisPlayer.matchup.projectedPoints
          ? JSON.parse(JSON.stringify(analysisPlayer.matchup.projectedPoints))
          : analysisPlayer.matchup.projectedPoints;

        // DEBUG: Check for object reference sharing across players
        const firstPlayerPoints = r.players[0]?.matchup?.projectedPoints;
        const isSharedRef = analysisPlayer.matchup.projectedPoints === firstPlayerPoints;
        
        console.log('[DEBUG] Updating player projected points:', {
          playerName: rosterPlayer.name,
          originalPoints: analysisPlayer.matchup.projectedPoints,
          originalPointsRef: `${analysisPlayer.matchup.projectedPoints}`,
          firstPlayerPointsRef: `${firstPlayerPoints}`,
          isSharedWithFirstPlayer: isSharedRef,
          newPoints: newProjectedPoints,
          newPointsRef: `${newProjectedPoints}`,
          isSameReference: newProjectedPoints === analysisPlayer.matchup.projectedPoints,
          isNewSameAsFirst: newProjectedPoints === firstPlayerPoints
        });

        // Update the roster player with LLM projected points and analysis
        return {
          ...rosterPlayer,
          matchup: {
            ...rosterPlayer.matchup,
            projectedPoints: newProjectedPoints
          },
          analysis: analysisPlayer.analysis
        };
      });

      console.log('[DEBUG] Final updated roster:', updatedUserRoster.map(p => ({
        name: p.name,
        projectedPoints: p.matchup?.projectedPoints
      })));

      // Persist updated roster to localStorage
      const { selectedWeek } = useSeasonStore.getState();
      setJSON(LS_KEYS.roster('local', selectedWeek), updatedUserRoster);

      return {
        analysisResults: r,
        userRoster: updatedUserRoster
      };
    });
  },

  setIsStreaming: (streaming: boolean) => {
    set({ isStreaming: streaming });
  },

  initializeSeasonMode: async () => {
    // Early out if we already bootstrapped this session
    if (useSeasonStore.getState().hasBootstrappedRoster) return;

    if (isInitializingSeasonMode) return; // keep existing module-level guard

    isInitializingSeasonMode = true;
    set({ loading: true, error: null, isInitializing: true, hasBootstrappedRoster: true });

    try {
      const { selectedWeek } = useSeasonStore.getState();
      const stored = getJSON(LS_KEYS.roster('local', selectedWeek), null);
      if (stored) {
        const migrated = migratePlayersFromStorage(stored);
        set({ userRoster: migrated });
        console.trace('[ROSTER] Page load - roster loaded from cache:', JSON.stringify({
          week: selectedWeek, playerCount: migrated.length, players: migrated.slice(0, 2)
        }, null, 2));
      } else {
        const roster = await fetchRosterWithMatchups('boykies', selectedWeek);
        setJSON(LS_KEYS.roster('local', selectedWeek), roster);
        set({ userRoster: roster });
        console.log('[ROSTER] Page load - roster fetched fresh:', JSON.stringify({
          week: selectedWeek, playerCount: roster.length, players: roster.slice(0, 2)
        }, null, 2));
      }
    } catch (e: unknown) {
      console.error('[season] init error', e);
      // allow retry on next mount if first boot failed
      set({ error: String(e), hasBootstrappedRoster: false });
    } finally {
      set({ loading: false, isInitializing: false });
      isInitializingSeasonMode = false;
    }
  },

  fetchUserRoster: async () => {
    // Prevent fetching during initialization to avoid duplicates
    const { isInitializing } = useSeasonStore.getState();
    if (isInitializing) {
      console.log('[ROSTER] Skipping fetchUserRoster - initialization in progress');
      return;
    }
    
    set({ loading: true, error: null });
    try {
      const { selectedWeek } = useSeasonStore.getState();
      const roster = await fetchRosterWithMatchups('boykies', selectedWeek);
      setJSON(LS_KEYS.roster('local', selectedWeek), roster);
      set({ userRoster: roster });
      console.log('[ROSTER] Roster updated due to week change:', JSON.stringify({
        week: selectedWeek,
        playerCount: roster.length,
        players: roster.slice(0, 2)
      }, null, 2));
    } catch (e: unknown) {
      console.error('[season] fetchUserRoster error', e);
      // fallback: keep existing or stored
    } finally {
      set({ loading: false });
    }
  },

  fetchRosterComparison: async () => {
    // If you fetch opponent roster elsewhere, normalize there similarly.
    // Leaving as-is; focus is on userRoster for analyze flow alignment.
  },
}));