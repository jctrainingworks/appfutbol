// Proveedor real: football-data.org v4, siempre a través del proxy (worker/). Sin claves en el navegador.
// Cumple el mismo contrato que demo.js: leagues, league, match, matches, standings.
// Una sola llamada por liga (partidos de la temporada actual); clasificación y equipos se derivan de ahí.
// Los ids son strings: liga = código ('PD'), partido = 'PD-<id>', equipo = '<id>'.
import { CONFIG } from '../config.js';
import { computeStandings } from './standings.js';

const SRC = 'football-data.org';
const TTL = 10 * 60e3; // caché en navegador; el plan gratuito permite 10 llamadas/min
const NAMES = { PD: 'LaLiga', PL: 'Premier League', BL1: 'Bundesliga', SA: 'Serie A', FL1: 'Ligue 1' };
const STATUS = { FINISHED: 'FT', AWARDED: 'FT', IN_PLAY: 'LIVE', PAUSED: 'LIVE', SCHEDULED: 'NS', TIMED: 'NS' };
const mem = new Map();

// Marcador al descanso si la API lo trae (si no, null: esos partidos no cuentan en los mercados de parte).
const half = s => Number.isInteger(s?.halfTime?.home) && Number.isInteger(s?.halfTime?.away) ? { h: s.halfTime.home, a: s.halfTime.away } : null;

const team = t => ({ id: String(t.id), name: t.shortName || t.name });

// Para modelos 1X2/goles interesa el marcador a 90 min: si hubo prórroga/penaltis se usa regularTime.
function goals(s) {
  const x = s?.duration && s.duration !== 'REGULAR' && s.regularTime ? s.regularTime : s?.fullTime;
  return Number.isInteger(x?.home) && Number.isInteger(x?.away) ? { h: x.home, a: x.away } : null;
}

export function mapSeason(code, raw) {
  const matches = (raw.matches || []).filter(m => m.homeTeam?.id && m.awayTeam?.id).map(m => {
    const status = STATUS[m.status] || 'OTHER', score = goals(m.score), ht = half(m.score);
    return {
      id: `${code}-${m.id}`, leagueId: code, round: m.matchday || 0, kickoff: m.utcDate,
      home: team(m.homeTeam), away: team(m.awayTeam),
      status: status === 'FT' && !score ? 'OTHER' : status, score: (status === 'FT' || status === 'LIVE') && score ? { ...score, ht } : null, source: SRC,
    };
  });
  const teams = [...new Map(matches.flatMap(m => [m.home, m.away]).map(t => [t.id, t])).values()];
  const league = {
    id: code, name: NAMES[code] || raw.competition?.name || code, country: raw.competition?.area?.name || '',
    rounds: Math.max(0, ...matches.map(m => m.round)), teams, source: SRC,
  };
  return { league, matches };
}

function season(code) {
  const key = `fd1:${code}`, hit = mem.get(key);
  if (hit) return hit;
  try {
    const s = JSON.parse(localStorage.getItem(key));
    if (s && Date.now() - s.t < TTL) { const p = Promise.resolve(s.v); mem.set(key, p); setTimeout(() => mem.delete(key), TTL); return p; }
  } catch { /* sin localStorage: se ignora */ }
  const p = fetch(`${CONFIG.proxyUrl.replace(/\/$/, '')}/competitions/${encodeURIComponent(code)}/matches`).then(async r => {
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      throw new Error(r.status === 429 ? 'Límite de llamadas de football-data.org alcanzado; espera un minuto.' : `${code}: ${b.message || b.error || 'error ' + r.status}`);
    }
    return mapSeason(code, await r.json());
  });
  mem.set(key, p);
  // Éxito: persiste y expira a los 10 min. Fallo: se recuerda 60 s para no reintentar en cada pantalla (cupo 10/min).
  p.then(v => { try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch { /* cuota llena */ } setTimeout(() => mem.delete(key), TTL); },
    () => setTimeout(() => mem.delete(key), 60e3));
  return p;
}

async function all() {
  const r = await Promise.allSettled(CONFIG.competitions.map(season));
  const ok = r.filter(x => x.status === 'fulfilled').map(x => x.value);
  if (!ok.length) throw r[0]?.reason || new Error('Sin competiciones configuradas');
  return ok;
}

const sorted = (list, status) => {
  const r = list.filter(m => status === 'FT' ? m.status === 'FT' : status === 'NS' ? m.status === 'NS' || m.status === 'LIVE' : true)
    .sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);
  return status === 'FT' ? r.reverse() : r;
};

export const footballdata = {
  meta: { id: 'footballdata', label: SRC, isDemo: false },
  async leagues() { return (await all()).map(s => s.league); },
  async league(id) { return CONFIG.competitions.includes(id) ? (await season(id)).league : null; },
  async match(id) {
    const code = String(id).split('-')[0];
    return CONFIG.competitions.includes(code) ? (await season(code)).matches.find(m => m.id === id) || null : null;
  },
  async matches({ leagueId, teamId, status, limit } = {}) {
    const seasons = leagueId ? (CONFIG.competitions.includes(leagueId) ? [await season(leagueId)] : []) : await all();
    const list = seasons.flatMap(s => s.matches).filter(m => !teamId || m.home.id === teamId || m.away.id === teamId);
    const r = sorted(list, status);
    return limit ? r.slice(0, limit) : r;
  },
  async standings(leagueId) {
    if (!CONFIG.competitions.includes(leagueId)) return [];
    const { league, matches } = await season(leagueId);
    return computeStandings(matches, league.teams);
  },
};
