export function pickTopPlayersForInit(players: any[], limit = 25): any[] {
  return players.slice(0, limit).map(p => ({
    id: p.id,
    name: p.name,
    position: p.position,
    team: p.team,
    byeWeek: p.byeWeek,
    previousOverallRank: p.previousOverallRank,
    previuosPositionRank: p.previuosPositionRank,
    newOverallRank: p.newOverallRank,
    newPositionRank: p.newPositionRank,
    stats: p.stats,
    adp: p.adp
  }));
}