import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Player, ConversationMessage, QueuedAction, ActionQueueState, DraftConfiguration, SeasonState, SeasonTeam, SeasonRoster, AllPlayersApiResponse, ApiRosterPlayer } from '../types'
import { generateUUID } from '../lib/uuid'
import { getJSON, setJSON } from '../lib/storage/localStore'

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
  hasInitializedDraft: boolean; // Track if draft has been initialized
  hasHydrated: boolean; // Track if store has been hydrated from persistence

  // AI integration state
  conversationId: string | null;
  strategy: string | null;
  draftInitialized: boolean;
  conversationMessages: ConversationMessage[];
  isApiLoading: boolean;
  isInitializingDraft: boolean;
  isAnalysisLoading: boolean; // New shared state for both initialize and analyze operations
  aiAnswer: string;
  
  // AI Assistant streaming state
  assistantStreaming: {
    isOpen: boolean;
    isStreaming: boolean;
    content: string;
    error?: string;
  };

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

  /** @deprecated Season state has moved to src/state/seasonStore.ts. This copy remains temporarily for backward compatibility until imports are updated. */
  // Season Mode state
  season: SeasonState;

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
  markInitialized: () => void;
  resetInitialized: () => void;
  setHasHydrated: (hydrated: boolean) => void;

  // AI integration actions
  setConversationId: (conversationId: string) => void;
  setStrategy: (strategy: string) => void;
  setDraftInitialized: (initialized: boolean) => void;
  initializeDraftState: (conversationId: string, strategy: string, config: DraftConfiguration) => void;
  addConversationMessage: (message: ConversationMessage) => void;
  updateConversationMessage: (id: string, updates: Partial<ConversationMessage>) => void;
  persistStreamingContent: (content: string) => void;
  getLastInitializeMessage: () => ConversationMessage | null;
  setApiLoading: (loading: boolean) => void;
  setIsInitializingDraft: (loading: boolean) => void;
  setAnalysisLoading: (loading: boolean) => void;
  markPlayerTaken: (playerId: string, player: Player, confirmation: string, newConversationId?: string) => void;
  markUserTurn: (playerId: string, player: Player, analysis: string, round: number, pick: number, newConversationId?: string) => void;
  setAiAnswer: (answer: string) => void;
  clearAiAnswer: () => void;
  clearLocalState: () => void;
  
  // AI Assistant streaming actions
  openAssistantStreaming: () => void;
  appendAssistantStream: (text: string) => void;
  finishAssistantStreaming: () => void;
  failAssistantStreaming: (error: string) => void;
  closeAssistantStreaming: () => void;

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

  /** @deprecated Season state has moved to src/state/seasonStore.ts. This copy remains temporarily for backward compatibility until imports are updated. */
  // Season Mode actions
  setCurrentMode: (mode: 'draft' | 'season') => void;
  switchToSeasonMode: () => void;
  switchToDraftMode: () => void;
  setAvailableTeams: (teams: SeasonTeam[]) => void;
  setSelectedOpponentTeam: (team: SeasonTeam | null) => void;
  setBoykiesRoster: (roster: SeasonRoster | null) => void;
  setOpponentRoster: (roster: SeasonRoster | null) => void;
  setRostersLoading: (loading: boolean) => void;
  setRostersError: (error: string | null) => void;
  setTeamsLoading: (loading: boolean) => void;
  setTeamsError: (error: string | null) => void;
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
      hasInitializedDraft: false,
      hasHydrated: false,
    
      // AI integration state
      conversationId: null,
      strategy: null,
      draftInitialized: false,
      conversationMessages: [],
      isApiLoading: false,
      isInitializingDraft: false,
      isAnalysisLoading: false,
      aiAnswer: '',
      
      // AI Assistant streaming state
      assistantStreaming: {
        isOpen: false,
        isStreaming: false,
        content: '',
        error: undefined,
      },

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

      /** @deprecated Season state has moved to src/state/seasonStore.ts. This copy remains temporarily for backward compatibility until imports are updated. */
      // Season Mode state
      season: {
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
        lastCacheUpdate: 0
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
        hasInitializedDraft: false,
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
      
      markInitialized: () => set({ hasInitializedDraft: true }),
      
      resetInitialized: () => set({ hasInitializedDraft: false }),
      
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
    
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
      updateConversationMessage: (id: string, updates: Partial<ConversationMessage>) => set((s) => {
        const messageIndex = s.conversationMessages.findIndex(msg => msg.id === id);
        if (messageIndex === -1) {
          return s; // Message not found, no update
        }
        
        const updatedMessages = [...s.conversationMessages];
        const currentMessage = updatedMessages[messageIndex];
        
        // Special handling for content updates during streaming - append instead of replace
        let newContent = currentMessage.content;
        if (updates.content !== undefined && currentMessage.status === 'streaming') {
          newContent = currentMessage.content + updates.content;
        } else if (updates.content !== undefined) {
          newContent = updates.content;
        }
        
        updatedMessages[messageIndex] = {
          ...currentMessage,
          ...updates,
          content: newContent,
          timestamp: Date.now() // Update timestamp when modifying
        };
        
        return {
          conversationMessages: updatedMessages
        };
      }),
      
      persistStreamingContent: (content: string) => set((s) => {
        // Find existing strategy message and replace it, or create new one if none exists
        const existingStrategyIndex = s.conversationMessages.findIndex(msg => msg.type === 'strategy');
        
        const strategyMessage: ConversationMessage = {
          id: existingStrategyIndex >= 0 ? s.conversationMessages[existingStrategyIndex].id : `strategy-${generateUUID()}`,
          type: 'strategy',
          content: content,
          timestamp: Date.now()
        };
        
        let updatedMessages;
        if (existingStrategyIndex >= 0) {
          // Replace existing strategy message
          updatedMessages = [...s.conversationMessages];
          updatedMessages[existingStrategyIndex] = strategyMessage;
        } else {
          // Add new strategy message
          updatedMessages = [...s.conversationMessages, strategyMessage];
        }
        
        return {
          conversationMessages: updatedMessages
        };
      }),
      
      getLastInitializeMessage: () => {
        const state = get();
        // Find the most recent strategy message (used for initialize content)
        const strategyMessages = state.conversationMessages.filter(msg => msg.type === 'strategy');
        return strategyMessages.length > 0 ? strategyMessages[strategyMessages.length - 1] : null;
      },
      
      setApiLoading: (isApiLoading) => set({ isApiLoading }),
      
      setIsInitializingDraft: (isInitializingDraft) => set({ isInitializingDraft }),
      
      setAnalysisLoading: (isAnalysisLoading) => set({ isAnalysisLoading }),
      
      setAiAnswer: (answer) => set({ aiAnswer: answer }),
      
      clearAiAnswer: () => set({ aiAnswer: '' }),
      
      // AI Assistant streaming actions
      openAssistantStreaming: () => set({
        assistantStreaming: {
          isOpen: true,
          isStreaming: true,
          content: '',
          error: undefined,
        }
      }),
      appendAssistantStream: (text: string) => set((state) => ({
        assistantStreaming: {
          ...state.assistantStreaming,
          content: state.assistantStreaming.content + text,
        }
      })),
      finishAssistantStreaming: () => set((state) => ({
        assistantStreaming: {
          ...state.assistantStreaming,
          isStreaming: false,
        }
      })),
      failAssistantStreaming: (error: string) => set((state) => ({
        assistantStreaming: {
          ...state.assistantStreaming,
          isStreaming: false,
          error: error,
        }
      })),
      closeAssistantStreaming: () => set((state) => ({
        assistantStreaming: {
          ...state.assistantStreaming,
          isOpen: false,
        }
      })),
      
      clearLocalState: () => set({
        aiAnswer: '',
        drafted: {},
        myTeam: {},
        taken: {},
        hasInitializedDraft: false,
        actionHistory: [],
        currentRound: 1,
        conversationMessages: [],
        // Reset streaming state as well
        assistantStreaming: {
          isOpen: false,
          isStreaming: false,
          content: '',
          error: undefined,
        },
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

      /** @deprecated Season state has moved to src/state/seasonStore.ts. This copy remains temporarily for backward compatibility until imports are updated. */
      // Season Mode actions
      setCurrentMode: (mode) => set((s) => ({
        season: { ...s.season, currentMode: mode }
      })),

      switchToSeasonMode: () => set((s) => ({
        season: { ...s.season, currentMode: 'season' }
      })),

      switchToDraftMode: () => set((s) => ({
        season: { ...s.season, currentMode: 'draft' }
      })),

      setAvailableTeams: (teams) => set((s) => ({
        season: { ...s.season, availableTeams: teams }
      })),

      setSelectedOpponentTeam: (team) => set((s) => ({
        season: { ...s.season, selectedOpponentTeam: team }
      })),

      setBoykiesRoster: (roster) => set((s) => ({
        season: { ...s.season, boykiesRoster: roster }
      })),

      setOpponentRoster: (roster) => set((s) => ({
        season: { ...s.season, opponentRoster: roster }
      })),

      setRostersLoading: (loading) => set((s) => ({
        season: { ...s.season, rostersLoading: loading }
      })),

      setRostersError: (error) => set((s) => ({
        season: { ...s.season, rostersError: error }
      })),

      setTeamsLoading: (loading) => set((s) => ({
        season: { ...s.season, teamsLoading: loading }
      })),

      setTeamsError: (error) => set((s) => ({
        season: { ...s.season, teamsError: error }
      })),

      // Removed roster cache methods - these are now handled by seasonStore

      initializeSeasonMode: async () => {
        const store = get();
        try {
          store.setTeamsLoading(true);
          store.setTeamsError(null);
          
          try {
            // Legacy API is no longer available, fallback to mock data immediately
            throw new Error('Legacy /roster/allPlayers endpoint removed');
          } catch (apiError) {
            console.warn('Legacy API not available, falling back to mock data:', apiError);
            
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
            // Legacy API is no longer available, fallback to mock data immediately
            throw new Error('Legacy /roster/allPlayers endpoint removed');
          } catch (apiError) {
            console.warn('Legacy API not available, falling back to mock data:', apiError);
            
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

          // Cache checking is now handled by seasonStore
          // Skip cache checking in draftStore since seasonStore handles it

          let teamRoster: SeasonRoster | null = null;

          try {
            // This draftStore method is deprecated - use seasonStore instead
            throw new Error('Use seasonStore.fetchRosterComparison instead');
          } catch (apiError) {
            console.warn('API not available, falling back to mock roster data:', apiError);
            
            // Fall back to mock roster data when API is not available
            teamRoster = {
              teamId: opponentTeamId,
              teamName: store.season.availableTeams.find(t => t.id === opponentTeamId)?.name || opponentTeamId,
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
              const opponentTeam = store.season.availableTeams.find(t => t.id === opponentTeamId);
              if (opponentTeam) {
                store.setSelectedOpponentTeam(opponentTeam);
              }
            }
          }

          if (teamRoster) {
            // Roster caching is now handled by seasonStore

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
      setAllPlayersData: (data) => set((s) => ({
        season: { ...s.season, allPlayersData: data }
      })),

      setMyRoster: (roster) => set((s) => ({
        season: { ...s.season, myRoster: roster }
      })),

      setOpponentRosterData: (roster) => set((s) => ({
        season: { ...s.season, opponentRosterData: roster }
      })),

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
          // Load allPlayersData using utility (namespaced key for draft mode)
          const allPlayersData = getJSON('draft.allPlayersData', null);

          if (allPlayersData) {
            store.setAllPlayersData(allPlayersData);

            // Extract and set myRoster
            const myRoster = store.extractMyRoster(allPlayersData);
            store.setMyRoster(myRoster);
          } else {
            console.log('💾 No draft allPlayersData found in localStorage');
          }

          // Load opponentRoster using utility (namespaced key for draft mode)
          const opponentRoster = getJSON('draft.opponentRoster', null);
          if (opponentRoster) {
            store.setOpponentRosterData(opponentRoster);
            console.log('🏠 Site load - draft opponentRoster:', opponentRoster);
          }
        } catch (error) {
          console.error('💾 Failed to load roster data from storage:', error);
        }
      },

      saveAllPlayersDataToStorage: (data) => {
        try {
          setJSON('draft.allPlayersData', data);
        } catch (error) {
          console.error('Failed to save all players data to storage:', error);
        }
      },

      saveOpponentRosterToStorage: (roster) => {
        try {
          setJSON('draft.opponentRoster', roster);
        } catch (error) {
          console.error('Failed to save opponent roster to storage:', error);
        }
      },
    }),
    {
      name: 'bff-draft-store',
      storage: createJSONStorage(() => localStorage),
      version: 4,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>;
        
        // Migration from version 1 to version 2
        if (version < 2) {
          state.actionQueue = {
            queue: [],
            isProcessing: false,
            lastSyncAttempt: 0,
            syncErrors: []
          };
          state.syncStatus = {
            pendingCount: 0,
            failedCount: 0,
            conflictCount: 0
          };
          state.offlineActions = {
            totalQueued: 0,
            lastSuccessfulSync: 0
          };
        }
        
        // Add season state if not present (for any version < 3)
        if (!state.season) {
          state.season = {
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
            lastCacheUpdate: 0
          };
        }
        
        // Add new roster data fields if missing (migration to version 4)
        if (version < 4) {
          if (state.season && typeof state.season === 'object') {
            const seasonState = state.season as Record<string, unknown>;
            if (!seasonState.allPlayersData) seasonState.allPlayersData = null;
            if (!seasonState.myRoster) seasonState.myRoster = null;
            if (!seasonState.opponentRosterData) seasonState.opponentRosterData = null;
          }
        }
        
        return state;
      },
      onRehydrateStorage: () => {
        return (state) => {
          // Mark that we've hydrated from storage
          if (state) {
            state.setHasHydrated(true);
          }
        };
      }
    }
  )
)
