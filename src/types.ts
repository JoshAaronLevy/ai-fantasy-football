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
  meta?: { round: number; pick: number }; // For analysis messages
}

export interface AIConversationState {
  messages: ConversationMessage[];
  isLoading: boolean;
  lastUpdated: number;
}

