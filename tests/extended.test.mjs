// Ejecutar: node --test tests/extended.test.mjs
// Análisis ampliado: más mercados del modelo (extras), contraste con el mercado y perfil de los equipos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { extras, HANDICAPS } from '../js/model/extras.js';
import { markets, fit, lambdas } from '../js/model/poisson.js';
import { compareMarket, DISAGREE } from '../js/model/market.js';
import { view, profile, teamGames, leagueGames, strengths, recentWithOpponents, venueTable, load, headToHead, METRICS } from '../js/model/profile.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const T = (id) => ({ id, name: id });

// ---------- extras: coherencia con markets() y con un cálculo directo ----------
test('extras: todo suma 1 y coincide con markets()', () => {
  for (const [lh, la] of [[1.4, 1.1], [2.3, 0.6], [0.9, 0.9], [1.0, 2.8]]) {
    const e = extras(lh, la), m = markets(lh, la);
    near(e.total.reduce((a, b) => a + b, 0), 1);
    near(e.margin.h1 + e.margin.h2 + e.margin.h3 + e.margin.draw + e.margin.a1 + e.margin.a2 + e.margin.a3, 1);
    near(e.margin.h1 + e.margin.h2 + e.margin.h3, m.p1); near(e.margin.draw, m.pX); near(e.margin.a1 + e.margin.a2 + e.margin.a3, m.p2);
    for (const L of [1.5, 2.5, 3.5]) { near(e.lines[L].over, m.over[L]); near(e.lines[L].under, m.under[L]); }
    for (const L of Object.keys(e.lines)) near(e.lines[L].over + e.lines[L].under, 1);   // líneas con .5: no hay devolución
    near(e.team.h[0.5], 1 - e.cleanSheet.a); near(e.team.a[0.5], 1 - e.cleanSheet.h);
    near(m.btts.si, 1 - e.cleanSheet.h - e.cleanSheet.a + extrasBothZero(lh, la), 1e-4);        // P(btts) = 1 − P(h=0) − P(a=0) + P(0-0)
    assert.ok(e.inGrid > 0.9 && e.inGrid <= 1);
    near(e.matrix.flat().reduce((a, b) => a + b, 0), e.inGrid);
    const byLine = Object.fromEntries(e.handicaps.map(h => [h.line, h]));
    near(byLine[-0.5].win, m.p1); near(byLine[0.5].win, m.dc['1X']); near(byLine[0.5].lose, m.p2);
    for (const h of e.handicaps) near(h.win + h.push + h.lose, 1);
    near(byLine[-1].push, e.margin.h1); near(byLine[-1].win, e.margin.h2 + e.margin.h3);
    near(byLine[1].push, e.margin.a1); near(byLine[1].lose, e.margin.a2 + e.margin.a3);
    for (const h of e.handicaps) if (h.win > 0) near(h.win * (h.fair - 1) - h.lose, 0, 1e-9);   // cuota justa: valor esperado cero
  }
  assert.equal(HANDICAPS.length, 6);
});
function extrasBothZero(lh, la) { return Math.exp(-lh) * Math.exp(-la); }          // P(0-0) para Poisson independientes, sin usar extras()
test('extras: cálculo directo independiente y simetría', () => {
  const lh = 1.7, la = 0.8, fact = n => n <= 1 ? 1 : n * fact(n - 1), pois = (l, k) => Math.exp(-l) * l ** k / fact(k);
  const e = extras(lh, la);
  let tot = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) tot += pois(lh, i) * pois(la, j);
  let h2 = 0, g3 = 0, wn = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = pois(lh, i) * pois(la, j) / tot; if (i >= 2) h2 += p; if (i + j === 3) g3 += p; if (i > 0 && j === 0) wn += p; }
  near(e.team.h[1.5], h2); near(e.total[3], g3); near(e.winToNil.h, wn);
  const s = extras(1.3, 1.3);
  near(s.cleanSheet.h, s.cleanSheet.a); near(s.margin.h1, s.margin.a1); near(s.team.h[1.5], s.team.a[1.5]);
  for (let i = 0; i <= 5; i++) for (let j = 0; j <= 5; j++) near(s.matrix[i][j], s.matrix[j][i]);
});

// ---------- contraste con el mercado ----------
test('compareMarket: diferencias, nivel de aviso y datos que faltan', () => {
  const pr = { p1: 0.337, pX: 0.246, p2: 0.417, over: { 2.5: 0.55 }, under: { 2.5: 0.45 } };
  const c = compareMarket(pr, { b365: [2.1, 3.6, 3.4], ou25: [1.53, 2.5] });
  const q = [1 / 2.1, 1 / 3.6, 1 / 3.4], s = q.reduce((a, b) => a + b, 0);
  near(c.x12.market[0], q[0] / s); near(c.x12.diff[2], 0.417 - q[2] / s);
  assert.equal(c.x12.idx, 2); assert.equal(c.level, 'alto'); assert.ok(c.x12.maxAbs >= DISAGREE);
  assert.deepEqual([c.x12.modelTop, c.x12.marketTop], [2, 0]);            // el modelo y el mercado eligen favorito distinto
  near(c.x12.margin, s - 1);
  near(c.ou.market[0], (1 / 1.53) / (1 / 1.53 + 1 / 2.5)); near(c.ou.diff[0], 0.55 - c.ou.market[0]);
  assert.ok(compareMarket(pr, { b365: [2.4, 3.3, 3.0] }).level);
  const near1 = compareMarket({ p1: 0.40, pX: 0.27, p2: 0.33, over: { 2.5: 0.5 }, under: { 2.5: 0.5 } }, { b365: [2.4, 3.5, 3.1] });
  assert.equal(near1.level, 'ok');
  const mid = compareMarket({ p1: 0.50, pX: 0.25, p2: 0.25, over: { 2.5: 0.5 }, under: { 2.5: 0.5 } }, { b365: [2.4, 3.5, 3.1] });
  assert.equal(mid.level, 'medio');
  assert.deepEqual(compareMarket(pr, null), { x12: null, ou: null, level: null, tops: null });
  assert.equal(compareMarket(pr, { b365: [2, 3] }).x12, null);            // cuotas incompletas: no se compara
  assert.equal(compareMarket(pr, { b365: [2, 3, 0.9] }).x12, null);
  assert.equal(compareMarket(pr, { ou25: [1.9, 1.9] }).level, null);      // solo más/menos 2,5: hay comparación de goles pero no nivel de 1X2
});

// ---------- perfil ----------
const m1 = { id: 'a', status: 'FT', kickoff: '2026-09-01T15:00:00.000Z', home: T('A'), away: T('B'), score: { h: 2, a: 1, ht: { h: 1, a: 0 } }, st: { shots: [14, 8], sot: [6, 3], corners: [7, 2], fouls: [10, 12], yellow: [1, 3], red: [0, 1] } };
const m2 = { id: 'b', status: 'FT', kickoff: '2026-09-08T15:00:00.000Z', home: T('C'), away: T('A'), score: { h: 0, a: 0, ht: { h: 0, a: 0 } }, st: { shots: [10, 12], sot: [2, 4], corners: [5, 6], fouls: [11, 9], yellow: [2, 1], red: [0, 0] } };
const m3 = { id: 'c', status: 'FT', kickoff: '2026-09-15T15:00:00.000Z', home: T('A'), away: T('D'), score: { h: 1, a: 3, ht: null } };
test('view y profile: cálculo a mano con datos que faltan', () => {
  const v = view(m1, true), w = view(m1, false);
  assert.deepEqual([v.gf, v.ga, v.sf, v.sa, v.cf, v.ca, v.yf, v.rf, v.fl, v.hf, v.ha], [2, 1, 14, 8, 7, 2, 1, 0, 10, 1, 0]);
  assert.deepEqual([w.gf, w.ga, w.sf, w.sa, w.yf, w.rf, w.hf, w.ha], [1, 2, 8, 14, 3, 1, 0, 1]);
  const v3 = view(m3, true); assert.deepEqual([v3.sf, v3.cf, v3.hf, v3.yf], [null, null, null, null]);   // la fuente no trae esos datos
  const gs = [view(m1, true), view(m2, false), view(m3, true)], p = profile(gs);   // equipo A: 2-1 (casa), 0-0 (fuera), 1-3 (casa)
  near(p.ppg.v, (3 + 1 + 0) / 3); assert.equal(p.ppg.n, 3);
  near(p.win.v, 1 / 3); near(p.gf.v, 1); near(p.ga.v, 4 / 3);
  near(p.cs.v, 1 / 3); near(p.fts.v, 1 / 3); near(p.btts.v, 2 / 3); near(p.o25.v, 2 / 3);
  near(p.sf.v, (14 + 12) / 2); assert.equal(p.sf.n, 2);                               // m3 sin remates: no cuenta (no es 0)
  near(p.tf.v, (6 + 4) / 2); near(p.ta.v, (3 + 2) / 2);
  near(p.conv.v, (2 + 0) / (6 + 4)); assert.equal(p.conv.n, 2);                       // goles / remates a puerta solo con datos
  near(p.sv.v, ((3 - 1) + (2 - 0)) / (3 + 2));
  near(p.cf.v, (7 + 6) / 2); near(p.fl.v, (10 + 9) / 2); near(p.yf.v, (1 + 1) / 2); near(p.rf.v, 0);
  near(p.hf.v, 0.5); near(p.ha.v, 0); assert.equal(p.hf.n, 2);
  near(p.h2f.v, ((2 - 1) + 0) / 2); near(p.h2a.v, ((1 - 0) + 0) / 2); near(p.htw.v, 0.5);
  const e = profile([]); assert.ok(METRICS.every(mt => e[mt.id].v === null && e[mt.id].n === 0));
});
test('teamGames y leagueGames', () => {
  const all = [m1, m2, m3, { id: 'x', status: 'NS', kickoff: '2026-10-01T15:00:00.000Z', home: T('A'), away: T('B') }];
  assert.equal(teamGames(all, 'A', 'all').length, 3); assert.equal(teamGames(all, 'A', 'home').length, 2); assert.equal(teamGames(all, 'A', 'away').length, 1);
  assert.deepEqual(teamGames(all, 'A', 'all', 2).map(g => g.id), ['b', 'c']);
  assert.equal(teamGames(all, 'A', 'home').every(g => g.home), true);
  assert.equal(leagueGames(all, 'home').length, 3); near(profile(leagueGames(all, 'home')).gf.v, (2 + 0 + 1) / 3); near(profile(leagueGames(all, 'away')).gf.v, (1 + 0 + 3) / 3);
});

function league() {
  const ms = [], names = ['A', 'B', 'C', 'D', 'E', 'F'];
  let d = 0;
  for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
    if (i === j || (i + j + r) % 3) continue;
    d++; ms.push({ id: `L${d}`, leagueId: 'L', status: 'FT', kickoff: new Date(Date.UTC(2026, 7, 10 + d * 2)).toISOString(), home: T(names[i]), away: T(names[j]),
      score: { h: (i * 2 + d) % 4 + (i === 0 ? 1 : 0), a: (j + d) % 3 }, st: {} });
  }
  return ms;
}
test('fuerza y rivales recientes: ranking del modelo y puntos esperados', () => {
  const ms = league(), model = fit(ms), st = strengths(model);
  assert.equal(st.n, 6); near(Object.values(st.rank).sort().join(''), Number(['1', '2', '3', '4', '5', '6'].join('')));
  const best = Object.keys(st.rank).find(k => st.rank[k] === 1);
  for (const id of Object.keys(st.s)) assert.ok(st.s[best] >= st.s[id]);
  near(st.s.A, model.teams.A.att / model.teams.A.def);
  const r = recentWithOpponents(ms, 'A', model, 5);
  assert.equal(r.rows.length, 5);
  r.rows.forEach(g => {
    const l = lambdas(model, g.home ? 'A' : g.opp.id, g.home ? g.opp.id : 'A'), q = markets(l.h, l.a);
    near(g.expPts, g.home ? 3 * q.p1 + q.pX : 3 * q.p2 + q.pX);
    assert.equal(g.pts, g.gf > g.ga ? 3 : g.gf === g.ga ? 1 : 0);
    assert.equal(g.tier, g.rank <= 2 ? 'fuerte' : g.rank <= 4 ? 'medio' : 'débil');
  });
  near(r.pts, r.rows.reduce((a, g) => a + g.pts, 0)); near(r.expPts, r.rows.reduce((a, g) => a + g.expPts, 0));
  near(r.avgRank, r.rows.reduce((a, g) => a + g.rank, 0) / 5);
  assert.equal(recentWithOpponents(ms, 'A', null, 5).expPts, null);
});
test('venueTable, load y headToHead', () => {
  const teams = ['A', 'B', 'C', 'D'].map(T);
  const ms = [
    { status: 'FT', kickoff: '2026-09-01T15:00:00.000Z', home: T('A'), away: T('B'), score: { h: 2, a: 0 } },
    { status: 'FT', kickoff: '2026-09-02T15:00:00.000Z', home: T('C'), away: T('A'), score: { h: 1, a: 1 } },
    { status: 'FT', kickoff: '2026-09-03T15:00:00.000Z', home: T('B'), away: T('C'), score: { h: 0, a: 3 } },
    { status: 'FT', kickoff: '2026-09-04T15:00:00.000Z', home: T('A'), away: T('D'), score: { h: 0, a: 1 } },
  ];
  const h = venueTable(ms, teams, 'home'), a = venueTable(ms, teams, 'away');
  // casa: A 2-0 y 0-1 → 3 pts en 2 (dg +1); C 1-1 → 1 pt; B 0-3 → 0; D sin partidos en casa
  assert.deepEqual(h.map(r => [r.team.id, r.pts, r.pj]), [['A', 3, 2], ['C', 1, 1], ['D', 0, 0], ['B', 0, 1]]);
  assert.deepEqual(a.map(r => [r.team.id, r.pts, r.pj]), [['C', 3, 1], ['D', 3, 1], ['A', 1, 1], ['B', 0, 1]]);   // C gana 3-0 (+3) y D 1-0 (+1): C primero
  assert.deepEqual(h.map(r => r.pos), [1, 2, 3, 4]);
  assert.deepEqual(load(ms, 'A', '2026-09-10T15:00:00.000Z'), { rest: 6, last14: 3, last30: 3 });
  assert.deepEqual(load(ms, 'A', '2026-09-20T15:00:00.000Z'), { rest: 16, last14: 0, last30: 3 });
  assert.deepEqual(load(ms, 'Z', '2026-09-20T15:00:00.000Z'), { rest: null, last14: 0, last30: 0 });
  const prev = [{ status: 'FT', kickoff: '2026-03-01T15:00:00.000Z', home: T('B'), away: T('A'), score: { h: 1, a: 1 } }, { status: 'FT', kickoff: '2025-12-01T15:00:00.000Z', home: T('A'), away: T('B'), score: { h: 3, a: 0 } }];
  const hh = headToHead(ms, prev, 'A', 'B');
  assert.deepEqual(hh.rows.map(r => r.kickoff.slice(0, 10)), ['2026-09-01', '2026-03-01', '2025-12-01']);   // más reciente primero
  assert.deepEqual([hh.n, hh.w, hh.d, hh.l], [3, 2, 1, 0]);                                               // desde el punto de vista de A (local hoy)
  near(hh.gf, (2 + 1 + 3) / 3); near(hh.ga, 1 / 3); near(hh.btts, 1 / 3); near(hh.o25, 1 / 3);
  assert.equal(headToHead(ms, prev, 'A', 'D').n, 1); assert.equal(headToHead(ms, [], 'C', 'D').n, 0);
});

// ---------- con datos reales ----------
const dir = new URL('../data/', import.meta.url);
const files = existsSync(dir) ? readdirSync(dir).filter(x => /^[A-Z0-9]+\.json$/.test(x)) : [];
test('datos reales: perfil, fuerza, tablas y extras sin valores raros', () => {
  assert.ok(files.length >= 10);
  for (const f of files) {
    const lg = JSON.parse(readFileSync(new URL(f, dir))), fin = lg.matches.filter(m => m.status === 'FT' && m.score);
    if (fin.length < 30) continue;
    const model = fit(fin), st = strengths(model), teams = lg.teams;
    assert.equal(new Set(Object.values(st.rank)).size, st.n, `${f}: puestos de fuerza repetidos`);
    for (const t of teams.slice(0, 4)) {
      for (const venue of ['home', 'away', 'all']) {
        const p = profile(teamGames(fin, t.id, venue));
        for (const mt of METRICS) { const x = p[mt.id]; assert.ok(x.v === null || (Number.isFinite(x.v) && x.v >= 0), `${f} ${t.id} ${mt.id}`); if (mt.pct && x.v != null) assert.ok(x.v <= 1 + 1e-9, `${f} ${t.id} ${mt.id} pct`); }
      }
    }
    for (const v of ['home', 'away']) { const tab = venueTable(fin, teams, v); assert.equal(tab.reduce((a, r) => a + r.pj, 0), fin.length, `${f}: la tabla ${v} no suma todos los partidos`); }
    const lp = profile(leagueGames(fin, 'home')); assert.ok(lp.gf.v > lp.ga.v * 0.8);   // la media de goles de los locales no es absurda
    const x = fin[fin.length - 1], l = lambdas(model, x.home.id, x.away.id), e = extras(l.h, l.a);
    assert.ok(e.inGrid > 0.7); near(e.total.reduce((a, b) => a + b, 0), 1);
  }
});
