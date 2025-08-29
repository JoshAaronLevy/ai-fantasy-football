export interface Team {
  abbr: string;
  logoUrl: string;
}

export interface Player {
  id: string;
  name: string;
  position: string;
  team: Team;
  newOverallRank: number | null;
  previousOverallRank: number | null;
  newPositionRank: number | null;
  previousPositionRank: number | null;
  expectedRound: number | null;
  yearsPro: number | null;
  role?: string | null;
  competitionLevel?: string | null;
  byeWeek?: number | null;

  // Optional extended fields you might use later:
  reason?: string;
  attributes?: string[];
  riskScore?: number | null;
  stats?: unknown; // Different for K/DEF; keep open for now
}

// AI Conversation types
export interface ConversationMessage {
  id: string;
  type: 'strategy' | 'player-taken' | 'user-turn' | 'loading' | 'analysis';
  content: string;
  timestamp: number;
  player?: Player; // Associated player for player-taken and user-turn messages
  round?: number; // For user-turn and analysis messages
  pick?: number; // For user-turn and analysis messages
  meta?: { round: number; pick: number; playerCount?: number }; // For analysis messages
}

export interface AIConversationState {
  messages: ConversationMessage[];
  isLoading: boolean;
  lastUpdated: number;
}

// Draft Configuration interface
export interface DraftConfiguration {
  teams: number | null;
  pick: number | null;
}

// Enhanced Action Queue Types for Offline Mode
export interface QueuedAction {
  id: string; // UUID for deduplication
  type: 'draft' | 'taken' | 'initializeDraft';
  timestamp: number;
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict';
  attempt: number; // Retry counter
  payload: {
    // Action-specific data
    playerId?: string;
    player?: Player;
    round?: number;
    pick?: number;
    conversationId?: string;
    userId: string;
    // Draft initialization data
    draftConfig?: DraftConfiguration;
  };
  localState?: {
    // Snapshot of local state changes for rollback
    playerDrafted?: boolean;
    playerTaken?: boolean;
    actionHistoryIndex?: number;
  };
  conflictData?: {
    serverState: Record<string, unknown>;
    localState: Record<string, unknown>;
    resolutionNeeded: boolean;
  };
}

export interface ActionQueueState {
  queue: QueuedAction[];
  isProcessing: boolean;
  lastSyncAttempt: number;
  syncErrors: Array<{
    actionId: string;
    error: string;
    timestamp: number;
  }>;
}

export const ConflictType = {
  PLAYER_ALREADY_DRAFTED: 'player_already_drafted',
  TURN_ORDER_MISMATCH: 'turn_order_mismatch',
  ROUND_PROGRESSION: 'round_progression',
  CONVERSATION_EXPIRED: 'conversation_expired'
} as const;

export type ConflictType = typeof ConflictType[keyof typeof ConflictType];

export const ResolutionStrategy = {
  USE_SERVER: 'use_server',    // Discard local changes
  USE_LOCAL: 'use_local',      // Force local changes
  MERGE: 'merge',              // Intelligent merge
  SKIP: 'skip'                 // Skip this action
} as const;

export type ResolutionStrategy = typeof ResolutionStrategy[keyof typeof ResolutionStrategy];

