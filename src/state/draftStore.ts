import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Player, ConversationMessage } from '../types'

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
  conversationMessages: ConversationMessage[];
  isApiLoading: boolean;
  isInitializingDraft: boolean;
  aiAnswer: string;
  

  // Offline mode state
  isOfflineMode: boolean;
  showOfflineBanner: boolean;
  pendingApiCalls: Array<{
    id: string;
    type: 'initializeDraft' | 'playerTaken' | 'userTurn';
    payload: Record<string, unknown>;
    timestamp: number;
  }>;

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
  addConversationMessage: (message: ConversationMessage) => void;
  setApiLoading: (loading: boolean) => void;
  setIsInitializingDraft: (loading: boolean) => void;
  markPlayerTaken: (playerId: string, player: Player, confirmation: string, newConversationId?: string) => void;
  markUserTurn: (playerId: string, player: Player, analysis: string, round: number, pick: number, newConversationId?: string) => void;
  setAiAnswer: (answer: string) => void;
  clearAiAnswer: () => void;
  clearLocalState: () => void;
  

  // Offline mode actions
  setOfflineMode: (isOffline: boolean) => void;
  setShowOfflineBanner: (show: boolean) => void;
  dismissOfflineBanner: () => void;
  addPendingApiCall: (type: 'initializeDraft' | 'playerTaken' | 'userTurn', payload: Record<string, unknown>) => void;
  clearPendingApiCalls: () => void;
  initializeDraftOffline: (config: DraftConfiguration) => void;

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
  userHasBackToBackPicks: () => boolean;
  isNextPickMine: () => boolean;
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
      conversationMessages: [],
      isApiLoading: false,
      isInitializingDraft: false,
      aiAnswer: '',
      

      // Offline mode state
      isOfflineMode: false,
      showOfflineBanner: false,
      pendingApiCalls: [],

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
        draftInitialized: false,
        conversationMessages: [],
        isApiLoading: false,
        isInitializingDraft: false,
        aiAnswer: '',
        // Reset offline mode state so fresh draft attempts use online mode first
        isOfflineMode: false,
        showOfflineBanner: false,
        pendingApiCalls: []
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
        draftInitialized: true,
        conversationMessages: [{
          id: 'initial-strategy',
          type: 'strategy',
          content: strategy,
          timestamp: Date.now()
        }]
      }),
      
      addConversationMessage: (message) => set((s) => ({
        conversationMessages: [...s.conversationMessages, message]
      })),
      
      setApiLoading: (isApiLoading) => set({ isApiLoading }),
      
      setIsInitializingDraft: (isInitializingDraft) => set({ isInitializingDraft }),
      
      setAiAnswer: (answer) => set({ aiAnswer: answer }),
      
      clearAiAnswer: () => set({ aiAnswer: '' }),
      
      clearLocalState: () => set({
        aiAnswer: '',
        drafted: {},
        myTeam: {},
        taken: {},
        actionHistory: [],
        currentRound: 1,
        conversationMessages: []
      }),
      
      markPlayerTaken: (playerId, player, confirmation, newConversationId) => set((s) => {
        // First mark the player as taken in the normal way
        if (s.drafted[playerId] || s.taken[playerId]) {
          return s; // already drafted or taken
        }
        
        const newActionHistory = [...s.actionHistory, { id: playerId, type: 'taken' as const, timestamp: Date.now() }];
        const newTotalDrafted = newActionHistory.length;
        const teams = s.draftConfig.teams || 6;
        const newRound = Math.floor((newTotalDrafted - 1) / teams) + 1;
        
        // Add conversation message
        const newMessage: ConversationMessage = {
          id: `player-taken-${playerId}-${Date.now()}`,
          type: 'player-taken',
          content: confirmation,
          timestamp: Date.now(),
          player: player
        };
        
        return {
          ...s,
          taken: { ...s.taken, [playerId]: true as const },
          actionHistory: newActionHistory,
          currentRound: newRound,
          conversationMessages: [...s.conversationMessages, newMessage],
          conversationId: newConversationId || s.conversationId,
          isApiLoading: false
        };
      }),

      markUserTurn: (playerId, player, analysis, round, pick, newConversationId) => set((s) => {
        // First mark the player as taken in the normal way
        if (s.drafted[playerId] || s.taken[playerId]) {
          return s; // already drafted or taken
        }
        
        const newActionHistory = [...s.actionHistory, { id: playerId, type: 'taken' as const, timestamp: Date.now() }];
        const newTotalDrafted = newActionHistory.length;
        const teams = s.draftConfig.teams || 6;
        const newRound = Math.floor((newTotalDrafted - 1) / teams) + 1;
        
        // Add conversation message for user turn analysis
        const newMessage: ConversationMessage = {
          id: `user-turn-${playerId}-${Date.now()}`,
          type: 'user-turn',
          content: analysis,
          timestamp: Date.now(),
          player: player,
          round: round,
          pick: pick
        };
        
        return {
          ...s,
          taken: { ...s.taken, [playerId]: true as const },
          actionHistory: newActionHistory,
          currentRound: newRound,
          conversationMessages: [...s.conversationMessages, newMessage],
          conversationId: newConversationId || s.conversationId,
          isApiLoading: false
        };
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

      // Check if user has back-to-back picks (common at snake draft wrap points)
      userHasBackToBackPicks: () => {
        const state = get();
        if (!state.draftConfig.teams || !state.draftConfig.pick) return false;
        
        const currentPick = state.actionHistory.length + 1;
        const teams = state.draftConfig.teams;
        const myPosition = state.draftConfig.pick;
        
        // Check if current pick is mine
        const currentRound = Math.floor((currentPick - 1) / teams) + 1;
        const currentPositionInRound = ((currentPick - 1) % teams) + 1;
        
        let currentExpectedPosition;
        if (currentRound % 2 === 1) {
          currentExpectedPosition = myPosition;
        } else {
          currentExpectedPosition = teams - myPosition + 1;
        }
        
        const currentIsMyTurn = currentPositionInRound === currentExpectedPosition;
        if (!currentIsMyTurn) return false;
        
        // Check if next pick is also mine
        const nextPick = currentPick + 1;
        const nextRound = Math.floor((nextPick - 1) / teams) + 1;
        const nextPositionInRound = ((nextPick - 1) % teams) + 1;
        
        let nextExpectedPosition;
        if (nextRound % 2 === 1) {
          nextExpectedPosition = myPosition;
        } else {
          nextExpectedPosition = teams - myPosition + 1;
        }
        
        return nextPositionInRound === nextExpectedPosition;
      },

      // Check if next pick after current state belongs to user
      isNextPickMine: () => {
        const state = get();
        if (!state.draftConfig.teams || !state.draftConfig.pick) return false;
        
        const nextPick = state.actionHistory.length + 1;
        const teams = state.draftConfig.teams;
        const myPosition = state.draftConfig.pick;
        
        const round = Math.floor((nextPick - 1) / teams) + 1;
        const positionInRound = ((nextPick - 1) % teams) + 1;
        
        let expectedPosition;
        if (round % 2 === 1) {
          expectedPosition = myPosition;
        } else {
          expectedPosition = teams - myPosition + 1;
        }
        
        return positionInRound === expectedPosition;
      },
      
      // Streaming actions

      // Offline mode actions
      setOfflineMode: (isOffline) => set({ isOfflineMode: isOffline }),
      
      setShowOfflineBanner: (show) => set({ showOfflineBanner: show }),
      
      dismissOfflineBanner: () => set({ showOfflineBanner: false }),
      
      addPendingApiCall: (type, payload) => set((s) => ({
        pendingApiCalls: [...s.pendingApiCalls, {
          id: `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type,
          payload,
          timestamp: Date.now()
        }]
      })),
      
      clearPendingApiCalls: () => set({ pendingApiCalls: [] }),
      
      initializeDraftOffline: (config) => set({
        draftConfig: config,
        draftInitialized: true,
        strategy: 'Offline mode: AI analysis not available. You can still track your draft and mark players as drafted or taken.',
        conversationMessages: [{
          id: 'offline-strategy',
          type: 'strategy',
          content: 'Offline mode: AI analysis is not available, but you can still manage your draft. Mark players as "Drafted" when you pick them and "Taken" when other teams pick them.',
          timestamp: Date.now()
        }]
      }),
    }),
    {
      name: 'bff-draft-store',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
)
