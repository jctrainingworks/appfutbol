// Ejecutar: node --test tests/filters.test.mjs
// Filtros personalizados: reglas con modelo / tendencia / mercado, opciones de seguridad y validación de lo guardado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SOURCES, marketOptions, probOf, evalFilter, applyFilter, sanitizeFilters, newFilter, exampleFilter, MAX_FILTERS, MAX_RULES } from '../js/model/filters.js';
import { analyze } from '../js/model/analyze.js';
import { GAME_MARKETS } from '../js/model/trends.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);
const pr = (o15, o25, g = [10, 10]) => ({ p1: 0.5, pX: 0.25, p2: 0.25, dc: { '1X': 0.75, X2: 0.5, '12': 0.75 }, over: { '1.5': o15, '2.5': o25, '3.5': 0.3 }, under: { '2.5': 1 - o25 }, btts: { si: 0.55, no: 0.45 }, games: { h: g[0], a: g[1] } });
const tr = avg => ({ game: [{ id: 'co_o95', avg }] });
const F = (rules, o = {}) => ({ id: 'f', name: 'f', on: true, minGames: 5, noDisagree: true, rules, ...o });
const R = (src, mk, op, v) => ({ src, mk, op, v });
const odd3 = (a, b, c) => [1 / (a * 1.05), 1 / (b * 1.05), 1 / (c * 1.05)];

test('probOf: modelo, tendencia y mercado (sin margen); null si falta el dato', () => {
  near(probOf(R('modelo', 'ft_o15'), { pr: pr(0.85, 0.6) }), 0.85); near(probOf(R('modelo', '1X'), { pr: pr(0.85, 0.6) }), 0.75); near(probOf(R('modelo', 'ft_u25'), { pr: pr(0.85, 0.6) }), 0.4);
  near(probOf(R('tend', 'co_o95'), { tr: tr(0.7) }), 0.7); assert.equal(probOf(R('tend', 'ft_o15'), { tr: tr(0.7) }), null);
  const odds = { b365: odd3(0.5, 0.3, 0.2), ou25: [1 / (0.6 * 1.05), 1 / (0.4 * 1.05)] };
  near(probOf(R('mercado', '1'), { odds }), 0.5, 1e-6); near(probOf(R('mercado', '12'), { odds }), 0.7, 1e-6); near(probOf(R('mercado', 'ft_o25'), { odds }), 0.6, 1e-6);
  assert.equal(probOf(R('mercado', '1'), { odds: null }), null); assert.equal(probOf(R('mercado', 'ft_o15'), { odds }), null); assert.equal(probOf(R('modelo', '1'), {}), null);
});
test('el filtro del ejemplo: +1,5 ≥ 80 % y +2,5 ≥ 60 % (todas las reglas), incluyendo el borde', () => {
  const f = exampleFilter('x');
  assert.equal(evalFilter(f, { pr: pr(0.84, 0.63) }).ok, true);
  assert.equal(evalFilter(f, { pr: pr(0.80, 0.60) }).ok, true);          // justo en el límite cuenta
  assert.equal(evalFilter(f, { pr: pr(0.84, 0.55) }).ok, false);
  assert.equal(evalFilter(f, { pr: pr(0.79, 0.70) }).ok, false);
});
test('op «como máximo», fuente sin dato y reglas mezcladas', () => {
  assert.equal(evalFilter(F([R('modelo', 'ft_o25', 'le', 40)]), { pr: pr(0.7, 0.35) }).ok, true);
  assert.equal(evalFilter(F([R('modelo', 'ft_o25', 'le', 40)]), { pr: pr(0.7, 0.45) }).ok, false);
  const e = evalFilter(F([R('mercado', '1', 'ge', 50)]), { pr: pr(0.8, 0.6), odds: null });
  assert.equal(e.ok, false); assert.equal(e.why, 'falta un dato');         // sin cuotas la regla de mercado no se cumple
  assert.equal(evalFilter(F([R('modelo', 'ft_o15', 'ge', 80), R('tend', 'co_o95', 'ge', 60)]), { pr: pr(0.9, 0.6), tr: tr(0.65) }).ok, true);
  assert.equal(evalFilter(F([R('modelo', 'ft_o15', 'ge', 80), R('tend', 'co_o95', 'ge', 60)]), { pr: pr(0.9, 0.6), tr: tr(0.5) }).ok, false);
});
test('seguridad: muestra mínima, sin modelo y discrepancia modelo–mercado', () => {
  const f = F([R('modelo', 'ft_o15', 'ge', 80)]);
  const e1 = evalFilter(f, { pr: pr(0.9, 0.6, [3, 12]) }); assert.equal(e1.ok, false); assert.match(e1.why, /partidos previos/);
  assert.equal(evalFilter(F(f.rules, { minGames: 0 }), { pr: pr(0.9, 0.6, [3, 12]) }).ok, true);
  assert.equal(evalFilter(f, { pr: null }).ok, false);
  const model = { ...pr(0.9, 0.6), p1: 0.83, pX: 0.11, p2: 0.06 }, odds = { b365: odd3(0.70, 0.19, 0.11) };       // Venezia–Inter: 13 puntos
  const e2 = evalFilter(f, { pr: model, odds }); assert.equal(e2.ok, false); assert.match(e2.why, /discrepan/);
  assert.equal(evalFilter(F(f.rules, { noDisagree: false }), { pr: model, odds }).ok, true);
  assert.equal(evalFilter(f, { pr: model, odds: null }).ok, true);        // sin cuotas no hay con qué comparar: no se descarta
});
test('applyFilter: solo los que cumplen, ordenados por hora', () => {
  const it = (id, k, p15) => ({ m: { id, kickoff: k, odds: null }, pr: pr(p15, 0.7), tr: null });
  const r = applyFilter(F([R('modelo', 'ft_o15', 'ge', 80)]), [it('c', '2026-11-03T10:00Z', 0.9), it('a', '2026-11-01T10:00Z', 0.85), it('b', '2026-11-02T10:00Z', 0.5)]);
  assert.deepEqual(r.map(x => x.it.m.id), ['a', 'c']);
});
test('sanitizeFilters: limpia lo guardado (roto o manipulado)', () => {
  assert.deepEqual(sanitizeFilters('basura'), []); assert.deepEqual(sanitizeFilters(null), []);
  const raw = [
    exampleFilter('1'), { ...exampleFilter('1') },                                        // id repetido: se descarta el segundo
    { id: '2', name: 'x'.repeat(100), minGames: 999, rules: [{ src: 'modelo', mk: 'ft_o15', op: 'zzz', v: 500 }, { src: 'nada', mk: 'ft_o15', op: 'ge', v: 50 }, { src: 'modelo', mk: 'no_existe', op: 'ge', v: 50 }, null] },
    { id: '3', rules: [] }, { id: '', rules: [{ src: 'modelo', mk: 'ft_o15', op: 'ge', v: 50 }] }, 7, null,
    { id: '4', name: '<img src=x onerror=alert(1)>', rules: [{ src: 'tend', mk: 'co_o95', op: 'le', v: 'abc' }] },
  ];
  const out = sanitizeFilters(raw);
  assert.deepEqual(out.map(f => f.id), ['1', '2', '4']);
  assert.equal(out[1].name.length, 40); assert.equal(out[1].minGames, 15); assert.equal(out[1].rules.length, 1);
  assert.deepEqual(out[1].rules[0], { src: 'modelo', mk: 'ft_o15', op: 'ge', v: 99 });
  assert.deepEqual(out[2].rules[0], { src: 'tend', mk: 'co_o95', op: 'le', v: 50 });
  assert.equal(sanitizeFilters(Array.from({ length: 50 }, (_, i) => newFilter('f' + i))).length, MAX_FILTERS);
  assert.equal(sanitizeFilters([{ id: 'a', rules: Array.from({ length: 20 }, () => ({ src: 'modelo', mk: 'ft_o15', op: 'ge', v: 50 })) }])[0].rules.length, MAX_RULES);
  assert.deepEqual(sanitizeFilters(JSON.parse(JSON.stringify(out))), out);                // idempotente
});
test('todas las opciones de mercado tienen etiqueta y cada fuente tiene mercados', () => {
  for (const s of Object.keys(SOURCES)) assert.ok(marketOptions(s).length >= 8);
  assert.equal(marketOptions('tend').length, GAME_MARKETS.length);
});
test('datos reales: el filtro de ejemplo se evalúa para todos los próximos partidos', () => {
  const dir = new URL('../data/', import.meta.url); let n = 0, hit = 0;
  for (const f of readdirSync(dir).filter(x => /^[A-Z0-9]+\.json$/.test(x))) {
    const lg = JSON.parse(readFileSync(new URL(f, dir))), prev = (() => { try { return JSON.parse(readFileSync(new URL('prev/' + f, dir))).matches; } catch { return []; } })();
    const items = lg.matches.filter(x => x.status === 'NS').map(m => { const a = analyze({ m, all: lg.matches, prevAll: prev, teams: lg.teams, withBacktest: false, withStandings: false }); return { m, pr: a.pr, tr: a.tr }; });
    n += items.length;
    for (const x of applyFilter(exampleFilter('e'), items)) { hit++; assert.ok(x.it.pr.over['1.5'] >= 0.8 - 1e-9 && x.it.pr.over['2.5'] >= 0.6 - 1e-9); }
    applyFilter(F([R('tend', 'co_o95', 'ge', 50), R('mercado', '1', 'ge', 40)]), items);
  }
  console.log(`# ${n} próximos partidos: ${hit} cumplen el ejemplo`);
});
