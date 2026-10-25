// "Lectura del partido": resumen de un vistazo y 1-2 mercados favoritos. Funciones puras, sin red.
// Todo sale de cálculos reproducibles sobre los partidos anteriores (modelo Poisson + tendencias + forma + descanso + clasificación).
// NO hay datos de lesiones, sanciones ni alineaciones en la fuente: la lectura lo dice siempre en lugar de suponerlo.

const pct = p => Math.round(p * 100) + '%';
const num = x => x.toFixed(1).replace('.', ',');
const done = ms => ms.filter(m => m.status === 'FT' && m.score);
const byDate = (a, b) => a.kickoff < b.kickoff ? -1 : 1;

// Mercados del partido que el modelo Poisson también calcula: permiten contrastar tendencia (lo que pasó) con modelo (lo que se espera).
const MODEL_OF = {
  ft_o15: pr => pr.over['1.5'], ft_o25: pr => pr.over['2.5'], ft_o35: pr => pr.over['3.5'], ft_u25: pr => pr.under['2.5'],
  btts: pr => pr.btts.si, nobtts: pr => pr.btts.no,
};
// Cuota Bet365 disponible para algunos mercados (la fuente solo trae 1X2 y más/menos 2,5).
const ODDS_OF = {
  ft_o25: o => o.ou25 && o.ou25[0], ft_u25: o => o.ou25 && o.ou25[1],
  '1': o => o.b365 && o.b365[0], X: o => o.b365 && o.b365[1], '2': o => o.b365 && o.b365[2],
};
const MIN_SAMPLE = 5;      // por debajo: muestra pequeña (se propone igualmente, con confianza baja y aviso)
const HARD_MIN = 3;        // por debajo: no se propone nada
const AGREE = 0.15;        // diferencia máxima tendencia-modelo para decir que "coinciden"
const SMALL_PENALTY = 0.05;    // idem para muestras pequeñas
const NO_MODEL_PENALTY = 0.04; // un mercado sin contraste del modelo cuenta algo menos al ordenar (decisión de diseño, no estadística)

// Últimos `n` partidos del equipo (en casa o fuera) anteriores al partido analizado.
export function recent(train, teamId, n = 5) {
  return done(train).filter(m => m.home.id === teamId || m.away.id === teamId).sort(byDate).slice(-n).map(m => {
    const home = m.home.id === teamId, gf = home ? m.score.h : m.score.a, ga = home ? m.score.a : m.score.h;
    return { r: gf > ga ? 'W' : gf < ga ? 'L' : 'D', gf, ga, home, kickoff: m.kickoff };
  });
}
const pts = l => l.reduce((s, x) => s + (x.r === 'W' ? 3 : x.r === 'D' ? 1 : 0), 0);

// Días desde el último partido del equipo hasta el del partido analizado (null si no hay partido previo).
export function restDays(train, teamId, kickoff) {
  const last = done(train).filter(m => m.home.id === teamId || m.away.id === teamId).sort(byDate).pop();
  return last ? Math.round((Date.parse(kickoff) - Date.parse(last.kickoff)) / 864e5) : null;
}

// Enfrentamientos previos entre ambos en los datos disponibles (solo la temporada actual).
export function h2h(train, homeId, awayId) {
  return done(train).filter(m => (m.home.id === homeId && m.away.id === awayId) || (m.home.id === awayId && m.away.id === homeId)).sort(byDate);
}

export function leagueGoalsAvg(train) {
  const d = done(train);
  return d.length ? d.reduce((s, m) => s + m.score.h + m.score.a, 0) / d.length : null;
}

// Candidatos a favorito: mercados del partido (tendencias) + 1X2 y doble oportunidad (modelo).
export function candidates(tr, pr, m) {
  const out = [], o = m.odds || {}, small = Math.min(tr?.n.h ?? 0, tr?.n.a ?? 0) < MIN_SAMPLE;
  for (const r of tr?.game ?? []) {
    const mf = pr && MODEL_OF[r.id], model = mf ? mf(pr) : null;
    const p = model == null ? r.avg : (r.avg + model) / 2;
    const n = Math.min(r.h.n, r.a.n);
    const agree = model == null ? null : Math.abs(r.avg - model) <= AGREE;
    const ov = ODDS_OF[r.id], odds = ov ? ov(o) : null;
    out.push({ id: r.id, label: r.label, p, trend: r.avg, model, edge: r.edge, n, agree, odds, ev: odds ? p * odds - 1 : null,
      score: p - (model == null ? NO_MODEL_PENALTY : 0) - (agree === false ? 0.05 : 0) - (n < MIN_SAMPLE || small ? SMALL_PENALTY : 0), small: n < MIN_SAMPLE || small });
  }
  if (pr) {
    const hn = m.home.name, an = m.away.name, n = Math.min(pr.games.h, pr.games.a);
    for (const [id, label, p, key] of [['1', `Gana ${hn}`, pr.p1, '1'], ['2', `Gana ${an}`, pr.p2, '2'], ['dc1X', `${hn} o empate (1X)`, pr.dc['1X'], null], ['dcX2', `${an} o empate (X2)`, pr.dc['X2'], null]]) {
      const ov = key && ODDS_OF[key], odds = ov ? ov(o) : null;
      out.push({ id, label, p, trend: null, model: p, edge: null, n, agree: null, odds, ev: odds ? p * odds - 1 : null, score: p - 0.02 - (n < MIN_SAMPLE || small ? SMALL_PENALTY : 0), small: n < MIN_SAMPLE || small, modelOnly: true });
    }
  }
  return out;
}

// Elige hasta 2 favoritos DISTINTOS: (1) el más probable con respaldo y (2) el que más supera a la media de la liga con prob. razonable.
// Se evitan mercados casi idénticos entre sí (p. ej. más de 1,5 y más de 2,5 a la vez) y los poco fiables.
const FAMILY = id => /^(ft_o|ft_u)/.test(id) ? 'goles' : /^(btts|nobtts)$/.test(id) ? 'btts' : /^ht_|^h2_/.test(id) ? 'parte' : /^co_/.test(id) ? 'corners' : /^ca_/.test(id) ? 'tarjetas' : /^(1|2|dc)/.test(id) ? 'resultado' : id;
// Mercados con cuota justa < 1,25 (prob. > 80%) no se proponen: pagan casi nada y cualquier fallo del modelo se come el valor.
const MAX_P = 0.8;

export function pickFavorites(cands) {
  // Con muestra pequeña se exige más probabilidad (60%) y la confianza sale 'baja'; con menos de 3 partidos no se propone.
  const ok = cands.filter(c => c.n >= HARD_MIN && c.agree !== false && c.p >= (c.small ? 0.6 : 0.55) && c.p <= MAX_P);
  const first = [...ok].sort((a, b) => b.score - a.score)[0];
  if (!first) return [];
  const second = [...ok].filter(c => c.id !== first.id && FAMILY(c.id) !== FAMILY(first.id) && c.edge != null && c.edge > 0)
    .sort((a, b) => (b.edge + (b.score - 0.5) * 0.5) - (a.edge + (a.score - 0.5) * 0.5))[0];
  const conf = c => c.small ? 'baja' : c.agree === true && c.n >= 8 ? 'alta' : 'media';
  const out = [{ ...first, role: 'Más probable', conf: conf(first) }];
  if (second) out.push({ ...second, role: 'Mayor ventaja sobre la liga', conf: conf(second) });
  return out;
}

export function insight({ train, m, tr, pr, bt, standings }) {
  const hn = m.home.name, an = m.away.name, lines = [], flags = [];
  const fh = recent(train, m.home.id), fa = recent(train, m.away.id);
  const rh = restDays(train, m.home.id, m.kickoff), ra = restDays(train, m.away.id, m.kickoff);
  const lgAvg = leagueGoalsAvg(train);

  // Cómo se espera el partido
  let tempo = null, winner = null;
  if (pr) {
    const t = pr.xg.h + pr.xg.a, ratio = lgAvg ? t / lgAvg : null;
    tempo = ratio == null ? 'equilibrado' : ratio >= 1.15 ? 'abierto' : ratio <= 0.88 ? 'cerrado' : 'normal';
    const [fav, pf, rival] = pr.p1 >= pr.p2 ? [hn, pr.p1, an] : [an, pr.p2, hn];
    winner = pf >= 0.55 ? { t: 'claro', name: fav, p: pf } : pf >= 0.42 ? { t: 'ligero', name: fav, p: pf } : { t: 'igualado', name: null, p: pf };
    const goals = `Se esperan ${num(t)} goles (${num(pr.xg.h)} – ${num(pr.xg.a)})${lgAvg ? ` frente a ${num(lgAvg)} de media en la liga` : ''}: partido ${tempo}.`;
    const who = winner.t === 'claro' ? `${winner.name} parte como claro favorito (${pct(winner.p)}).` : winner.t === 'ligero' ? `Ligera ventaja de ${winner.name} (${pct(winner.p)}), con ${pct(pr.pX)} de empate.` : `Partido igualado: ${pct(pr.p1)} / ${pct(pr.pX)} / ${pct(pr.p2)}.`;
    lines.push(`${who} ${goals}`);
  }

  // Forma, clasificación y descanso
  const formTxt = (name, f) => f.length ? `${name}: ${f.map(x => x.r).join('')} (${pts(f)} pts en ${f.length}, ${f.reduce((s, x) => s + x.gf, 0)}-${f.reduce((s, x) => s + x.ga, 0)} en goles)` : null;
  const fts = [formTxt(hn, fh), formTxt(an, fa)].filter(Boolean);
  if (fts.length) lines.push('Forma reciente → ' + fts.join(' · ') + '.');
  if (fh.length >= 3 && fa.length >= 3 && Math.abs(pts(fh) / fh.length - pts(fa) / fa.length) >= 1) {
    const hb = pts(fh) / fh.length > pts(fa) / fa.length;
    flags.push(`${hb ? hn : an} llega en mejor momento que ${hb ? an : hn}.`);
  }
  if (standings?.length) {
    const ph = standings.find(r => r.team.id === m.home.id), pa = standings.find(r => r.team.id === m.away.id);
    if (ph && pa && ph.pj && pa.pj) lines.push(`Clasificación → ${hn} ${ph.pos}º (${ph.pts} pts) · ${an} ${pa.pos}º (${pa.pts} pts).`);
  }
  for (const [n, d] of [[hn, rh], [an, ra]]) if (d != null && d <= 3) flags.push(`${n} juega con solo ${d} días de descanso: posible fatiga.`);
  // Un parón muy largo en la liga no es "descanso": puede ser un partido aplazado o competición europea que la fuente no recoge.
  for (const [n, d] of [[hn, rh], [an, ra]]) if (d != null && d > 14) flags.push(`${n} lleva ${d} días sin jugar en la liga (¿aplazado o competición europea?): el descanso no se interpreta como ventaja.`);
  if (rh != null && ra != null && rh <= 14 && ra <= 14 && Math.abs(rh - ra) >= 3 && rh > 3 && ra > 3) flags.push(`${rh > ra ? hn : an} tiene ${Math.abs(rh - ra)} días más de descanso que su rival.`);
  const meet = h2h(train, m.home.id, m.away.id);
  if (meet.length) flags.push('Ya se enfrentaron esta temporada: ' + meet.map(x => `${x.home.name} ${x.score.h}-${x.score.a} ${x.away.name}`).join(', ') + '.');

  // Mercado más indicado según los patrones
  const cands = candidates(tr, pr, m), favs = pickFavorites(cands);
  const topTrend = [...(tr?.game ?? [])].filter(r => Math.min(r.h.n, r.a.n) >= MIN_SAMPLE).sort((a, b) => b.edge - a.edge)[0];
  const caveats = [];
  if (!tr || !tr.n.h || !tr.n.a) caveats.push('Sin tendencias: algún equipo no tiene partidos previos en esa condición.');
  else if (Math.min(tr.n.h, tr.n.a) < MIN_SAMPLE) caveats.push('Muestra pequeña (menos de 5 partidos de algún equipo en esa condición): los favoritos llevan confianza baja y se exige más probabilidad.');
  if (bt && !bt.beatsBase) caveats.push('En esta muestra el modelo no mejora a la base ingenua en 1X2: usa los porcentajes con cautela.');
  const disagree = cands.filter(c => c.agree === false && c.p >= 0.55).length;
  if (disagree) caveats.push(`En ${disagree} mercado${disagree > 1 ? 's' : ''} la tendencia y el modelo no coinciden: se descartan como favoritos.`);
  caveats.push('Lesiones, sanciones y alineaciones: la fuente de datos no las incluye. Revísalas (Flashscore, web del club) antes de decidir.');

  return { tempo, winner, lines, flags, favorites: favs, topTrend: topTrend ? { label: topTrend.label, avg: topTrend.avg, edge: topTrend.edge } : null, caveats };
}
