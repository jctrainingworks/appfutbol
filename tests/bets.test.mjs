// Ejecutar: node --test tests/bets.test.mjs
// Registro de apuestas reales: liquidar con el marcador, resumen y copia de seguridad.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SELECTIONS, betOutcome, betProfit, upsertBet, removeBet, setStake, parseBackup, backupText, summarizeBets } from '../js/model/bets.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const bet = (o = {}) => ({ id: 'b1', mid: 'E0-20261101-a-b', l: 'E0', k: '2026-11-01T15:00:00.000Z', h: { id: 'a', name: 'A' }, a: { id: 'b', name: 'B' }, key: '1', label: 'A', odds: 2.0, stake: 1, p: 0.55, t: '2026-10-30T10:00:00.000Z', ...o });
const ft = (h, a) => ({ status: 'FT', score: { h, a } });

test('cada mercado se comprueba bien con el marcador', () => {
  const T = { // marcador → mercados que se cumplen
    '2-0': ['1', '1X', '12', 'o15', 'nobtts', 'u25'],
    '1-1': ['X', '1X', 'X2', 'o15', 'u25', 'btts'],
    '0-3': ['2', 'X2', '12', 'o15', 'o25', 'nobtts'],
    '2-2': ['X', '1X', 'X2', 'o15', 'o25', 'o35', 'btts'],
    '0-0': ['X', '1X', 'X2', 'u25', 'nobtts'],
  };
  for (const [sc, yes] of Object.entries(T)) {
    const [h, a] = sc.split('-').map(Number);
    for (const k of Object.keys(SELECTIONS)) assert.equal(SELECTIONS[k]({ h, a }), yes.includes(k), `${sc} ${k}`);
  }
  assert.equal(Object.keys(SELECTIONS).length, 12);
});
test('betOutcome: null si no hay resultado; beneficio = importe × (cuota − 1) o −importe', () => {
  assert.equal(betOutcome(bet(), { status: 'NS' }), null);
  assert.equal(betOutcome(bet(), null), null);
  assert.equal(betOutcome(bet({ key: 'zzz' }), ft(1, 0)), null);
  assert.equal(betOutcome(bet(), ft(1, 0)), true);
  assert.equal(betOutcome(bet(), ft(0, 0)), false);
  near(betProfit(bet({ odds: 2.5, stake: 4 }), true), 6);
  near(betProfit(bet({ odds: 2.5, stake: 4 }), false), -4);
});
test('upsert, borrar y cambiar importe', () => {
  let l = [];
  ({ list: l } = upsertBet(l, bet()));
  const r = upsertBet(l, bet({ id: 'otro', odds: 2.2, p: 0.6, t: '2026-10-31T10:00:00.000Z' }));
  assert.equal(r.updated, true); assert.equal(r.list.length, 1);
  assert.deepEqual([r.list[0].id, r.list[0].odds, r.list[0].p, r.list[0].stake], ['b1', 2.2, 0.6, 1]);   // mismo partido y mercado: actualiza, no duplica
  const r2 = upsertBet(r.list, bet({ id: 'b2', key: 'o25' }));
  assert.equal(r2.updated, false); assert.equal(r2.list.length, 2);
  assert.equal(setStake(r2.list, 'b1', 5)[0].stake, 5);
  assert.equal(setStake(r2.list, 'b1', 0)[0].stake, 1);          // importe no válido: no cambia
  assert.equal(setStake(r2.list, 'b1', -3)[0].stake, 1);
  assert.deepEqual(removeBet(r2.list, 'b1').map(b => b.id), ['b2']);
});
test('copia de seguridad: ida y vuelta, y rechaza datos mal formados', () => {
  const l = [bet(), bet({ id: 'b2', key: 'o25', odds: 1.85, p: null })];
  const back = parseBackup(backupText(l));
  assert.equal(back.ok, true); assert.deepEqual(back.bets, l);
  assert.equal(parseBackup(JSON.stringify(l)).ok, true);        // también acepta la lista sin envoltorio
  for (const [txt, why] of [['no es json', 'texto'], ['{"x":1}', 'sin lista'], [JSON.stringify([bet({ odds: 1 })]), 'cuota 1'], [JSON.stringify([bet({ stake: 0 })]), 'importe 0'],
    [JSON.stringify([bet({ key: 'zzz' })]), 'mercado'], [JSON.stringify([bet({ p: 1.2 })]), 'prob'], [JSON.stringify([bet({ k: 'ayer' })]), 'fecha'],
    [JSON.stringify([bet({ h: null })]), 'equipo'], [JSON.stringify([bet(), bet()]), 'repetidas'], [JSON.stringify([bet({ odds: '2' })]), 'cuota texto']]) {
    assert.equal(parseBackup(txt).ok, false, why);
  }
  assert.equal(parseBackup('[]').ok, true);
});
test('summarizeBets: totales, rentabilidad y lo esperado, calculados a mano', () => {
  const a = bet({ id: 'a', odds: 2.0, stake: 1, p: 0.6 }), b = bet({ id: 'b', key: 'o25', odds: 3.0, stake: 2, p: 0.4 }), c = bet({ id: 'c', key: 'X', odds: 3.5, stake: 1, p: null }), d = bet({ id: 'd', key: '2', odds: 2.5, stake: 1, p: 0.5 });
  const res = { a: true, b: false, c: true, d: null };
  const s = summarizeBets([a, b, c, d], x => res[x.id]);
  assert.deepEqual([s.total, s.settled, s.pending, s.won], [4, 3, 1, 2]);
  near(s.staked, 4);                                              // 1 + 2 + 1
  near(s.profit, 1 * 1 + -2 + 1 * 2.5);                           // +1, −2, +2,5 = 1,5
  near(s.roi, 1.5 / 4);
  near(s.avgOdds, (2 + 3 + 3.5) / 3);
  // esperado solo con las apuestas que tienen probabilidad (a y b): aciertos 0,6+0,4; beneficio 1×(0,6×2−1)+2×(0,4×3−1)
  assert.equal(s.expected.n, 2); near(s.expected.hits, 1.0); assert.equal(s.expected.won, 1);
  near(s.expected.profit, 1 * (0.6 * 2 - 1) + 2 * (0.4 * 3 - 1));
  near(s.expected.profitReal, 1 + -2);
  // error típico del beneficio por unidad: valores [+1, −1, +2,5] → media 0,8333, desviación muestral, /√3
  const u = [1, -1, 2.5], m = u.reduce((x, y) => x + y) / 3, sd = Math.sqrt(u.reduce((x, y) => x + (y - m) ** 2, 0) / 2);
  near(s.roiSe, sd / Math.sqrt(3));
  const e = summarizeBets([], () => null);
  assert.deepEqual([e.total, e.settled, e.roi, e.expected], [0, 0, null, null]);
});
