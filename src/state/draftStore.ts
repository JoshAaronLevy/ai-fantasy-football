import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Player } from '../types'

type DraftAction = {
  id: string;
  type: 'drafted' | 'taken';
  timestamp: number;
}

type DraftConfiguration = {
  teams: number | null;
  pick: number | null;
}

type DraftState = {
  // Player data
  players: Player[];
  playersLoading: boolean;
  playersError: string | null;
  
  // Draft state
  drafted: Record<string, true>;
  starred: Record<string, true>;
  myTeam: Record<string, true>;
  taken: Record<string, true>;
  actionHistory: DraftAction[]; // chronological history for LIFO undo
  currentRound: number;
  draftConfig: DraftConfiguration;
  hideDraftedPlayers: boolean;

  // AI integration state
  conversationId: string | null;
  strategy: string | null;
  draftInitialized: boolean;

  // Player data actions
  setPlayers: (players: Player[]) => void;
  setPlayersLoading: (loading: boolean) => void;
  setPlayersError: (error: string | null) => void;

  // Draft actions
  draftPlayer: (id: string) => void;
  takePlayer: (id: string) => void;
  undoDraft: () => void;
  resetDraft: () => void;
  toggleStar: (id: string) => void;
  setDraftConfig: (config: DraftConfiguration) => void;
  isDraftConfigured: () => boolean;
  toggleHideDraftedPlayers: () => void;

  // AI integration actions
  setConversationId: (conversationId: string) => void;
  setStrategy: (strategy: string) => void;
  setDraftInitialized: (initialized: boolean) => void;
  initializeDraftState: (conversationId: string, strategy: string, config: DraftConfiguration) => void;

  isDrafted: (id: string) => boolean;
  isStarred: (id: string) => boolean;
  isTaken: (id: string) => boolean;
  isOnMyTeam: (id: string) => boolean;
  getTotalDraftedCount: () => number;
  getCurrentRound: () => number;
  
  // Snake draft turn management
  getCurrentPick: () => number;
  isMyTurn: () => boolean;
  getPicksUntilMyTurn: () => number;
  canDraft: () => boolean;
  canTake: () => boolean;
  calculateMyNextPick: () => number | null;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      // Player data state
      players: [],
      playersLoading: false,
      playersError: null,
      
      // Draft state
      drafted: {},
      starred: {},
      myTeam: {},
      taken: {},
      actionHistory: [],
      currentRound: 1,
      draftConfig: { teams: null, pick: null },
      hideDraftedPlayers: false,

      // AI integration state
      conversationId: null,
      strategy: null,
      draftInitialized: false,

      // Player data actions
      setPlayers: (players) => set({ players, playersError: null }),
      setPlayersLoading: (playersLoading) => set({ playersLoading }),
      setPlayersError: (playersError) => set({ playersError, playersLoading: false }),

      draftPlayer: (id) =>
        set((s) => {
          if (s.drafted[id] || s.taken[id]) {
            return s; // already drafted or taken
          }
          
          const newActionHistory = [...s.actionHistory, { id, type: 'drafted' as const, timestamp: Date.now() }];
          const newTotalDrafted = newActionHistory.length;
          const teams = s.draftConfig.teams || 6;
          const newRound = Math.floor((newTotalDrafted - 1) / teams) + 1;
          
          return {
            ...s,
            drafted: { ...s.drafted, [id]: true as const },
            myTeam: { ...s.myTeam, [id]: true as const },
            actionHistory: newActionHistory,
            currentRound: newRound,
          };
        }),

      takePlayer: (id) =>
        set((s) => {
          if (s.drafted[id] || s.taken[id]) {
            return s; // already drafted or taken
          }
          
          const newActionHistory = [...s.actionHistory, { id, type: 'taken' as const, timestamp: Date.now() }];
          const newTotalDrafted = newActionHistory.length;
          const teams = s.draftConfig.teams || 6;
          const newRound = Math.floor((newTotalDrafted - 1) / teams) + 1;
          
          return {
            ...s,
            taken: { ...s.taken, [id]: true as const },
            actionHistory: newActionHistory,
            currentRound: newRound,
          };
        }),

      undoDraft: () =>
        set((s) => {
          if (s.actionHistory.length === 0) return s;
          
          // Get the most recent action (LIFO)
          const lastAction = s.actionHistory[s.actionHistory.length - 1];
          const newActionHistory = s.actionHistory.slice(0, -1);
          const newTotalDrafted = newActionHistory.length;
          const teams = s.draftConfig.teams || 6;
          const newRound = Math.floor((newTotalDrafted - 1) / teams) + 1;
          
          if (lastAction.type === 'drafted') {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [lastAction.id]: _removedDrafted, ...restDrafted } = s.drafted;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [lastAction.id]: _removedMyTeam, ...restMyTeam } = s.myTeam;
            return {
              drafted: restDrafted,
              myTeam: restMyTeam,
              actionHistory: newActionHistory,
              currentRound: newRound,
            };
          } else {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [lastAction.id]: _removedTaken, ...restTaken } = s.taken;
            return {
              taken: restTaken,
              actionHistory: newActionHistory,
              currentRound: newRound,
            };
          }
        }),

      resetDraft: () => set({
        drafted: {},
        myTeam: {},
        taken: {},
        actionHistory: [],
        currentRound: 1,
        draftConfig: { teams: null, pick: null },
        hideDraftedPlayers: false,
        conversationId: null,
        strategy: null,
        draftInitialized: false
        // Note: We keep players, playersLoading, and playersError as they represent
        // the master player list, not draft-specific state
      }),

      toggleStar: (id) =>
        set((s) => {
          const copy = { ...s.starred };
          if (copy[id]) {
            delete copy[id];
          } else {
            copy[id] = true;
          }
          return { starred: copy };
        }),

      setDraftConfig: (config) => set({ draftConfig: config }),

      isDraftConfigured: () => {
        const { draftConfig } = get();
        return draftConfig.teams !== null && draftConfig.pick !== null;
      },

      toggleHideDraftedPlayers: () => set((s) => ({ hideDraftedPlayers: !s.hideDraftedPlayers })),

      // AI integration actions
      setConversationId: (conversationId) => set({ conversationId }),
      setStrategy: (strategy) => set({ strategy }),
      setDraftInitialized: (draftInitialized) => set({ draftInitialized }),
      initializeDraftState: (conversationId, strategy, config) => set({
        conversationId,
        strategy,
        draftConfig: config,
        draftInitialized: true
      }),

      isDrafted: (id) => !!get().drafted[id],
      isStarred: (id) => !!get().starred[id],
      isTaken: (id) => !!get().taken[id],
      isOnMyTeam: (id) => !!get().myTeam[id],
      getTotalDraftedCount: () => {
        const state = get();
        return state.actionHistory.length;
      },
      getCurrentRound: () => get().currentRound,

      // Snake draft turn management functions
      getCurrentPick: () => {
        const state = get();
        return state.actionHistory.length + 1;
      },

      isMyTurn: () => {
        const state = get();
        if (!state.draftConfig.teams || !state.draftConfig.pick) return false;
        
        const currentPick = state.actionHistory.length + 1;
        const teams = state.draftConfig.teams;
        const myPosition = state.draftConfig.pick;
        
        // Calculate which round we're in (1-based)
        const round = Math.floor((currentPick - 1) / teams) + 1;
        
        // Calculate position within the round (1-based)
        const positionInRound = ((currentPick - 1) % teams) + 1;
        
        // In odd rounds, draft order is normal (1, 2, 3, ...)
        // In even rounds, draft order is reversed (teams, teams-1, teams-2, ...)
        let expectedPosition;
        if (round % 2 === 1) {
          // Odd round: normal order
          expectedPosition = myPosition;
        } else {
          // Even round: reversed order
          expectedPosition = teams - myPosition + 1;
        }
        
        return positionInRound === expectedPosition;
      },

      getPicksUntilMyTurn: () => {
        const state = get();
        if (!state.draftConfig.teams || !state.draftConfig.pick) return 0;
        
        const currentPick = state.actionHistory.length + 1;
        const teams = state.draftConfig.teams;
        const myPosition = state.draftConfig.pick;
        
        // Find the next pick that belongs to me
        let nextMyPick = currentPick;
        while (nextMyPick <= teams * 20) { // Limit search to 20 rounds
          const round = Math.floor((nextMyPick - 1) / teams) + 1;
          const positionInRound = ((nextMyPick - 1) % teams) + 1;
          
          let expectedPosition;
          if (round % 2 === 1) {
            expectedPosition = myPosition;
          } else {
            expectedPosition = teams - myPosition + 1;
          }
          
          if (positionInRound === expectedPosition) {
            return nextMyPick - currentPick;
          }
          nextMyPick++;
        }
        
        return 0;
      },

      canDraft: () => {
        const state = get();
        return state.isDraftConfigured() && state.isMyTurn();
      },

      canTake: () => {
        const state = get();
        return state.isDraftConfigured() && !state.isMyTurn();
      },

      calculateMyNextPick: () => {
        const state = get();
        if (!state.draftConfig.teams || !state.draftConfig.pick) return null;
        
        const currentPick = state.actionHistory.length + 1;
        const teams = state.draftConfig.teams;
        const myPosition = state.draftConfig.pick;
        
        // Find the next pick that belongs to me
        let nextMyPick = currentPick;
        while (nextMyPick <= teams * 20) { // Limit search to 20 rounds
          const round = Math.floor((nextMyPick - 1) / teams) + 1;
          const positionInRound = ((nextMyPick - 1) % teams) + 1;
          
          let expectedPosition;
          if (round % 2 === 1) {
            expectedPosition = myPosition;
          } else {
            expectedPosition = teams - myPosition + 1;
          }
          
          if (positionInRound === expectedPosition) {
            return nextMyPick;
          }
          nextMyPick++;
        }
        
        return null;
      },
    }),
    {
      name: 'bff-draft-store',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
)
