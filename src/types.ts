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
  type: 'strategy' | 'player-taken' | 'user-turn' | 'loading' | 'streaming';
  content: string;
  timestamp: number;
  player?: Player; // Associated player for player-taken and user-turn messages
  round?: number; // For user-turn messages
  pick?: number; // For user-turn messages
  isStreaming?: boolean; // True while content is still being streamed
  streamingError?: string; // Error message if streaming failed
}

export interface AIConversationState {
  messages: ConversationMessage[];
  isLoading: boolean;
  lastUpdated: number;
}

// Streaming-related types
export interface StreamingState {
  isActive: boolean;
  currentMessageId?: string;
  transportMode?: 'fetch' | 'sse';
  error?: string;
  startTime?: number;
  tokenCount?: number;
}

// LLM streaming request types
export interface LlmStreamingRequest {
  action: 'user-turn' | 'player-taken' | 'strategy' | 'analysis';
  conversationId?: string;
  payload: {
    player?: Player;
    round?: number;
    pick?: number;
    userRoster?: Record<string, true>;
    availablePlayers?: Player[];
    draftConfig?: {
      teams: number;
      pick: number;
    };
  };
}

// UI streaming controls
export interface StreamingControls {
  start: (request: LlmStreamingRequest) => Promise<void>;
  stop: () => void;
  retry: () => Promise<void>;
}
