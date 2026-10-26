// Perfil estadístico de los equipos para la pantalla Análisis: medias por partido, rivales recientes, tablas en casa y fuera,
// carga de partidos y enfrentamientos directos. Funciones puras sobre partidos ya jugados (nunca el propio partido ni posteriores:
// quien llama pasa solo los anteriores). Todo es descriptivo: lo que pasó, no una predicción.
import { lambdas, markets } from './poisson.js';

const done = ms => ms.filter(m => m.status === 'FT' && m.score);
const byDate = (a, b) => a.kickoff < b.kickoff ? -1 : a.kickoff > b.kickoff ? 1 : 0;
const pair = x => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite) ? x : null;

// Un partido visto desde un equipo. Los campos que la fuente no trae quedan en null (no se inventan).
export function view(m, home) {
  const s = m.score, st = m.st || {}, ht = s.ht;
  const mine = a => { const v = pair(a); return v ? (home ? v[0] : v[1]) : null; }, theirs = a => { const v = pair(a); return v ? (home ? v[1] : v[0]) : null; };
  return {
    id: m.id, kickoff: m.kickoff, home, opp: home ? m.away : m.home,
    gf: home ? s.h : s.a, ga: home ? s.a : s.h,
    hf: ht ? (home ? ht.h : ht.a) : null, ha: ht ? (home ? ht.a : ht.h) : null,
    sf: mine(st.shots), sa: theirs(st.shots), tf: mine(st.sot), ta: theirs(st.sot), cf: mine(st.corners), ca: theirs(st.corners),
    fl: mine(st.fouls), yf: mine(st.yellow), rf: mine(st.red),
  };
}

// Métricas por partido. f = valor de un partido (null si falta el dato); ratio = suma(num)/suma(den) sobre los partidos con dato.
export const METRICS = [
  { id: 'ppg', grp: 'Resultados', label: 'Puntos por partido', d: 2, f: g => g.gf > g.ga ? 3 : g.gf === g.ga ? 1 : 0 },
  { id: 'win', label: 'Victorias', pct: true, f: g => g.gf > g.ga ? 1 : 0 },
  { id: 'gf', grp: 'Goles', label: 'Goles a favor', d: 2, f: g => g.gf },
  { id: 'ga', label: 'Goles en contra', d: 2, f: g => g.ga },
  { id: 'cs', label: 'Portería a cero', pct: true, f: g => g.ga === 0 ? 1 : 0 },
  { id: 'fts', label: 'Sin marcar', pct: true, f: g => g.gf === 0 ? 1 : 0 },
  { id: 'btts', label: 'Ambos marcan', pct: true, f: g => g.gf > 0 && g.ga > 0 ? 1 : 0 },
  { id: 'o25', label: 'Partido con más de 2,5 goles', pct: true, f: g => g.gf + g.ga >= 3 ? 1 : 0 },
  { id: 'sf', grp: 'Remates', label: 'Remates a favor', d: 1, f: g => g.sf },
  { id: 'sa', label: 'Remates en contra', d: 1, f: g => g.sa },
  { id: 'tf', label: 'Remates a puerta a favor', d: 1, f: g => g.tf },
  { id: 'ta', label: 'Remates a puerta en contra', d: 1, f: g => g.ta },
  { id: 'conv', label: 'Goles por remate a puerta', pct: true, ratio: [g => g.tf == null ? null : g.gf, g => g.tf] },
  { id: 'sv', label: 'Remates a puerta recibidos que no son gol', pct: true, ratio: [g => g.ta == null ? null : g.ta - g.ga, g => g.ta] },
  { id: 'cf', grp: 'Córners, faltas y tarjetas', label: 'Córners a favor', d: 1, f: g => g.cf },
  { id: 'ca', label: 'Córners en contra', d: 1, f: g => g.ca },
  { id: 'fl', label: 'Faltas cometidas', d: 1, f: g => g.fl },
  { id: 'yf', label: 'Amarillas', d: 2, f: g => g.yf },
  { id: 'rf', label: 'Rojas', d: 2, f: g => g.rf },
  { id: 'hf', grp: 'Por partes', label: '1ª parte: goles a favor', d: 2, f: g => g.hf },
  { id: 'ha', label: '1ª parte: goles en contra', d: 2, f: g => g.ha },
  { id: 'h2f', label: '2ª parte: goles a favor', d: 2, f: g => g.hf == null ? null : g.gf - g.hf },
  { id: 'h2a', label: '2ª parte: goles en contra', d: 2, f: g => g.ha == null ? null : g.ga - g.ha },
  { id: 'htw', label: 'Ganando al descanso', pct: true, f: g => g.hf == null ? null : g.hf > g.ha ? 1 : 0 },
];

// gs: partidos vistos desde un equipo. Devuelve { id: { v, n } } con v = media (o proporción) y n = partidos con dato (v null si n = 0).
export function profile(gs) {
  const out = {};
  for (const mt of METRICS) {
    if (mt.ratio) {
      let num = 0, den = 0, n = 0;
      for (const g of gs) { const a = mt.ratio[0](g), b = mt.ratio[1](g); if (a != null && b != null) { num += a; den += b; n++; } }
      out[mt.id] = { v: n && den > 0 ? num / den : null, n };
    } else {
      const v = gs.map(mt.f).filter(x => x != null);
      out[mt.id] = { v: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, n: v.length };
    }
  }
  return out;
}

// Partidos de un equipo en una condición: 'home' (solo en casa), 'away' (solo fuera) o 'all'; last = últimos N (0 = todos).
export function teamGames(matches, teamId, venue = 'all', last = 0) {
  let l = done(matches).filter(m => (venue !== 'away' && m.home.id === teamId) || (venue !== 'home' && m.away.id === teamId)).sort(byDate);
  if (last) l = l.slice(-last);
  return l.map(m => view(m, m.home.id === teamId));
}
// Media de TODA la liga para esa condición ('home' = lo que hacen los locales, 'away' = lo que hacen los visitantes).
export const leagueGames = (matches, venue) => done(matches).map(m => view(m, venue === 'home'));

// ---- Fuerza de los equipos y rivales recientes ----
// Fuerza = ataque / defensa del modelo Poisson (1,00 ≈ media de la liga; mayor = más fuerte). Ordena a los equipos de la liga.
export function strengths(model) {
  if (!model) return null;
  const s = Object.fromEntries(Object.entries(model.teams).map(([id, t]) => [id, t.att / t.def]));
  const ids = Object.keys(s).sort((a, b) => s[b] - s[a] || (a < b ? -1 : 1)), rank = Object.fromEntries(ids.map((id, i) => [id, i + 1]));
  return { s, rank, n: ids.length };
}
const tier = (rank, n) => rank <= n / 3 ? 'fuerte' : rank <= 2 * n / 3 ? 'medio' : 'débil';

// Últimos `last` partidos de un equipo con la fuerza del rival y los puntos que el modelo esperaba en ese partido (descriptivo: el modelo
// ya incluye ese partido al estimar las fuerzas). Si el rival no tiene fuerza (equipo sin partidos) queda null.
export function recentWithOpponents(matches, teamId, model, last = 5) {
  const st = strengths(model), gs = teamGames(matches, teamId, 'all', last);
  const rows = gs.map(g => {
    const rank = st ? st.rank[g.opp.id] ?? null : null, s = st ? st.s[g.opp.id] ?? null : null;
    let exp = null;
    const l = model && lambdas(model, g.home ? teamId : g.opp.id, g.home ? g.opp.id : teamId);
    if (l) { const q = markets(l.h, l.a); exp = g.home ? 3 * q.p1 + q.pX : 3 * q.p2 + q.pX; }
    const pts = g.gf > g.ga ? 3 : g.gf === g.ga ? 1 : 0;
    return { ...g, rank, strength: s, tier: rank ? tier(rank, st.n) : null, pts, expPts: exp };
  });
  const ranked = rows.filter(r => r.rank), withExp = rows.filter(r => r.expPts != null);
  return {
    rows, n: st ? st.n : 0,
    avgRank: ranked.length ? ranked.reduce((a, r) => a + r.rank, 0) / ranked.length : null,
    avgStrength: ranked.length ? ranked.reduce((a, r) => a + r.strength, 0) / ranked.length : null,
    pts: rows.reduce((a, r) => a + r.pts, 0), expPts: withExp.length === rows.length && rows.length ? withExp.reduce((a, r) => a + r.expPts, 0) : null,
  };
}

// ---- Tablas en casa y fuera ----
export function venueTable(matches, teams, venue) {
  const t = new Map(teams.map(x => [x.id, { team: x, pj: 0, pts: 0, gf: 0, gc: 0 }])), home = venue === 'home';
  for (const m of done(matches)) {
    const r = t.get(home ? m.home.id : m.away.id); if (!r) continue;
    const f = home ? m.score.h : m.score.a, c = home ? m.score.a : m.score.h;
    r.pj++; r.gf += f; r.gc += c; r.pts += f > c ? 3 : f === c ? 1 : 0;
  }
  return [...t.values()].map(r => ({ ...r, dg: r.gf - r.gc })).sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || (a.team.name < b.team.name ? -1 : 1)).map((r, i) => ({ ...r, pos: i + 1 }));
}

// ---- Carga de partidos y descanso (solo la liga: copas y competición europea no están en la fuente) ----
export function load(matches, teamId, kickoff) {
  const ms = done(matches).filter(m => (m.home.id === teamId || m.away.id === teamId) && m.kickoff < kickoff).sort(byDate), k = Date.parse(kickoff);
  const within = d => ms.filter(m => k - Date.parse(m.kickoff) <= d * 864e5).length;
  return { rest: ms.length ? Math.round((k - Date.parse(ms[ms.length - 1].kickoff)) / 864e5) : null, last14: within(14), last30: within(30) };
}

// ---- Enfrentamientos directos (la temporada actual y la anterior) ----
export function headToHead(matches, prev, homeId, awayId, max = 8) {
  const all = [...done(prev || []), ...done(matches)].filter(m => (m.home.id === homeId && m.away.id === awayId) || (m.home.id === awayId && m.away.id === homeId)).sort(byDate).reverse();
  const rows = all.slice(0, max), pov = rows.map(m => view(m, m.home.id === homeId));   // desde el punto de vista del equipo local de hoy
  const n = pov.length;
  return {
    rows: rows.map((m, i) => ({ kickoff: m.kickoff, home: m.home, away: m.away, h: m.score.h, a: m.score.a, pov: pov[i] })), n,
    w: pov.filter(g => g.gf > g.ga).length, d: pov.filter(g => g.gf === g.ga).length, l: pov.filter(g => g.gf < g.ga).length,
    gf: n ? pov.reduce((a, g) => a + g.gf, 0) / n : null, ga: n ? pov.reduce((a, g) => a + g.ga, 0) / n : null,
    btts: n ? pov.filter(g => g.gf > 0 && g.ga > 0).length / n : null, o25: n ? pov.filter(g => g.gf + g.ga >= 3).length / n : null,
  };
}
