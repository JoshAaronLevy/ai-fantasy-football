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
