export interface NFLTeam {
  abbr: string;
  logoUrl: string;
  city: string;
  name: string;
}

export const NFL_TEAMS: NFLTeam[] = [
  // AFC East
  { abbr: 'BUF', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/buf.png&w=50&h=50', city: 'Buffalo', name: 'Bills' },
  { abbr: 'MIA', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/mia.png&w=50&h=50', city: 'Miami', name: 'Dolphins' },
  { abbr: 'NE', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/ne.png&w=50&h=50', city: 'New England', name: 'Patriots' },
  { abbr: 'NYJ', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nyj.png&w=50&h=50', city: 'New York', name: 'Jets' },

  // AFC North
  { abbr: 'BAL', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/bal.png&w=50&h=50', city: 'Baltimore', name: 'Ravens' },
  { abbr: 'CIN', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/cin.png&w=50&h=50', city: 'Cincinnati', name: 'Bengals' },
  { abbr: 'CLE', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/cle.png&w=50&h=50', city: 'Cleveland', name: 'Browns' },
  { abbr: 'PIT', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/pit.png&w=50&h=50', city: 'Pittsburgh', name: 'Steelers' },

  // AFC South
  { abbr: 'HOU', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/hou.png&w=50&h=50', city: 'Houston', name: 'Texans' },
  { abbr: 'IND', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/ind.png&w=50&h=50', city: 'Indianapolis', name: 'Colts' },
  { abbr: 'JAX', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/jax.png&w=50&h=50', city: 'Jacksonville', name: 'Jaguars' },
  { abbr: 'TEN', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/ten.png&w=50&h=50', city: 'Tennessee', name: 'Titans' },

  // AFC West
  { abbr: 'DEN', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/den.png&w=50&h=50', city: 'Denver', name: 'Broncos' },
  { abbr: 'KC', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/kc.png&w=50&h=50', city: 'Kansas City', name: 'Chiefs' },
  { abbr: 'LV', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/lv.png&w=50&h=50', city: 'Las Vegas', name: 'Raiders' },
  { abbr: 'LAC', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/lac.png&w=50&h=50', city: 'Los Angeles', name: 'Chargers' },

  // NFC East
  { abbr: 'DAL', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/dal.png&w=50&h=50', city: 'Dallas', name: 'Cowboys' },
  { abbr: 'NYG', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/nyg.png&w=50&h=50', city: 'New York', name: 'Giants' },
  { abbr: 'PHI', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/phi.png&w=50&h=50', city: 'Philadelphia', name: 'Eagles' },
  { abbr: 'WAS', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/wsh.png&w=50&h=50', city: 'Washington', name: 'Commanders' },

  // NFC North
  { abbr: 'CHI', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/chi.png&w=50&h=50', city: 'Chicago', name: 'Bears' },
  { abbr: 'DET', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/det.png&w=50&h=50', city: 'Detroit', name: 'Lions' },
  { abbr: 'GB', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/gb.png&w=50&h=50', city: 'Green Bay', name: 'Packers' },
  { abbr: 'MIN', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/min.png&w=50&h=50', city: 'Minnesota', name: 'Vikings' },

  // NFC South
  { abbr: 'ATL', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/atl.png&w=50&h=50', city: 'Atlanta', name: 'Falcons' },
  { abbr: 'CAR', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/car.png&w=50&h=50', city: 'Carolina', name: 'Panthers' },
  { abbr: 'NO', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/no.png&w=50&h=50', city: 'New Orleans', name: 'Saints' },
  { abbr: 'TB', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/tb.png&w=50&h=50', city: 'Tampa Bay', name: 'Buccaneers' },

  // NFC West
  { abbr: 'ARI', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/ari.png&w=50&h=50', city: 'Arizona', name: 'Cardinals' },
  { abbr: 'LAR', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/lar.png&w=50&h=50', city: 'Los Angeles', name: 'Rams' },
  { abbr: 'SF', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/sf.png&w=50&h=50', city: 'San Francisco', name: '49ers' },
  { abbr: 'SEA', logoUrl: 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500/sea.png&w=50&h=50', city: 'Seattle', name: 'Seahawks' },
];

/**
 * Get a team object by its abbreviation
 * @param abbr - The team abbreviation (e.g., 'BAL', 'BUF')
 * @returns The team object or undefined if not found
 */
export function getTeamByAbbr(abbr: string): NFLTeam | undefined {
  return NFL_TEAMS.find(team => team.abbr === abbr);
}