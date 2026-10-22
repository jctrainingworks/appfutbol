// Tendencias observadas por mercado (estilo SoccerSTATS): en cuántos de sus últimos partidos se cumplió cada mercado.
// Son FRECUENCIAS PASADAS, no probabilidades garantizadas. Para no sobrevalorar muestras pequeñas, la columna "Media"
// usa un porcentaje suavizado hacia la media de la liga: (k + M·liga) / (n + M), con M = 4 partidos virtuales.
// Los mercados de parte (1ª/2ª) solo cuentan partidos que traen marcador al descanso.

export const SMOOTH = 4;

// g = partido visto desde un equipo: gf/ga = goles a favor/en contra; hf/ha = lo mismo al descanso (null si no hay dato)
export const GAME_MARKETS = [ // mercados del partido (no dependen de qué equipo): se promedian local y visitante
  { id: 'ht_o05', label: '1ª parte: más de 0,5 goles', need: 'ht', f: g => g.hf + g.ha >= 1 },
  { id: 'ht_o15', label: '1ª parte: más de 1,5 goles', need: 'ht', f: g => g.hf + g.ha >= 2 },
  { id: 'h2_o05', label: '2ª parte: más de 0,5 goles', need: 'ht', f: g => (g.gf - g.hf) + (g.ga - g.ha) >= 1 },
  { id: 'h2_o15', label: '2ª parte: más de 1,5 goles', need: 'ht', f: g => (g.gf - g.hf) + (g.ga - g.ha) >= 2 },
  { id: 'ft_o15', label: 'Partido: más de 1,5 goles', f: g => g.gf + g.ga >= 2 },
  { id: 'ft_o25', label: 'Partido: más de 2,5 goles', f: g => g.gf + g.ga >= 3 },
  { id: 'ft_o35', label: 'Partido: más de 3,5 goles', f: g => g.gf + g.ga >= 4 },
  { id: 'ft_u25', label: 'Partido: menos de 2,5 goles', f: g => g.gf + g.ga <= 2 },
  { id: 'btts', label: 'Ambos marcan', f: g => g.gf > 0 && g.ga > 0 },
  { id: 'nobtts', label: 'Ambos marcan: No', f: g => g.gf === 0 || g.ga === 0 },
  { id: 'co_o85', label: 'Corners: más de 8,5', need: 'co', grp: 'Corners del partido', f: g => corners(g) >= 9 },
  { id: 'co_o95', label: 'Corners: más de 9,5', need: 'co', grp: 'Corners del partido', f: g => corners(g) >= 10 },
  { id: 'co_o105', label: 'Corners: más de 10,5', need: 'co', grp: 'Corners del partido', f: g => corners(g) >= 11 },
  { id: 'co_o115', label: 'Corners: más de 11,5', need: 'co', grp: 'Corners del partido', f: g => corners(g) >= 12 },
  { id: 'ca_o25', label: 'Tarjetas: más de 2,5', need: 'ca', grp: 'Tarjetas del partido', f: g => cards(g) >= 3 },
  { id: 'ca_o35', label: 'Tarjetas: más de 3,5', need: 'ca', grp: 'Tarjetas del partido', f: g => cards(g) >= 4 },
  { id: 'ca_o45', label: 'Tarjetas: más de 4,5', need: 'ca', grp: 'Tarjetas del partido', f: g => cards(g) >= 5 },
  { id: 'ca_o55', label: 'Tarjetas: más de 5,5', need: 'ca', grp: 'Tarjetas del partido', f: g => cards(g) >= 6 },
];
export const TEAM_MARKETS = [ // mercados de cada equipo: se muestran por separado
  { id: 't_scores', label: 'Marca', f: g => g.gf > 0 },
  { id: 't_ht_scores', label: 'Marca en la 1ª parte', need: 'ht', f: g => g.hf > 0 },
  { id: 't_h2_scores', label: 'Marca en la 2ª parte', need: 'ht', f: g => g.gf - g.hf > 0 },
  { id: 't_cs', label: 'Portería a cero', f: g => g.ga === 0 },
  { id: 't_win', label: 'Gana', f: g => g.gf > g.ga },
  { id: 't_nolose', label: 'No pierde', f: g => g.gf >= g.ga },
  { id: 't_co_o45', label: 'Corners propios: más de 4,5', need: 'co', f: g => g.cf >= 5 },
  { id: 't_co_o55', label: 'Corners propios: más de 5,5', need: 'co', f: g => g.cf >= 6 },
  { id: 't_co_more', label: 'Más corners que el rival', need: 'co', f: g => g.cf > g.ca },
  { id: 't_ca_o15', label: 'Tarjetas propias: más de 1,5', need: 'ca', f: g => g.yf + g.rf >= 2 },
  { id: 't_ca_more', label: 'Más tarjetas que el rival', need: 'ca', f: g => g.yf + g.rf > g.ya + g.ra },
];

const done = ms => ms.filter(m => m.status === 'FT' && m.score);
const side = (arr, home) => Array.isArray(arr) ? (home ? [arr[0], arr[1]] : [arr[1], arr[0]]) : [null, null];
const persp = (m, home) => {
  const s = m.score, ht = s.ht, st = m.st || {};
  const [cf, ca] = side(st.corners, home), [yf, ya] = side(st.yellow, home), [rf, ra] = side(st.red, home);
  const g = home ? { gf: s.h, ga: s.a, hf: ht ? ht.h : null, ha: ht ? ht.a : null } : { gf: s.a, ga: s.h, hf: ht ? ht.a : null, ha: ht ? ht.h : null };
  return { ...g, cf, ca, yf, ya, rf, ra };
};
// Qué dato necesita cada mercado: ht = marcador al descanso, co = corners, ca = tarjetas (amarillas y rojas).
const HAS = { ht: g => g.hf != null, co: g => g.cf != null, ca: g => g.yf != null && g.rf != null };
const corners = g => g.cf + g.ca, cards = g => g.yf + g.ya + g.rf + g.ra;

// Partidos del equipo como local ('home') o visitante ('away'), los últimos `last` (0 = toda la temporada).
export function games(matches, teamId, venue, last = 0) {
  let l = done(matches).filter(m => (venue === 'home' ? m.home.id : m.away.id) === teamId).sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);
  if (last) l = l.slice(-last);
  return l.map(m => persp(m, venue === 'home'));
}

export function rate(gs, mk) {
  const use = mk.need ? gs.filter(HAS[mk.need]) : gs;
  return { k: use.filter(mk.f).length, n: use.length };
}

// Frecuencia de la liga: partidos del mercado visto una vez por partido (local) y, para los de equipo, desde ambos lados.
export function leagueRate(matches, mk, team) {
  const ms = done(matches);
  return rate(ms.flatMap(m => team ? [persp(m, true), persp(m, false)] : [persp(m, true)]), mk);
}

const frac = r => r.n ? r.k / r.n : null;
const smooth = (r, lg) => lg == null ? frac(r) : (r.k + SMOOTH * lg) / (r.n + SMOOTH);

export function matchTrends(matches, homeId, awayId, { last = 10 } = {}) {
  const gh = games(matches, homeId, 'home', last), ga = games(matches, awayId, 'away', last);
  const game = [], team = [];
  let skipped = 0;
  for (const mk of GAME_MARKETS) {
    const h = rate(gh, mk), a = rate(ga, mk), lg = leagueRate(matches, mk, false), lgF = frac(lg);
    if (!h.n || !a.n) { skipped++; continue; }
    const sh = smooth(h, lgF), sa = smooth(a, lgF);
    game.push({ id: mk.id, label: mk.label, h, a, lg, ph: frac(h), pa: frac(a), pl: lgF, avg: (sh + sa) / 2, rawAvg: (frac(h) + frac(a)) / 2, edge: lgF == null ? 0 : (sh + sa) / 2 - lgF });
  }
  for (const mk of TEAM_MARKETS) {
    const h = rate(gh, mk), a = rate(ga, mk), lg = leagueRate(matches, mk, true), lgF = frac(lg);
    if (!h.n || !a.n) { skipped++; continue; }
    team.push({ id: mk.id, label: mk.label, h, a, lg, ph: frac(h), pa: frac(a), pl: lgF, sh: smooth(h, lgF), sa: smooth(a, lgF) });
  }
  game.sort((x, y) => y.avg - x.avg);
  return { n: { h: gh.length, a: ga.length }, game, team, skipped };
}

// ---- Rankings por mercado (qué liga y qué equipo van mejor para un mercado) ----
export const ALL_MARKETS = [...GAME_MARKETS.map(m => ({ grp: 'Goles del partido', ...m, kind: 'game' })), ...TEAM_MARKETS.map(m => ({ grp: 'Por equipo', ...m, kind: 'team' }))];
export const marketById = id => ALL_MARKETS.find(m => m.id === id);

// leagues = [{ id, name, country, matches }]. venue: 'all' | 'home' | 'away'. Ordena por frecuencia suavizada hacia la media de su liga.
export function rankTeams(leagues, mk, { venue = 'all', minGames = 5 } = {}) {
  const rows = [];
  for (const l of leagues) {
    const ms = done(l.matches);
    if (!ms.length) continue;
    const lgF = frac(leagueRate(l.matches, mk, mk.kind === 'team')), by = new Map();
    const add = (t, g) => { if (!by.has(t.id)) by.set(t.id, { team: t, gs: [] }); by.get(t.id).gs.push(g); };
    for (const m of ms) {
      if (venue !== 'away') add(m.home, persp(m, true));
      if (venue !== 'home') add(m.away, persp(m, false));
    }
    for (const { team, gs } of by.values()) {
      const r = rate(gs, mk);
      if (r.n >= minGames) rows.push({ leagueId: l.id, league: l.name, team, k: r.k, n: r.n, p: r.k / r.n, pl: lgF, sm: smooth(r, lgF) });
    }
  }
  return rows.sort((a, b) => b.sm - a.sm || b.n - a.n);
}

// Solo para mercados del partido (en los de equipo, comparar ligas no tiene sentido). Mínimo de partidos con dato.
export function rankLeagues(leagues, mk, { minGames = 10 } = {}) {
  if (mk.kind !== 'game') return [];
  return leagues.map(l => { const r = leagueRate(l.matches, mk, false); return { id: l.id, name: l.name, country: l.country, k: r.k, n: r.n, p: r.n ? r.k / r.n : null }; })
    .filter(x => x.n >= minGames).sort((a, b) => b.p - a.p || b.n - a.n);
}
