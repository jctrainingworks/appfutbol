// Tendencias observadas por mercado (estilo SoccerSTATS): en cuántos de sus últimos partidos se cumplió cada mercado.
// Son FRECUENCIAS PASADAS, no probabilidades garantizadas. Para no sobrevalorar muestras pequeñas, la columna "Media"
// usa un porcentaje suavizado hacia la media de la liga: (k + M·liga) / (n + M), con M = 4 partidos virtuales.
// Los mercados de parte (1ª/2ª) solo cuentan partidos que traen marcador al descanso.

export const SMOOTH = 4;

// g = partido visto desde un equipo: gf/ga = goles a favor/en contra; hf/ha = lo mismo al descanso (null si no hay dato)
export const GAME_MARKETS = [ // mercados del partido (no dependen de qué equipo): se promedian local y visitante
  { id: 'ht_o05', label: '1ª parte: más de 0,5 goles', ht: 1, f: g => g.hf + g.ha >= 1 },
  { id: 'ht_o15', label: '1ª parte: más de 1,5 goles', ht: 1, f: g => g.hf + g.ha >= 2 },
  { id: 'h2_o05', label: '2ª parte: más de 0,5 goles', ht: 1, f: g => (g.gf - g.hf) + (g.ga - g.ha) >= 1 },
  { id: 'h2_o15', label: '2ª parte: más de 1,5 goles', ht: 1, f: g => (g.gf - g.hf) + (g.ga - g.ha) >= 2 },
  { id: 'ft_o15', label: 'Partido: más de 1,5 goles', f: g => g.gf + g.ga >= 2 },
  { id: 'ft_o25', label: 'Partido: más de 2,5 goles', f: g => g.gf + g.ga >= 3 },
  { id: 'ft_o35', label: 'Partido: más de 3,5 goles', f: g => g.gf + g.ga >= 4 },
  { id: 'ft_u25', label: 'Partido: menos de 2,5 goles', f: g => g.gf + g.ga <= 2 },
  { id: 'btts', label: 'Ambos marcan', f: g => g.gf > 0 && g.ga > 0 },
  { id: 'nobtts', label: 'Ambos marcan: No', f: g => g.gf === 0 || g.ga === 0 },
];
export const TEAM_MARKETS = [ // mercados de cada equipo: se muestran por separado
  { id: 't_scores', label: 'Marca', f: g => g.gf > 0 },
  { id: 't_ht_scores', label: 'Marca en la 1ª parte', ht: 1, f: g => g.hf > 0 },
  { id: 't_h2_scores', label: 'Marca en la 2ª parte', ht: 1, f: g => g.gf - g.hf > 0 },
  { id: 't_cs', label: 'Portería a cero', f: g => g.ga === 0 },
  { id: 't_win', label: 'Gana', f: g => g.gf > g.ga },
  { id: 't_nolose', label: 'No pierde', f: g => g.gf >= g.ga },
];

const done = ms => ms.filter(m => m.status === 'FT' && m.score);
const persp = (m, home) => {
  const s = m.score, ht = s.ht;
  return home ? { gf: s.h, ga: s.a, hf: ht ? ht.h : null, ha: ht ? ht.a : null } : { gf: s.a, ga: s.h, hf: ht ? ht.a : null, ha: ht ? ht.h : null };
};

// Partidos del equipo como local ('home') o visitante ('away'), los últimos `last` (0 = toda la temporada).
export function games(matches, teamId, venue, last = 0) {
  let l = done(matches).filter(m => (venue === 'home' ? m.home.id : m.away.id) === teamId).sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);
  if (last) l = l.slice(-last);
  return l.map(m => persp(m, venue === 'home'));
}

export function rate(gs, mk) {
  const use = mk.ht ? gs.filter(g => g.hf != null) : gs;
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
    game.push({ id: mk.id, label: mk.label, h, a, lg, ph: frac(h), pa: frac(a), pl: lgF, avg: (sh + sa) / 2, rawAvg: (frac(h) + frac(a)) / 2 });
  }
  for (const mk of TEAM_MARKETS) {
    const h = rate(gh, mk), a = rate(ga, mk), lg = leagueRate(matches, mk, true), lgF = frac(lg);
    if (!h.n || !a.n) { skipped++; continue; }
    team.push({ id: mk.id, label: mk.label, h, a, lg, ph: frac(h), pa: frac(a), pl: lgF, sh: smooth(h, lgF), sa: smooth(a, lgF) });
  }
  game.sort((x, y) => y.avg - x.avg);
  return { n: { h: gh.length, a: ga.length }, game, team, skipped };
}
