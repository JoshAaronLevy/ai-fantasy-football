// src/season/lib/normalizePlayer.ts
import type { ApiPlayer, MatchupInfo, ProjectedPoints, TeamMini } from '@/types';

type AnyPlayer = any;

function coerceTeam(team: AnyPlayer['team']): TeamMini {
  if (!team) return { abbr: '' };
  if (typeof team === 'string') return { abbr: team.toUpperCase() };
  const abbr = (team.abbr ?? '').toUpperCase();
  return { abbr, logoUrl: team.logoUrl };
}

function coerceProjectedPoints(pp: any): ProjectedPoints {
  if (!pp || typeof pp !== 'object') {
    // Legacy number case
    if (typeof pp === 'number') return { default: pp, llm: 0 };
    return { default: null, llm: 0 };
  }
  const d = Number(pp.default);
  const l = Number(pp.llm);
  return {
    default: Number.isFinite(d) ? d : null,
    llm: Number.isFinite(l) ? l : 0,
  };
}

function coerceMatchup(m: any): MatchupInfo {
  if (!m || typeof m !== 'object') {
    return { week: 0, projectedPoints: { default: null, llm: 0 } };
  }
  return {
    week: Number(m.week) || 0,
    type: m.type,
    opponent: m.opponent ? coerceTeam(m.opponent) : undefined,
    kickoff: m.kickoff,
    projectedScore: m.projectedScore ?? '',
    finalScore: m.finalScore ?? '',
    projectedPoints: coerceProjectedPoints(m.projectedPoints),
    weather: m.weather ? {
      kickoffLocal: m.weather.kickoffLocal,
      context: m.weather.context,
      tempLowF: m.weather.tempLowF,
      tempHighF: m.weather.tempHighF,
      windMeanMph: m.weather.windMeanMph,
      precipAvgIn: m.weather.precipAvgIn,
    } : undefined,
  };
}

/** Normalize any incoming API player to the new ApiPlayer shape. */
export function normalizePlayer(p: AnyPlayer): ApiPlayer {
  const position = (p.position ?? p.pos ?? '').toString().toUpperCase();
  return {
    id: p.id ?? undefined,
    name: p.name,
    position,
    fantasyTeam: p.fantasyTeam ?? undefined,
    team: coerceTeam(p.team),
    starter: Boolean(p.starter),
    matchup: coerceMatchup(p.matchup),
    analysis: typeof p.analysis === 'string' ? p.analysis : undefined,
    expectedLine: (p.expectedLine && typeof p.expectedLine === 'object') ? p.expectedLine : undefined,
    explanation: typeof p.explanation === 'string' ? p.explanation : undefined,
    confidence: Number.isFinite(Number(p.confidence)) ? Number(p.confidence) : undefined,
    _diag: p._diag && typeof p._diag === 'object' ? p._diag : undefined,
  };
}

/** Normalize an array safely. */
export function normalizePlayers(arr: any[]): ApiPlayer[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizePlayer);
}