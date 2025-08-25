export function computeRoundPick(totalTeams: number, globalPickIndex: number) {
  if (!Number.isFinite(totalTeams) || totalTeams <= 0) throw new Error('Invalid totalTeams');
  if (!Number.isFinite(globalPickIndex) || globalPickIndex < 0) throw new Error('Invalid pick index');
  const round = Math.floor(globalPickIndex / totalTeams) + 1;
  const pick  = (globalPickIndex % totalTeams) + 1;
  return { round, pick };
}