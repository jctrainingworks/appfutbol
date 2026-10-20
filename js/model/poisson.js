// Modelo Poisson independiente con fuerzas de ataque/defensa suavizadas. Funciones puras y reproducibles.
//
// Supuestos (conocidos y limitados):
//  - Goles de local y visitante ~ Poisson independientes (no corrige el exceso de 0-0/1-1 como Dixon-Coles).
//  - lambda_local  = mediaLocal  * ataque[local]  * defensa[visitante]
//    lambda_visit. = mediaVisit. * ataque[visit.] * defensa[local]
//  - ataque/defensa = (goles + K * media) / (partidos + K) / media: encoge hacia la media de la liga con K partidos "virtuales".
//  - Sin ponderar por antigüedad, lesiones, motivación ni calidad del rival (los partidos previos se tratan por igual).
// Las salidas son ESTIMACIONES del modelo, no certezas.

export const DEFAULTS = { K: 4, maxGoals: 10, minGames: 3 };

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const finished = ms => ms.filter(m => m.status === 'FT' && m.score);

export function fit(matches, opts = {}) {
  const { K } = { ...DEFAULTS, ...opts }, done = finished(matches);
  if (!done.length) return null;
  const avgH = mean(done.map(m => m.score.h)), avgA = mean(done.map(m => m.score.a)), avg = (avgH + avgA) / 2;
  if (avg <= 0) return null;
  const t = new Map();
  const get = id => t.get(id) || t.set(id, { n: 0, gf: 0, ga: 0 }).get(id);
  for (const m of done) {
    const h = get(m.home.id), a = get(m.away.id);
    h.n++; h.gf += m.score.h; h.ga += m.score.a;
    a.n++; a.gf += m.score.a; a.ga += m.score.h;
  }
  const teams = {};
  for (const [id, x] of t) teams[id] = { n: x.n, att: (x.gf + K * avg) / (x.n + K) / avg, def: (x.ga + K * avg) / (x.n + K) / avg };
  return { avgH, avgA, n: done.length, teams };
}

export const lambdas = (model, homeId, awayId) => {
  const h = model.teams[homeId], a = model.teams[awayId];
  if (!h || !a) return null;
  return { h: model.avgH * h.att * a.def, a: model.avgA * a.att * h.def, nH: h.n, nA: a.n };
};

function pmf(l, max) {
  const p = [Math.exp(-l)];
  for (let k = 1; k <= max; k++) p.push(p[k - 1] * l / k);
  return p;
}

// Probabilidades de todos los mercados a partir de las dos lambdas. La matriz se renormaliza (la cola >maxGoals es despreciable).
export function markets(lh, la, maxGoals = DEFAULTS.maxGoals) {
  const ph = pmf(lh, maxGoals), pa = pmf(la, maxGoals);
  let tot = 0, home = 0, draw = 0, away = 0, btts = 0;
  const ou = { 1.5: 0, 2.5: 0, 3.5: 0 }, scores = [];
  for (let i = 0; i <= maxGoals; i++) for (let j = 0; j <= maxGoals; j++) {
    const p = ph[i] * pa[j]; tot += p;
    if (i > j) home += p; else if (i === j) draw += p; else away += p;
    if (i > 0 && j > 0) btts += p;
    for (const L of Object.keys(ou)) if (i + j > L) ou[L] += p;
    scores.push({ h: i, a: j, p });
  }
  const n = x => x / tot;
  scores.sort((x, y) => y.p - x.p);
  return {
    xg: { h: lh, a: la },
    p1: n(home), pX: n(draw), p2: n(away),
    dc: { '1X': n(home + draw), '12': n(home + away), 'X2': n(draw + away) },
    over: Object.fromEntries(Object.entries(ou).map(([L, v]) => [L, n(v)])),
    under: Object.fromEntries(Object.entries(ou).map(([L, v]) => [L, 1 - n(v)])),
    btts: { si: n(btts), no: 1 - n(btts) },
    top: scores.slice(0, 5).map(s => ({ h: s.h, a: s.a, p: n(s.p) })),
  };
}

export function predict(model, homeId, awayId) {
  const l = model && lambdas(model, homeId, awayId);
  return l ? { ...markets(l.h, l.a), games: { h: l.nH, a: l.nA }, trainMatches: model.n } : null;
}

export const fairOdds = p => p > 0 ? 1 / p : Infinity;
// Valor esperado teórico por unidad apostada: p*cuota - 1. Solo es tan fiable como p.
export const expectedValue = (p, odds) => p * odds - 1;

// Backtest walk-forward: cada partido se predice solo con los anteriores (sin fuga de información).
// Compara Brier y log-loss 1X2 contra una base ingenua (frecuencias H/D/A observadas hasta ese momento).
export function backtest(matches, opts = {}) {
  const { minGames } = { ...DEFAULTS, ...opts };
  const done = finished(matches).sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);
  const acc = { n: 0, brier: 0, logloss: 0, baseBrier: 0, baseLogloss: 0, hits: 0, ou25: { n: 0, brier: 0, base: 0 } };
  for (let i = 0; i < done.length; i++) {
    const m = done[i], prior = done.slice(0, i), y = m.score.h > m.score.a ? 0 : m.score.h === m.score.a ? 1 : 2;
    const over = m.score.h + m.score.a > 2.5 ? 1 : 0;
    const model = fit(prior, opts), l = model && lambdas(model, m.home.id, m.away.id);
    if (l && l.nH >= minGames && l.nA >= minGames) {
      const q = markets(l.h, l.a), p = [q.p1, q.pX, q.p2];
      const base = [0, 1, 2].map(k => prior.filter(x => (x.score.h > x.score.a ? 0 : x.score.h === x.score.a ? 1 : 2) === k).length / prior.length);
      const br = v => v.reduce((s, pk, k) => s + (pk - (k === y ? 1 : 0)) ** 2, 0);
      acc.n++; acc.brier += br(p); acc.baseBrier += br(base);
      acc.logloss -= Math.log(Math.max(p[y], 1e-12)); acc.baseLogloss -= Math.log(Math.max(base[y], 1e-12));
      acc.hits += p.indexOf(Math.max(...p)) === y ? 1 : 0;
      const b25 = prior.filter(x => x.score.h + x.score.a > 2.5).length / prior.length;
      acc.ou25.n++; acc.ou25.brier += (q.over['2.5'] - over) ** 2; acc.ou25.base += (b25 - over) ** 2;
    }
  }
  if (!acc.n) return null;
  const n = acc.n;
  return {
    n, hitRate: acc.hits / n,
    brier: acc.brier / n, baseBrier: acc.baseBrier / n,
    logloss: acc.logloss / n, baseLogloss: acc.baseLogloss / n,
    ou25: { n: acc.ou25.n, brier: acc.ou25.brier / acc.ou25.n, baseBrier: acc.ou25.base / acc.ou25.n },
    beatsBase: acc.brier < acc.baseBrier,
  };
}
