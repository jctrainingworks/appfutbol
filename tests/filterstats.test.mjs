// Ejecutar: node --test tests/filterstats.test.mjs
// Medición de filtros: resultados de cada regla, resumen, registro en vivo y recálculo retrospectivo con datos reales.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ruleOutcome, oddsFor, summarize, logHits, sanitizeLog, forFilter, liveRows, sigOf, MAX_LOG } from '../js/model/filterstats.js';
import { exampleFilter, evalFilter, probOf, applyFilter } from '../js/model/filters.js';
import { analyze } from '../js/model/analyze.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);
const ft = (h, a, extra = {}) => ({ status: 'FT', score: { h, a, ht: { h: 0, a: 0 } }, ...extra });
const R = (src, mk, op = 'ge', v = 60) => ({ src, mk, op, v });

test('ruleOutcome: 1X2, doble oportunidad, goles y datos que faltan', () => {
  const T = { '2-0': ['1', '1X', '12', 'ft_o15', 'nobtts', 'ft_u25'], '1-1': ['X', '1X', 'X2', 'ft_o15', 'ft_u25', 'btts'], '0-3': ['2', 'X2', '12', 'ft_o15', 'ft_o25', 'nobtts'] };
  const ids = ['1', 'X', '2', '1X', 'X2', '12', 'ft_o15', 'ft_o25', 'ft_u25', 'btts', 'nobtts'];
  for (const [sc, yes] of Object.entries(T)) { const [h, a] = sc.split('-').map(Number); for (const id of ids) assert.equal(ruleOutcome(R('modelo', id), ft(h, a)), yes.includes(id), `${sc} ${id}`); }
  assert.equal(ruleOutcome(R('tend', 'co_o95'), ft(1, 0)), null);                      // sin datos de córners: no se inventa
  assert.equal(ruleOutcome(R('tend', 'ht_o05'), ft(1, 0)), false); assert.equal(ruleOutcome(R('modelo', '1'), { status: 'NS' }), null);
});
test('oddsFor', () => {
  const o = { b365: [2, 3, 4], ou25: [1.8, 2.1] };
  assert.deepEqual(['1', 'X', '2', 'ft_o25', 'ft_u25', 'ft_o15', '1X'].map(k => oddsFor(k, o)), [2, 3, 4, 1.8, 2.1, null, null]); assert.equal(oddsFor('1', null), null);
});
test('summarize: aciertos, esperado, z, tasa base, rentabilidad y acierto conjunto a mano', () => {
  const f = { rules: [R('modelo', 'ft_o15', 'ge', 80), R('modelo', 'ft_o25', 'ge', 60)] };
  const o = { ou25: [2.0, 1.8] };
  const matched = [
    { m: ft(2, 1), vals: [0.8, 0.6], odds: o },   // o15 sí, o25 sí
    { m: ft(1, 0), vals: [0.9, 0.7], odds: o },   // o15 no, o25 no
    { m: ft(3, 1), vals: [0.8, 0.6], odds: o },   // sí, sí
    { m: ft(1, 1), vals: [0.85, 0.65], odds: null }, // o15 sí, o25 no
  ];
  const s = summarize(f, matched, [...matched, { m: ft(0, 0) }]);
  const [a, b] = s.rules;
  assert.deepEqual([a.n, a.k], [4, 3]); near(a.exp, (0.8 + 0.9 + 0.8 + 0.85) / 4); near(a.z, (3 - 3.35) / Math.sqrt(0.16 + 0.09 + 0.16 + 0.1275));
  assert.deepEqual([b.n, b.k], [4, 2]); assert.equal(a.roi, null);                           // no hay cuota de +1,5
  assert.equal(b.roi.n, 3); near(b.roi.mean, 1 / 3);   // 3 partidos con cuota: +1, −1, +1
  near(a.base.rate, 3 / 5); near(b.base.rate, 2 / 5); assert.equal(a.base.n, 5);
  assert.deepEqual([s.joint.n, s.joint.k], [4, 2]);                                            // solo 2-1 y 3-1 cumplen las dos
  assert.equal(summarize({ rules: [R('modelo', 'ft_o15', 'ge'), R('modelo', 'ft_o25', 'le', 40)] }, matched).joint, null);   // una sola regla «al menos»: sin conjunto
  assert.equal(summarize(f, []).rules[0].rate, null);
  const miss = summarize({ rules: [R('tend', 'co_o95')] }, [{ m: ft(1, 0), vals: [0.5], odds: null }]); assert.equal(miss.rules[0].n, 0);
});

test('registro en vivo: solo partidos futuros, una vez por partido y firma del filtro', () => {
  const f = exampleFilter('f1'), now = Date.parse('2026-11-01T10:00:00Z');
  const hit = (id, k, odds = null) => ({ it: { m: { id, leagueId: 'E0', kickoff: k, home: { id: 'a', name: 'A' }, away: { id: 'b', name: 'B' }, odds } }, e: { vals: [{ p: 0.81234567 }, { p: null }] } });
  let r = logHits([], f, [hit('m1', '2026-11-02T15:00:00Z', { b365: [2, 3, 4] }), hit('m2', '2026-10-31T15:00:00Z')], now);
  assert.equal(r.added, 1); assert.deepEqual(r.log[0].p, [0.8123, null]); assert.deepEqual(r.log[0].od, { b365: [2, 3, 4], ou25: null });
  r = logHits(r.log, f, [hit('m1', '2026-11-02T15:00:00Z'), hit('m3', '2026-11-03T15:00:00Z')], now); assert.equal(r.added, 1); assert.equal(r.log.length, 2);   // m1 no se repite
  const g = { ...f, rules: [{ ...f.rules[0], v: 85 }, f.rules[1]] };                       // filtro editado: otra firma, serie nueva
  assert.notEqual(sigOf(f), sigOf(g)); assert.equal(forFilter(r.log, g).length, 0); assert.equal(forFilter(r.log, f).length, 2);
  assert.equal(logHits(r.log, g, [hit('m1', '2026-11-02T15:00:00Z')], now).added, 1);
  const big = Array.from({ length: MAX_LOG + 10 }, (_, i) => ({ f: 'x', s: 's', mid: 'm' + i, k: 'k', h: {}, a: {}, p: [] }));
  assert.equal(sanitizeLog(big).length, MAX_LOG); assert.deepEqual(sanitizeLog('x'), []); assert.deepEqual(sanitizeLog([null, { f: 1 }, { f: 'a', s: 's', mid: 'm', k: 'k', h: {}, a: {}, p: [] }]).length, 1);
});
test('liveRows: separa comprobados y pendientes', () => {
  const e = [{ mid: 'a', p: [0.8], od: null }, { mid: 'b', p: [0.7], od: null }, { mid: 'c', p: [0.6], od: null }];
  const res = new Map([['a', ft(1, 0)], ['b', { status: 'NS' }]]);
  const r = liveRows(e, res); assert.equal(r.rows.length, 1); assert.equal(r.pending, 2); assert.deepEqual(r.rows[0].vals, [0.8]);
});

test('datos reales: recálculo retrospectivo del filtro de ejemplo (sin mirar el futuro)', () => {
  const dir = new URL('../data/', import.meta.url), cut = Date.now() - 45 * 864e5, f = exampleFilter('e'), rows = [], matched = [];
  for (const x of readdirSync(dir).filter(y => /^[A-Z0-9]+\.json$/.test(y))) {
    const lg = JSON.parse(readFileSync(new URL(x, dir))), prev = (() => { try { return JSON.parse(readFileSync(new URL('prev/' + x, dir))).matches; } catch { return []; } })();
    for (const m of lg.matches.filter(y => y.status === 'FT' && y.score && Date.parse(y.kickoff) > cut)) {
      const a = analyze({ m, all: lg.matches, prevAll: prev, teams: lg.teams, withBacktest: false, withStandings: false }); if (!a.pr) continue;
      rows.push({ m }); const ctx = { pr: a.pr, tr: a.tr, odds: m.odds };
      if (evalFilter(f, ctx).ok) matched.push({ m, vals: f.rules.map(r => probOf(r, ctx)), odds: m.odds });
    }
  }
  const s = summarize(f, matched, rows);
  assert.ok(rows.length > 200 && s.n > 0);
  for (const r of s.rules) { assert.ok(r.k <= r.n && r.rate >= 0 && r.rate <= 1 && r.exp >= 0.6 && r.base.n === rows.length); }
  assert.ok(s.joint.k <= s.joint.n);
  console.log('RESULTADO:', JSON.stringify({ partidos: rows.length, cumplen: s.n, reglas: s.rules.map(r => ({ k: r.k, n: r.n, rate: +r.rate.toFixed(3), exp: +r.exp.toFixed(3), z: +r.z.toFixed(2), base: +r.base.rate.toFixed(3), roi: r.roi && { n: r.roi.n, mean: +r.roi.mean.toFixed(3), se: +r.roi.se.toFixed(3) } })), conjunto: { k: s.joint.k, n: s.joint.n } }));
});
