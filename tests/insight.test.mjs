// Ejecutar: node --test tests/insight.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fit, predict, backtest } from '../js/model/poisson.js';
import { matchTrends } from '../js/model/trends.js';
import { insight, recent, restDays, h2h, pickFavorites, candidates } from '../js/model/insight.js';
import { computeStandings } from '../js/data/standings.js';

const T = (id) => ({ id, name: id });
const mk = (id, d, h, a, sh, sa, extra = {}) => ({ id, kickoff: `2026-09-${String(d).padStart(2, '0')}T15:00:00.000Z`, home: T(h), away: T(a), status: 'FT', score: { h: sh, a: sa, ht: { h: sh ? 1 : 0, a: 0 } }, ...extra });

test('recent: resultado, goles y orden', () => {
  const ms = [mk('1', 1, 'A', 'B', 2, 0), mk('2', 8, 'C', 'A', 1, 1), mk('3', 15, 'A', 'D', 0, 3)];
  const r = recent(ms, 'A', 5);
  assert.deepEqual(r.map(x => x.r), ['W', 'D', 'L']);
  assert.deepEqual(r.map(x => [x.gf, x.ga]), [[2, 0], [1, 1], [0, 3]]);
  assert.equal(recent(ms, 'A', 2).length, 2);
});
test('restDays y h2h', () => {
  const ms = [mk('1', 1, 'A', 'B', 2, 0), mk('2', 8, 'C', 'A', 1, 1)];
  assert.equal(restDays(ms, 'A', '2026-09-11T15:00:00.000Z'), 3);
  assert.equal(restDays(ms, 'Z', '2026-09-11T15:00:00.000Z'), null);
  assert.equal(h2h(ms, 'B', 'A').length, 1);
  assert.equal(h2h(ms, 'A', 'C').length, 1);
});
test('pickFavorites: máx 2, distintos, de familias distintas, sin muestras pequeñas ni desacuerdos', () => {
  const c = (id, p, o = {}) => ({ id, label: id, p, trend: p, model: null, edge: 0.1, n: 10, agree: null, score: p, small: false, ...o });
  const f = pickFavorites([c('ft_o15', 0.78), c('ft_o25', 0.74), c('btts', 0.7), c('ft_o05', 0.93), c('ht_o05', 0.6, { n: 2, small: true }), c('nobtts', 0.95, { agree: false })]);
  assert.equal(f.length, 2);
  assert.equal(f[0].id, 'ft_o15');
  assert.equal(f[1].id, 'btts');           // ft_o05 (93%) paga casi nada y se descarta; ft_o25 es de la misma familia (goles); ht_o05 tiene solo 2 partidos; nobtts no coincide con el modelo
  assert.deepEqual(pickFavorites([c('x', 0.85)]), []); // por encima del 80%: cuota justa < 1,25
  assert.deepEqual(pickFavorites([c('x', 0.5)]), []); // por debajo del 55%
  const s = pickFavorites([c('x', 0.58, { n: 4, small: true }), c('y', 0.65, { n: 4, small: true })]);
  assert.deepEqual(s.map(z => [z.id, z.conf]), [['y', 'baja']]); // muestra pequeña: exige 60% y sale confianza baja
});
test('valor esperado = p·cuota − 1', () => {
  const ms = [];
  for (let i = 0; i < 12; i++) { ms.push(mk('a' + i, 1 + i, 'A', 'B', 2, 1)); ms.push(mk('b' + i, 1 + i, 'B', 'A', 1, 2)); }
  const m = { id: 'x', kickoff: '2026-10-20T15:00:00.000Z', home: T('A'), away: T('B'), odds: { b365: [1.8, 3.5, 4.5], ou25: [1.7, 2.1] } };
  const pr = predict(fit(ms), 'A', 'B'), tr = matchTrends(ms, 'A', 'B');
  const c1 = candidates(tr, pr, m).find(x => x.id === '1');
  assert.ok(Math.abs(c1.ev - (pr.p1 * 1.8 - 1)) < 1e-12);
});

// Con los datos reales descargados por la Action: ningún partido rompe la lectura y se cumplen los invariantes.
const dir = new URL('../data/', import.meta.url);
for (const f of readdirSync(dir).filter(x => x.endsWith('.json') && x !== 'index.json')) {
  test(`datos reales ${f}: invariantes de la lectura`, () => {
    const lg = JSON.parse(readFileSync(new URL(f, dir)));
    const fin = lg.matches.filter(m => m.status === 'FT');
    for (const m of fin) {
      const train = fin.filter(x => x.kickoff < m.kickoff);
      const tr = matchTrends(train, m.home.id, m.away.id, { last: 10 }), pr = predict(fit(train), m.home.id, m.away.id);
      const ins = insight({ train, m, tr, pr, bt: null, standings: computeStandings(train, lg.teams) });
      assert.ok(ins.favorites.length <= 2);
      assert.equal(new Set(ins.favorites.map(x => x.id)).size, ins.favorites.length);
      for (const x of ins.favorites) { assert.ok(x.p >= (x.small ? 0.6 : 0.55) && x.p <= 1); assert.ok(x.n >= 3); assert.notEqual(x.agree, false); assert.equal(x.conf === 'baja', x.small); }
      assert.ok(ins.caveats.some(c => c.includes('lesiones') || c.includes('Lesiones')));
      if (tr && Math.min(tr.n.h, tr.n.a) < 5) for (const x of ins.favorites) assert.equal(x.conf, 'baja');
    }
  });
}
