import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Player, ConversationMessage, QueuedAction, ActionQueueState, DraftConfiguration } from '../types'
import { generateUUID } from '../lib/uuid'

type DraftAction = {
  id: string;
  type: 'drafted' | 'taken';
  timestamp: number;
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
  selectedPlayers: Player[]; // Selected players for analysis

  // AI integration state
  conversationId: string | null;
  strategy: string | null;
  draftInitialized: boolean;
  conversationMessages: ConversationMessage[];
  isApiLoading: boolean;
  isInitializingDraft: boolean;
  isAnalysisLoading: boolean; // New shared state for both initialize and analyze operations
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

  // Enhanced Action Queue State
  actionQueue: ActionQueueState;
  syncStatus: {
    pendingCount: number;
    failedCount: number;
    conflictCount: number;
  };
  offlineActions: {
    totalQueued: number;
    lastSuccessfulSync: number;
  };

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
  setSelectedPlayers: (players: Player[]) => void;

  // AI integration actions
  setConversationId: (conversationId: string) => void;
  setStrategy: (strategy: string) => void;
  setDraftInitialized: (initialized: boolean) => void;
  initializeDraftState: (conversationId: string, strategy: string, config: DraftConfiguration) => void;
  addConversationMessage: (message: ConversationMessage) => void;
  setApiLoading: (loading: boolean) => void;
  setIsInitializingDraft: (loading: boolean) => void;
  setAnalysisLoading: (loading: boolean) => void;
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

  // Enhanced Action Queue Management
  addToQueue: (action: Omit<QueuedAction, 'id' | 'timestamp' | 'status' | 'attempt'>) => string;
  removeFromQueue: (actionId: string) => void;
  updateQueueStatus: (actionId: string, status: QueuedAction['status'], data?: Partial<QueuedAction>) => void;
  clearQueue: () => void;
  getQueueLength: () => number;
  getPendingActions: () => QueuedAction[];
  processQueue: () => Promise<void>;
  retryFailedActions: () => Promise<void>;

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
      selectedPlayers: [],

      // AI integration state
      conversationId: null,
      strategy: null,
      draftInitialized: false,
      conversationMessages: [],
      isApiLoading: false,
      isInitializingDraft: false,
      isAnalysisLoading: false,
      aiAnswer: '',
      

      // Offline mode state
      isOfflineMode: false,
      showOfflineBanner: false,
      pendingApiCalls: [],

      // Enhanced Action Queue State
      actionQueue: {
        queue: [],
        isProcessing: false,
        lastSyncAttempt: 0,
        syncErrors: []
      },
      syncStatus: {
        pendingCount: 0,
        failedCount: 0,
        conflictCount: 0
      },
      offlineActions: {
        totalQueued: 0,
        lastSuccessfulSync: 0
      },

      // Player data actions
      setPlayers: (players) => set({ players, playersError: null }),
      setPlayersLoading: (playersLoading) => set({ playersLoading }),
      setPlayersError: (playersError) => set({ playersError, playersLoading: false }),

      draftPlayer: (id) =>
        set((s) => {
          if (s.drafted[id] || s.taken[id]) {
            return s; // already drafted or taken
          }
          
          const player = s.players.find(p => p.id === id);
          if (!player) {
            console.error('Player not found:', id);
            return s;
          }

          const newActionHistory = [...s.actionHistory, { id, type: 'drafted' as const, timestamp: Date.now() }];
          const newTotalDrafted = newActionHistory.length;
          const teams = s.draftConfig.teams || 6;
          const newRound = Math.floor((newTotalDrafted - 1) / teams) + 1;
          
          // Create new state
          const newState = {
            ...s,
            drafted: { ...s.drafted, [id]: true as const },
            myTeam: { ...s.myTeam, [id]: true as const },
            actionHistory: newActionHistory,
            currentRound: newRound,
          };

          // If offline, add to action queue
          if (s.isOfflineMode) {
            const actionId = get().addToQueue({
              type: 'draft',
              payload: {
                playerId: id,
                player: player,
                round: newRound,
                pick: newTotalDrafted,
                conversationId: s.conversationId || '',
                userId: ''  // Will be filled during sync
              },
              localState: {
                playerDrafted: true,
                actionHistoryIndex: newActionHistory.length - 1
              }
            });
            console.log('Queued draft action:', actionId);
          }

          return newState;
        }),

      takePlayer: (id) =>
        set((s) => {
          if (s.drafted[id] || s.taken[id]) {
            return s; // already drafted or taken
          }
          
          const player = s.players.find(p => p.id === id);
          if (!player) {
            console.error('Player not found:', id);
            return s;
          }

          const newActionHistory = [...s.actionHistory, { id, type: 'taken' as const, timestamp: Date.now() }];
          const newTotalDrafted = newActionHistory.length;
          const teams = s.draftConfig.teams || 6;
          const newRound = Math.floor((newTotalDrafted - 1) / teams) + 1;
          
          // Create new state
          const newState = {
            ...s,
            taken: { ...s.taken, [id]: true as const },
            actionHistory: newActionHistory,
            currentRound: newRound,
          };

          // If offline, add to action queue
          if (s.isOfflineMode) {
            const actionId = get().addToQueue({
              type: 'taken',
              payload: {
                playerId: id,
                player: player,
                round: newRound,
                pick: newTotalDrafted,
                conversationId: s.conversationId || '',
                userId: ''  // Will be filled during sync
              },
              localState: {
                playerTaken: true,
                actionHistoryIndex: newActionHistory.length - 1
              }
            });
            console.log('Queued taken action:', actionId);
          }

          return newState;
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
        selectedPlayers: [],
        conversationId: null,
        strategy: null,
        draftInitialized: false,
        conversationMessages: [],
        isApiLoading: false,
        isInitializingDraft: false,
        isAnalysisLoading: false,
        aiAnswer: '',
        // Reset offline mode state so fresh draft attempts use online mode first
        isOfflineMode: false,
        showOfflineBanner: false,
        pendingApiCalls: [],
        // Reset enhanced action queue state
        actionQueue: {
          queue: [],
          isProcessing: false,
          lastSyncAttempt: 0,
          syncErrors: []
        },
        syncStatus: {
          pendingCount: 0,
          failedCount: 0,
          conflictCount: 0
        },
        offlineActions: {
          totalQueued: 0,
          lastSuccessfulSync: 0
        }
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
      
      setSelectedPlayers: (players: Player[]) => set({ selectedPlayers: players }),

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
      
      setAnalysisLoading: (isAnalysisLoading) => set({ isAnalysisLoading }),
      
      setAiAnswer: (answer) => set({ aiAnswer: answer }),
      
      clearAiAnswer: () => set({ aiAnswer: '' }),
      
      clearLocalState: () => set({
        aiAnswer: '',
        drafted: {},
        myTeam: {},
        taken: {},
        actionHistory: [],
        currentRound: 1,
        conversationMessages: [],
        // Clear enhanced action queue state
        actionQueue: {
          queue: [],
          isProcessing: false,
          lastSyncAttempt: 0,
          syncErrors: []
        },
        syncStatus: {
          pendingCount: 0,
          failedCount: 0,
          conflictCount: 0
        },
        offlineActions: {
          totalQueued: 0,
          lastSuccessfulSync: 0
        }
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

      // Enhanced Action Queue Management Functions
      addToQueue: (action) => {
        const actionId = generateUUID();
        const queuedAction: QueuedAction = {
          ...action,
          id: actionId,
          timestamp: Date.now(),
          status: 'pending',
          attempt: 0
        };

        set((s) => ({
          actionQueue: {
            ...s.actionQueue,
            queue: [...s.actionQueue.queue, queuedAction]
          },
          syncStatus: {
            ...s.syncStatus,
            pendingCount: s.syncStatus.pendingCount + 1
          },
          offlineActions: {
            ...s.offlineActions,
            totalQueued: s.offlineActions.totalQueued + 1
          }
        }));

        return actionId;
      },

      removeFromQueue: (actionId) => set((s) => {
        const updatedQueue = s.actionQueue.queue.filter(action => action.id !== actionId);
        const removedAction = s.actionQueue.queue.find(action => action.id === actionId);
        
        if (!removedAction) return s;

        let pendingDelta = 0;
        let failedDelta = 0;
        let conflictDelta = 0;

        if (removedAction.status === 'pending') pendingDelta = -1;
        else if (removedAction.status === 'failed') failedDelta = -1;
        else if (removedAction.status === 'conflict') conflictDelta = -1;

        return {
          actionQueue: {
            ...s.actionQueue,
            queue: updatedQueue
          },
          syncStatus: {
            pendingCount: s.syncStatus.pendingCount + pendingDelta,
            failedCount: s.syncStatus.failedCount + failedDelta,
            conflictCount: s.syncStatus.conflictCount + conflictDelta
          }
        };
      }),

      updateQueueStatus: (actionId, status, data) => set((s) => {
        const actionIndex = s.actionQueue.queue.findIndex(action => action.id === actionId);
        if (actionIndex === -1) return s;

        const currentAction = s.actionQueue.queue[actionIndex];
        const updatedAction = { ...currentAction, status, ...data };
        const updatedQueue = [...s.actionQueue.queue];
        updatedQueue[actionIndex] = updatedAction;

        // Update sync status counters
        let pendingDelta = 0;
        let failedDelta = 0;
        let conflictDelta = 0;

        // Remove old status count
        if (currentAction.status === 'pending') pendingDelta -= 1;
        else if (currentAction.status === 'failed') failedDelta -= 1;
        else if (currentAction.status === 'conflict') conflictDelta -= 1;

        // Add new status count
        if (status === 'pending') pendingDelta += 1;
        else if (status === 'failed') failedDelta += 1;
        else if (status === 'conflict') conflictDelta += 1;

        return {
          actionQueue: {
            ...s.actionQueue,
            queue: updatedQueue
          },
          syncStatus: {
            pendingCount: s.syncStatus.pendingCount + pendingDelta,
            failedCount: s.syncStatus.failedCount + failedDelta,
            conflictCount: s.syncStatus.conflictCount + conflictDelta
          }
        };
      }),

      clearQueue: () => set((s) => ({
        actionQueue: {
          ...s.actionQueue,
          queue: []
        },
        syncStatus: {
          pendingCount: 0,
          failedCount: 0,
          conflictCount: 0
        }
      })),

      getQueueLength: () => get().actionQueue.queue.length,

      getPendingActions: () => get().actionQueue.queue.filter(action => action.status === 'pending'),

      // Enhanced queue processing with batch processing, error handling, and conflict detection
      processQueue: async () => {
        const state = get();
        if (state.actionQueue.isProcessing || state.actionQueue.queue.length === 0) {
          return;
        }

        // Import API functions dynamically to avoid circular dependencies
        const { userDraftedBlocking, playerTakenBlocking, initializeDraftBlocking } = await import('../lib/api');
        const { classifyError } = await import('../lib/httpErrors');
        const { getUserId } = await import('../lib/storage/localStore');

        // Helper function to process individual actions
        const processAction = async (
          action: QueuedAction,
          userId: string,
          getState: () => DraftState,
          classifyErrorFn: typeof classifyError,
          userDraftedBlockingFn: typeof userDraftedBlocking,
          playerTakenBlockingFn: typeof playerTakenBlocking,
          initializeDraftBlockingFn: typeof initializeDraftBlocking
        ): Promise<{ status: QueuedAction['status'], data?: Partial<QueuedAction> }> => {
          // Mark action as syncing
          getState().updateQueueStatus(action.id, 'syncing', { attempt: action.attempt + 1 });

          try {
            let result;
            const currentState = getState();

            switch (action.type) {
              case 'draft':
                if (!action.payload.playerId || !action.payload.player) {
                  throw new Error('Missing required player data for draft action');
                }
                
                result = await userDraftedBlockingFn({
                  user: userId,
                  conversationId: currentState.conversationId || action.payload.conversationId || '',
                  payload: {
                    round: action.payload.round || currentState.currentRound,
                    pick: action.payload.pick || currentState.getCurrentPick(),
                    player: {
                      id: action.payload.player.id,
                      name: action.payload.player.name,
                      position: action.payload.player.position as 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST',
                      team: { abbr: action.payload.player.team.abbr },
                      byeWeek: action.payload.player.byeWeek || null,
                      adp: action.payload.player.newOverallRank,
                      expectedRound: action.payload.player.expectedRound
                    }
                  }
                });
                break;

              case 'taken':
                if (!action.payload.playerId || !action.payload.player) {
                  throw new Error('Missing required player data for taken action');
                }
                
                result = await playerTakenBlockingFn({
                  user: userId,
                  conversationId: currentState.conversationId || action.payload.conversationId || '',
                  payload: {
                    round: action.payload.round || currentState.currentRound,
                    pick: action.payload.pick || currentState.getCurrentPick(),
                    player: {
                      id: action.payload.player.id,
                      name: action.payload.player.name,
                      position: action.payload.player.position as 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST',
                      team: { abbr: action.payload.player.team.abbr },
                      byeWeek: action.payload.player.byeWeek || null,
                      adp: action.payload.player.newOverallRank,
                      expectedRound: action.payload.player.expectedRound
                    }
                  }
                });
                break;

              case 'initializeDraft': {
                if (!action.payload.draftConfig) {
                  throw new Error('Missing draft configuration for initialize action');
                }
                
                const players = currentState.players.map(p => ({
                  id: p.id,
                  name: p.name,
                  position: p.position as 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST',
                  team: { abbr: p.team.abbr },
                  byeWeek: p.byeWeek || null,
                  adp: p.newOverallRank,
                  expectedRound: p.expectedRound
                }));

                result = await initializeDraftBlockingFn({
                  numTeams: action.payload.draftConfig.teams || 6,
                  userPickPosition: action.payload.draftConfig.pick || 1,
                  players
                });
                break;
              }

              default:
                throw new Error(`Unknown action type: ${action.type}`);
            }

            // Check for API errors
            if (result?.error) {
              const classification = classifyErrorFn(result);
              
              if (classification.offlineWorthy) {
                // Network-related failure - should retry later
                throw new Error(`Network error: ${result.error.message || 'Unknown network error'}`);
              } else if (result.error.code === 409) {
                // Conflict detected - player already drafted, etc.
                getState().updateQueueStatus(action.id, 'conflict', {
                  conflictData: {
                    serverState: result,
                    localState: action.localState || {},
                    resolutionNeeded: true
                  }
                });
                return { status: 'conflict' };
              } else {
                // Other client/server errors
                throw new Error(`API error: ${result.error.message || 'Unknown API error'}`);
              }
            }

            // Success - update conversation ID if provided
            if (result?.conversationId) {
              currentState.setConversationId(result.conversationId);
            }

            getState().updateQueueStatus(action.id, 'synced');
            return { status: 'synced' };

          } catch (error) {
            console.error(`Failed to sync action ${action.id}:`, error);
            
            // Classify error to determine retry strategy
            const classification = classifyErrorFn(error);
            const maxRetries = 3;
            
            if (action.attempt >= maxRetries || !classification.offlineWorthy) {
              // Max retries reached or non-retryable error
              getState().updateQueueStatus(action.id, 'failed', {
                attempt: action.attempt + 1
              });
              return { status: 'failed' };
            } else {
              // Temporary failure - will retry later
              getState().updateQueueStatus(action.id, 'pending', {
                attempt: action.attempt + 1
              });
              throw error; // Re-throw for batch error handling
            }
          }
        };

        set((s) => ({
          actionQueue: {
            ...s.actionQueue,
            isProcessing: true,
            lastSyncAttempt: Date.now()
          }
        }));

        try {
          // Get pending actions in chronological order
          const pendingActions = state.actionQueue.queue.filter(action => action.status === 'pending');
          console.log('Processing queue:', pendingActions.length, 'pending actions');
          
          // Process in batches of 5 to avoid overwhelming the server
          const BATCH_SIZE = 5;
          let syncedCount = 0;
          let failedCount = 0;
          let conflictCount = 0;

          for (let i = 0; i < pendingActions.length; i += BATCH_SIZE) {
            const batch = pendingActions.slice(i, i + BATCH_SIZE);
            
            // Process batch concurrently but with controlled concurrency
            const batchPromises = batch.map(async (action) => {
              return await processAction(action, getUserId(), get, classifyError, userDraftedBlocking, playerTakenBlocking, initializeDraftBlocking);
            });

            const batchResults = await Promise.allSettled(batchPromises);
            
            // Update counters based on results
            batchResults.forEach((result, batchIndex) => {
              const action = batch[batchIndex];
              if (result.status === 'fulfilled') {
                const { status } = result.value;
                if (status === 'synced') syncedCount++;
                else if (status === 'failed') failedCount++;
                else if (status === 'conflict') conflictCount++;
              } else {
                // Promise rejected - mark as failed
                get().updateQueueStatus(action.id, 'failed', {
                  attempt: action.attempt + 1
                });
                failedCount++;
              }
            });

            // Add delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < pendingActions.length) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }

          // Update sync statistics
          set((s) => ({
            offlineActions: {
              ...s.offlineActions,
              lastSuccessfulSync: syncedCount > 0 ? Date.now() : s.offlineActions.lastSuccessfulSync
            },
            actionQueue: {
              ...s.actionQueue,
              syncErrors: syncedCount === pendingActions.length ? [] : s.actionQueue.syncErrors
            }
          }));

          console.log('Queue processing complete:', { syncedCount, failedCount, conflictCount });
          
        } catch (error) {
          console.error('Queue processing failed:', error);
          
          // Mark all pending actions as failed if we couldn't process them
          const pendingActions = get().actionQueue.queue.filter(action => action.status === 'pending');
          for (const action of pendingActions) {
            get().updateQueueStatus(action.id, 'failed', {
              attempt: action.attempt + 1
            });
          }

          // Add sync error to history
          set((s) => ({
            actionQueue: {
              ...s.actionQueue,
              syncErrors: [...s.actionQueue.syncErrors, {
                actionId: 'batch_error',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
              }]
            }
          }));
        } finally {
          set((s) => ({
            actionQueue: {
              ...s.actionQueue,
              isProcessing: false
            }
          }));
        }
      },

      retryFailedActions: async () => {
        const failedActions = get().actionQueue.queue.filter(action => action.status === 'failed');
        
        if (failedActions.length === 0) {
          return;
        }

        console.log('Retrying failed actions:', failedActions);
        
        // Mark failed actions as pending for retry
        for (const action of failedActions) {
          get().updateQueueStatus(action.id, 'pending', {
            attempt: action.attempt + 1
          });
        }

        // Process the queue
        await get().processQueue();
      },
    }),
    {
      name: 'bff-draft-store',
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        // Migration from version 1 to version 2
        if (version < 2) {
          const state = persistedState as Record<string, unknown>;
          return {
            ...state,
            // Add default values for new action queue state
            actionQueue: {
              queue: [],
              isProcessing: false,
              lastSyncAttempt: 0,
              syncErrors: []
            },
            syncStatus: {
              pendingCount: 0,
              failedCount: 0,
              conflictCount: 0
            },
            offlineActions: {
              totalQueued: 0,
              lastSuccessfulSync: 0
            }
          };
        }
        return persistedState;
      }
    }
  )
)
