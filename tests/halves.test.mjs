// Ejecutar: node --test tests/halves.test.mjs
// Goles por partes del modelo: cálculo a mano, datos que faltan, filtros y comprobación contra la realidad.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { halfShare, halfProbs } from '../js/model/halves.js';
import { analyze } from '../js/model/analyze.js';
import { evalFilter, probOf, marketOptions } from '../js/model/filters.js';
import { ruleOutcome } from '../js/model/filterstats.js';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} ≉ ${b}`);
const m = (h, a, ht) => ({ status: 'FT', score: { h, a, ht } });

test('halfShare: proporción de goles en la 1ª parte, solo con marcador al descanso y con goles suficientes', () => {
  const ms = Array.from({ length: 30 }, () => m(2, 1, { h: 1, a: 0 }));               // 90 goles, 30 en la 1ª parte
  near(halfShare(ms), 1 / 3);
  near(halfShare([...ms, m(5, 5, null), { status: 'NS', score: null }]), 1 / 3);       // sin descanso o sin jugar: no cuentan
  assert.equal(halfShare(ms.slice(0, 5)), null);                                         // 15 goles: muestra insuficiente
  assert.equal(halfShare([]), null);
});
test('halfProbs: Poisson de la suma de ambos equipos repartida entre las partes', () => {
  const h = halfProbs(2, 0.5);                                                           // cada parte λ = 1
  near(h.ht.o05, 1 - Math.exp(-1)); near(h.ht.o15, 1 - 2 * Math.exp(-1)); near(h.h2.o05, h.ht.o05); near(h.ht.lambda, 1);
  const g = halfProbs(3, 0.4); near(g.ht.lambda, 1.2); near(g.h2.lambda, 1.8); assert.ok(g.h2.o05 > g.ht.o05 && g.h2.o15 > g.ht.o15);
  assert.equal(halfProbs(2, null), null); assert.equal(halfProbs(0, 0.4), null);
  assert.ok(h.ht.o05 > h.ht.o15);
});
test('filtros: los mercados de partes existen en «Modelo» y se evalúan', () => {
  const ids = marketOptions('modelo').map(x => x[0]);
  for (const id of ['ht_o05', 'ht_o15', 'h2_o05', 'h2_o15']) assert.ok(ids.includes(id), id);
  const pr = { halves: halfProbs(3, 0.45), games: { h: 10, a: 10 } };
  near(probOf({ src: 'modelo', mk: 'ht_o05' }, { pr }), pr.halves.ht.o05);
  assert.equal(probOf({ src: 'modelo', mk: 'ht_o05' }, { pr: { games: { h: 10, a: 10 } } }), null);   // sin datos de descanso: no se inventa
  const f = { minGames: 5, noDisagree: false, rules: [{ src: 'modelo', mk: 'ht_o05', op: 'ge', v: 70 }] };
  assert.equal(evalFilter(f, { pr }).ok, pr.halves.ht.o05 >= 0.7);
  assert.equal(ruleOutcome({ mk: 'ht_o05' }, m(1, 0, { h: 1, a: 0 })), true); assert.equal(ruleOutcome({ mk: 'h2_o15' }, m(2, 1, { h: 1, a: 1 })), false);
});
test('datos reales: las probabilidades por partes están razonablemente calibradas (sesgo conocido < 6 puntos)', () => {
  const dir = new URL('../data/', import.meta.url), cut = Date.now() - 120 * 864e5, S = { ht05: [0, 0], ht15: [0, 0], h205: [0, 0], h215: [0, 0] };
  let n = 0;
  for (const x of readdirSync(dir).filter(y => /^[A-Z0-9]+\.json$/.test(y))) {
    const lg = JSON.parse(readFileSync(new URL(x, dir))), prev = (() => { try { return JSON.parse(readFileSync(new URL('prev/' + x, dir))).matches; } catch { return []; } })();
    for (const g of lg.matches.filter(y => y.status === 'FT' && y.score && y.score.ht && Date.parse(y.kickoff) > cut)) {
      const a = analyze({ m: g, all: lg.matches, prevAll: prev, teams: lg.teams, withBacktest: false, withStandings: false }), hp = a.pr && a.pr.halves; if (!hp) continue;
      n++; const h1 = g.score.ht.h + g.score.ht.a, h2 = g.score.h + g.score.a - h1;
      S.ht05[0] += hp.ht.o05; S.ht05[1] += h1 >= 1; S.ht15[0] += hp.ht.o15; S.ht15[1] += h1 >= 2; S.h205[0] += hp.h2.o05; S.h205[1] += h2 >= 1; S.h215[0] += hp.h2.o15; S.h215[1] += h2 >= 2;
    }
  }
  assert.ok(n > 500);
  for (const [k, [p, y]] of Object.entries(S)) assert.ok(Math.abs(p / n - y / n) < 0.06, `${k}: esperado ${(p / n).toFixed(3)} real ${(y / n).toFixed(3)}`);
});
