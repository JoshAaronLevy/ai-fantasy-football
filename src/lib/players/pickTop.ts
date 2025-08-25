// OLD: export function pickTopPlayersForInit(players: any[], limit = 25): any[] {
export function pickTopPlayersForInit(players: any[], limit = 12): any[] {
  return players.slice(0, limit).map(p => ({
    id: p.id,
    name: typeof p.name === 'string' ? p.name.slice(0, 200) : p.name,
    position: typeof p.position === 'string' ? p.position.slice(0, 200) : p.position,
    team: typeof p.team === 'string' ? p.team.slice(0, 200) : p.team,
    byeWeek: p.byeWeek,
    adp: p.adp
  }));
}