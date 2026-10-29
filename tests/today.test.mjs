// Ejecutar: node --test tests/today.test.mjs
// Semáforo «Hoy», selección sugerida (mercado como base) y cuota de cierre (CLV).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { options, rate, sortRated, PICK_MIN, PICK_MAX } from '../js/model/today.js';
import { closingFor, clvOf, summarizeClv } from '../js/model/bets.js';
import { markets } from '../js/model/poisson.js';
import { analyze } from '../js/model/analyze.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);
const mkPr = (p1, pX, p2, o25 = 0.5, g = [10, 10]) => ({ p1, pX, p2, dc: { '1X': p1 + pX, X2: pX + p2, '12': p1 + p2 }, over: { '2.5': o25 }, under: { '2.5': 1 - o25 }, games: { h: g[0], a: g[1] } });
const match = odds => ({ home: { name: 'A' }, away: { name: 'B' }, odds });
// Cuotas que dan EXACTAMENTE estas probabilidades con un margen del 5 % (cuota = 1/(p·1,05)).
const odd3 = (a, b, c) => [1 / (a * 1.05), 1 / (b * 1.05), 1 / (c * 1.05)];

test('rate: verde: selección de mercado entre 55 % y 85 % confirmada por el modelo; la doble oportunidad no cuenta', () => {
  const r = rate(mkPr(0.66, 0.2, 0.14), match({ b365: odd3(0.68, 0.19, 0.13) }));
  assert.equal(r.light, 'green'); assert.equal(r.pick.key, '1'); near(r.pick.mk, 0.68);
  assert.ok(r.pick.mk >= PICK_MIN && r.pick.mk <= PICK_MAX);
});
test('rate: rojo si modelo y mercado discrepan ≥ 12 puntos (caso Venezia–Inter), muestra pequeña o sin modelo', () => {
  const r = rate(mkPr(0.06, 0.11, 0.83), match({ b365: odd3(0.11, 0.19, 0.70) }));
  assert.equal(r.light, 'red'); assert.equal(r.pick, null); assert.match(r.reason, /no coinciden/);
  assert.equal(rate(mkPr(0.66, 0.2, 0.14, 0.5, [4, 12]), match({ b365: odd3(0.68, 0.19, 0.13) })).light, 'red');
  assert.equal(rate(null, match(null)).light, 'red');
  const g = rate(mkPr(0.4, 0.3, 0.3, 0.8), match({ b365: odd3(0.4, 0.3, 0.3), ou25: [1 / (0.55 * 1.05), 1 / (0.45 * 1.05)] }));
  assert.equal(g.light, 'red'); assert.match(g.reason, /goles/);        // más de 2,5: modelo 80 % vs mercado 55 %
});
test('rate: amarillo sin cuotas, con diferencia pequeña o con partido parejo', () => {
  assert.equal(rate(mkPr(0.5, 0.25, 0.25), match(null)).light, 'yellow');
  assert.equal(rate(mkPr(0.5, 0.25, 0.25), match({ ou25: [1.9, 1.9] })).light, 'yellow');
  const medio = rate(mkPr(0.66, 0.2, 0.14), match({ b365: odd3(0.57, 0.24, 0.19) }));      // 9 puntos
  assert.equal(medio.light, 'yellow'); assert.equal(medio.level, 'medio');
  const parejo = rate(mkPr(0.36, 0.3, 0.34, 0.5), match({ b365: odd3(0.36, 0.30, 0.34) }));
  assert.equal(parejo.light, 'yellow'); assert.match(parejo.reason, /parejo/);
});
test('options: probabilidades de mercado sin margen y dobles oportunidades suman bien', () => {
  const o = options(mkPr(0.5, 0.3, 0.2, 0.6), { b365: odd3(0.5, 0.3, 0.2), ou25: [1 / (0.6 * 1.05), 1 / (0.4 * 1.05)] }, 'A', 'B'), g = k => o.find(x => x.key === k);
  near(g('1').mk, 0.5, 1e-6); near(g('1X').mk, 0.8, 1e-6); near(g('X2').mk, 0.5, 1e-6); near(g('o25').mk, 0.6, 1e-6); near(g('1X').md, 0.8);
  assert.equal(o.length, 6); assert.equal(options(mkPr(0.5, 0.3, 0.2), null, 'A', 'B').length, 0);
});
test('sortRated: verde, amarillo, rojo y por hora', () => {
  const it = (l, k) => ({ m: { kickoff: k }, r: { light: l } });
  assert.deepEqual(sortRated([it('red', '1'), it('green', '3'), it('yellow', '2'), it('green', '1')]).map(x => x.r.light + x.m.kickoff), ['green1', 'green3', 'yellow2', 'red1']);
});

// ---------- cuota de cierre ----------
const bet = (o = {}) => ({ id: 'b', mid: 'E0-x', l: 'E0', k: '2026-11-01T15:00:00.000Z', h: { id: 'a', name: 'A' }, a: { id: 'b', name: 'B' }, key: '1', label: 'A', odds: 2.2, stake: 1, p: 0.5, t: '2026-10-30T10:00:00.000Z', ...o });
const rec = (o = {}) => ({ id: 'E0-x', k: '2026-11-01T15:00:00.000Z', h: { id: 'a' }, a: { id: 'b' }, t: '2026-11-01T12:00:00.000Z', od: { b365: [2.0, 3.4, 4], ou25: [1.8, 2.0] }, ...o });
const AFTER = Date.parse('2026-11-02T00:00:00Z'), BEFORE = Date.parse('2026-10-31T00:00:00Z');
test('closingFor y CLV: cuota/cierre − 1, solo después del inicio y solo mercados con cuota', () => {
  const c = closingFor(bet(), [rec()], AFTER); assert.equal(c.odds, 2.0); near(clvOf(bet(), c), 0.1);
  near(clvOf(bet({ key: 'o25', odds: 1.62 }), closingFor(bet({ key: 'o25' }), [rec()], AFTER)), -0.1);
  assert.equal(closingFor(bet({ key: '2' }), [rec()], AFTER).odds, 4);
  assert.equal(closingFor(bet(), [rec()], BEFORE), null);               // aún no ha empezado: la cuota se mueve
  assert.equal(closingFor(bet({ key: '1X' }), [rec()], AFTER), null);   // la fuente no trae cuota de doble oportunidad
  assert.equal(closingFor(bet(), [rec({ od: null })], AFTER), null);
  assert.equal(closingFor(bet(), null, AFTER), null);
  assert.equal(clvOf(bet(), null), null);
  // el id cambió (hora distinta): se encuentra por equipos y fecha ±4 días
  assert.equal(closingFor(bet({ mid: 'otro' }), [rec({ id: 'distinto', k: '2026-11-02T15:00:00.000Z' })], Date.parse('2026-11-05T00:00:00Z')).odds, 2.0);
  assert.equal(closingFor(bet({ mid: 'otro' }), [rec({ id: 'distinto', k: '2026-11-20T15:00:00.000Z' })], Date.parse('2026-12-01T00:00:00Z')), null);
});
test('summarizeClv: media y recuento', () => {
  const bets = [bet(), bet({ id: 'c', key: '2', odds: 3.6 }), bet({ id: 'd', key: '1X' })];
  const s = summarizeClv(bets, [rec()], AFTER);
  assert.equal(s.n, 2); assert.equal(s.of, 3); near(s.mean, (0.1 + (3.6 / 4 - 1)) / 2); assert.deepEqual([s.better, s.worse], [1, 1]);
  assert.deepEqual(summarizeClv([], [rec()], AFTER), { n: 0, of: 0, mean: null, better: 0, worse: 0 });
});

// ---------- con datos reales ----------
test('datos reales: el semáforo se calcula para todos los próximos partidos con cuotas sin romperse', () => {
  const dir = new URL('../data/', import.meta.url);
  let n = 0, green = 0, red = 0;
  for (const f of readdirSync(dir).filter(x => /^[A-Z0-9]+\.json$/.test(x))) {
    const lg = JSON.parse(readFileSync(new URL(f, dir))), prev = (() => { try { return JSON.parse(readFileSync(new URL('prev/' + f, dir))).matches; } catch { return []; } })();
    for (const m of lg.matches.filter(x => x.status === 'NS' && x.odds && x.odds.b365)) {
      const a = analyze({ m, all: lg.matches, prevAll: prev, teams: lg.teams, withBacktest: false, withStandings: false }), r = rate(a.pr, m);
      assert.ok(['green', 'yellow', 'red'].includes(r.light) && r.reason); n++;
      if (r.light === 'green') { green++; assert.ok(r.pick.mk >= PICK_MIN && r.pick.mk <= PICK_MAX && Math.abs(r.pick.md - r.pick.mk) < 0.08); }
      if (r.light === 'red') red++;
    }
  }
  console.log(`# ${n} partidos con cuotas: ${green} verdes, ${red} rojos`);
});
