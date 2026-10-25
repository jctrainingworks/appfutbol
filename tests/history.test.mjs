// Ejecutar: node --test tests/history.test.mjs
// Historial de pronósticos: guardar antes del partido, liquidar con el resultado real y calcular estadísticas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { analyze } from '../js/model/analyze.js';
import { marketOutcome } from '../js/model/trends.js';
import { MODEL_VERSION, updateHistory, summarize, pickOutcome, findResult, implied, wilson, meanSe, result1x2 } from '../js/model/history.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const T = id => ({ id, name: id });
const iso = (d, h = 15) => new Date(Date.UTC(2026, 8, d, h)).toISOString(); // septiembre de 2026

// ---------- Piezas pequeñas ----------
test('marketOutcome: calcula el mercado con el resultado y devuelve null si la fuente no trae el dato', () => {
  const m = { status: 'FT', score: { h: 2, a: 1, ht: { h: 1, a: 1 } }, st: { corners: [6, 4], yellow: [2, 1], red: [0, 1] } };
  assert.equal(marketOutcome('ft_o25', m), true);
  assert.equal(marketOutcome('ft_u25', m), false);
  assert.equal(marketOutcome('btts', m), true);
  assert.equal(marketOutcome('ht_o15', m), true);          // 1-1 al descanso
  assert.equal(marketOutcome('h2_o05', m), true);          // 2ª parte 1-0
  assert.equal(marketOutcome('h2_o15', m), false);
  assert.equal(marketOutcome('co_o95', m), true);          // 10 corners
  assert.equal(marketOutcome('co_o105', m), false);
  assert.equal(marketOutcome('ca_o35', m), true);          // 2+1+0+1 = 4 tarjetas
  assert.equal(marketOutcome('ca_o45', m), false);
  const sin = { status: 'FT', score: { h: 1, a: 0, ht: null } };
  assert.equal(marketOutcome('ht_o05', sin), null);
  assert.equal(marketOutcome('co_o85', sin), null);
  assert.equal(marketOutcome('ca_o25', sin), null);
  assert.equal(marketOutcome('t_win', m), null);           // mercado de equipo: no es del partido
  assert.equal(marketOutcome('ft_o25', { status: 'NS' }), null);
});
test('pickOutcome: 1, 2 y doble oportunidad salen del marcador', () => {
  const w = { status: 'FT', score: { h: 2, a: 0 } }, d = { status: 'FT', score: { h: 1, a: 1 } }, l = { status: 'FT', score: { h: 0, a: 3 } };
  assert.deepEqual([w, d, l].map(m => pickOutcome('1', m)), [true, false, false]);
  assert.deepEqual([w, d, l].map(m => pickOutcome('2', m)), [false, false, true]);
  assert.deepEqual([w, d, l].map(m => pickOutcome('dc1X', m)), [true, true, false]);
  assert.deepEqual([w, d, l].map(m => pickOutcome('dcX2', m)), [false, true, true]);
});
test('implied, wilson y meanSe', () => {
  const q = implied([2, 3.5, 4]);
  near(q.reduce((a, b) => a + b, 0), 1);
  near(q[0], 0.5 / (0.5 + 1 / 3.5 + 0.25));
  assert.equal(implied([2, null, 4]), null);
  assert.equal(implied([2, 0.9]), null);
  const [lo, hi] = wilson(5, 10);
  near(lo, 0.2366, 1e-3); near(hi, 0.7634, 1e-3);
  assert.equal(wilson(0, 0), null);
  const s = meanSe([1, 2, 3]);
  near(s.mean, 2); near(s.se, 1 / Math.sqrt(3)); assert.equal(meanSe([]), null);
  assert.equal(meanSe([4]).se, null);
});

// ---------- Estadísticas calculadas a mano ----------
const rec = (o) => ({ id: 'x', l: 'E0', k: iso(1), h: T('A'), a: T('B'), t: iso(1, 9), v: MODEL_VERSION, p: [0.4, 0.3, 0.3], o: 0.5, xg: [1, 1], g: [5, 5], b: [0.4, 0.3, 0.3], bo: 0.5, od: null, fav: [], r: null, ...o });
test('summarize: Brier, mercado, favoritos y apuestas de valor coinciden con el cálculo a mano', () => {
  const r1 = rec({ id: 'r1', p: [0.5, 0.3, 0.2], o: 0.6, b: [0.4, 0.3, 0.3], bo: 0.5, od: { b365: [2.2, 3.4, 4.0], ou25: null },
    fav: [{ id: '1', label: 'Gana A', conf: 'media', p: 0.5, odds: 2.2 }], r: { h: 1, a: 0, f: [true] } });
  const r2 = rec({ id: 'r2', p: [0.2, 0.3, 0.5], o: 0.6, b: [0.3, 0.4, 0.3], bo: 0.5, od: { b365: [3.5, 3.0, 1.9], ou25: [1.8, 2.1] },
    fav: [{ id: 'ft_o25', label: 'Más de 2,5', conf: 'baja', p: 0.6, odds: 1.8 }, { id: 'co_o95', label: 'Corners', conf: 'baja', p: 0.6, odds: null }], r: { h: 0, a: 0, f: [false, null] } });
  const pend = rec({ id: 'p1' }), old = rec({ id: 'old', v: MODEL_VERSION + 1, r: { h: 1, a: 1, f: [] } }), voided = rec({ id: 'v1', x: 1 });
  const s = summarize([r1, r2, pend, old, voided]);
  assert.deepEqual([s.total, s.settled, s.pending, s.void, s.otherVersions], [4, 2, 1, 1, 1]);
  near(s.x12.model.brier, (0.38 + 0.78) / 2);
  near(s.x12.base.brier, (0.54 + 0.54) / 2);
  near(s.x12.model.logloss, (-Math.log(0.5) - Math.log(0.3)) / 2);
  near(s.x12.model.hit, 0.5);                                   // r1 acierta (1), r2 falla (el más probable era el 2 y salió X)
  near(s.x12.vsBase.mean, ((0.38 - 0.54) + (0.78 - 0.54)) / 2);
  assert.equal(s.x12.market.n, 2);
  const m1 = implied([2.2, 3.4, 4.0]), m2 = implied([3.5, 3.0, 1.9]);
  near(s.x12.market.brier, ((m1[0] - 1) ** 2 + m1[1] ** 2 + m1[2] ** 2 + m2[0] ** 2 + (m2[1] - 1) ** 2 + m2[2] ** 2) / 2);
  // más/menos 2,5: r1 sin cuota ou25, r2 con cuota
  near(s.ou.model, ((0.6 - 0) ** 2 + (0.6 - 0) ** 2) / 2);       // 1-0 y 0-0: ninguno supera 2,5
  assert.equal(s.ou.market.n, 1);
  // favoritos: r1 acierta, r2 falla y el de corners no se puede comprobar
  assert.deepEqual([s.favs.n, s.favs.k, s.favs.unknown], [2, 1, 1]);
  near(s.favs.rate, 0.5); near(s.favs.pred, 0.55);
  assert.deepEqual([s.favs.priced.n, s.favs.priced.k], [2, 1]);
  near(s.favs.priced.roi, ((2.2 - 1) + -1) / 2);
  assert.deepEqual(s.favs.byConf.map(g => [g.conf, g.n, g.k]), [['media', 1, 1], ['baja', 1, 0]]);
  // valor: r1 '1' (EV +10%, gana +1,2) y r2 más de 2,5 (EV +8%, pierde −1)
  assert.deepEqual([s.value.n, s.value.k], [2, 1]);
  near(s.value.roi, 0.1);
  // error típico del ROI: beneficios [+1,2 ; −1], media 0,1, desviación muestral √(2,42/1), error = desviación/√2 = 1,1
  near(s.value.se, 1.1);
  assert.equal(s.value.baseline.n, 8);
  near(s.value.baseline.roi, -0.7 / 8);
  // calibración: 6 probabilidades repartidas por tramos; el total de casos observados suma 2 (uno por partido)
  assert.equal(s.calib.reduce((a, b) => a + b.n, 0), 6);
  near(s.calib.reduce((a, b) => a + b.obs * b.n, 0), 2);
  assert.equal(summarize([pend]).x12, null);
  assert.equal(summarize([r1, r2], { league: 'SP1' }).total, 0);
});

// ---------- Ciclo de vida: guardar, refrescar, congelar, liquidar, anular ----------
function league() {
  const ms = [], names = ['A', 'B', 'C', 'D'];
  let d = 1;
  for (let rnd = 0; rnd < 3; rnd++) for (const [i, j] of [[0, 1], [2, 3], [1, 2], [3, 0], [0, 2], [1, 3]]) {
    const h = rnd % 2 ? names[j] : names[i], a = rnd % 2 ? names[i] : names[j];
    ms.push({ id: `L-${d}-${h}-${a}`, leagueId: 'L', round: rnd + 1, kickoff: iso(d++ % 28 + 1), home: T(h), away: T(a), status: 'FT', score: { h: (d + h.charCodeAt(0)) % 4, a: (d + a.charCodeAt(0)) % 3, ht: { h: 0, a: 0 } } });
  }
  return ms;
}
const fut = (id, h, a, k, odds) => ({ id, leagueId: 'L', round: 9, kickoff: k, home: T(h), away: T(a), status: 'NS', ...(odds ? { odds } : {}) });
const LG = (matches, prev = []) => [{ id: 'L', matches, teams: [], prev }];

test('ciclo de vida del pronóstico', () => {
  const base = league(), K = '2026-10-10T15:00:00.000Z', now1 = new Date('2026-10-05T10:00:00Z');
  const upc = fut('L-new', 'A', 'B', K);
  // 1. aparece un próximo partido -> se guarda
  let r = updateHistory(null, LG([...base, upc]), { now: now1 });
  assert.equal(r.stats.nuevos, 1); assert.equal(r.history.records.length, 1);
  let g = r.history.records[0];
  assert.equal(g.v, MODEL_VERSION); assert.equal(g.r, null); assert.equal(g.t, now1.toISOString());
  near(g.p.reduce((a, b) => a + b, 0), 1, 1e-3);
  assert.equal(g.od, null);
  // 2. misma información más tarde -> no cambia nada (ni siquiera la hora de guardado)
  const r2 = updateHistory(r.history, LG([...base, upc]), { now: new Date('2026-10-05T14:00:00Z') });
  assert.equal(r2.changed, false); assert.equal(r2.history.records[0].t, now1.toISOString()); assert.equal(r2.history.updated, r.history.updated);
  // 3. llegan cuotas -> se refresca antes del partido
  const odds = { b365: [2.1, 3.3, 3.6], ou25: [1.9, 1.95] };
  const r3 = updateHistory(r2.history, LG([...base, { ...upc, odds }]), { now: new Date('2026-10-06T10:00:00Z') });
  assert.equal(r3.stats.actualizados, 1); assert.deepEqual(r3.history.records[0].od, odds);
  // 4. empieza el partido pero aún no hay resultado -> queda congelado aunque cambien las cuotas
  const r4 = updateHistory(r3.history, LG([...base, { ...upc, odds: { b365: [1.1, 9, 20], ou25: null } }]), { now: new Date('2026-10-10T16:00:00Z') });
  assert.equal(r4.changed, false); assert.deepEqual(r4.history.records[0].od, odds);
  // 5. aparece el resultado con otro id (la hora cambió de día) -> se casa por equipos y fecha y se liquida
  const played = { ...upc, id: 'L-other-id', kickoff: '2026-10-11T12:00:00.000Z', status: 'FT', score: { h: 3, a: 1, ht: { h: 1, a: 0 } } };
  const r5 = updateHistory(r4.history, LG([...base, played]), { now: new Date('2026-10-11T20:00:00Z') });
  assert.equal(r5.stats.liquidados, 1);
  const s = r5.history.records[0];
  assert.deepEqual([s.r.h, s.r.a], [3, 1]); assert.equal(s.r.f.length, s.fav.length);
  s.fav.forEach((f, i) => assert.equal(s.r.f[i], pickOutcome(f.id, played)));
  // 6. liquidado -> no se vuelve a tocar
  const r6 = updateHistory(r5.history, LG([...base, played]), { now: new Date('2026-10-12T10:00:00Z') });
  assert.equal(r6.changed, false);
  // 7. sin resultado 7 días después -> se marca como anulado y no cuenta
  const r7 = updateHistory(r4.history, LG([...base, upc]), { now: new Date('2026-10-18T10:00:00Z') });
  assert.equal(r7.history.records[0].x, 1); assert.equal(summarize(r7.history.records).void, 1); assert.equal(summarize(r7.history.records).pending, 0);
  // 8. pero si el resultado llega tarde, se liquida y deja de estar anulado
  const r8 = updateHistory(r7.history, LG([...base, played]), { now: new Date('2026-10-19T10:00:00Z') });
  assert.equal(r8.history.records[0].x, undefined); assert.ok(r8.history.records[0].r);
});
test('no se crean pronósticos retroactivos ni de partidos que ya empezaron', () => {
  const base = league(), r = updateHistory(null, LG([...base, fut('L-a', 'A', 'B', '2026-10-10T15:00:00.000Z')]), { now: new Date('2026-10-10T15:00:01Z') });
  assert.equal(r.history.records.length, 0);                       // ya empezó: no hay pronóstico "previo" honrado
  const played = updateHistory(null, LG(base), { now: new Date('2027-01-01T00:00:00Z') });
  assert.equal(played.history.records.length, 0);                  // los ya jugados nunca generan pronóstico
});

// ---------- Con los datos reales de las 18 ligas ----------
const dir = new URL('../data/', import.meta.url);
const files = existsSync(dir) ? readdirSync(dir).filter(x => /^[A-Z0-9]+\.json$/.test(x) && x !== 'index.json') : [];
const load = f => {
  const lg = JSON.parse(readFileSync(new URL(f, dir))), pf = new URL(`prev/${f}`, dir);
  return { id: lg.id, teams: lg.teams, matches: lg.matches, prev: existsSync(pf) ? JSON.parse(readFileSync(pf)).matches : [] };
};
const fin = lg => lg.matches.filter(m => m.status === 'FT' && m.score).sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);
const strip = m => { const { score, st, ...rest } = m; return { ...rest, status: 'NS' }; };
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

test('sin fuga de información: el análisis de un partido no cambia si se borran el propio partido y los posteriores', () => {
  let checked = 0;
  for (const f of files) {
    const lg = load(f), fm = fin(lg);
    if (fm.length < 20) continue;
    for (const m of fm.slice(-3)) {
      const full = analyze({ m, all: lg.matches, prevAll: lg.prev, teams: lg.teams, withBacktest: false });
      const cut = analyze({ m: strip(m), all: lg.matches.filter(x => x.kickoff < m.kickoff), prevAll: lg.prev, teams: lg.teams, withBacktest: false });
      assert.ok(same(full.pr, cut.pr), `${f} ${m.id}: el modelo usa datos del futuro`);
      assert.ok(same(full.ins.favorites, cut.ins.favorites), `${f} ${m.id}: los favoritos usan datos del futuro`);
      checked++;
    }
  }
  assert.ok(checked > 0);
});

// Resultado de cada mercado calculado de forma independiente, directamente con los datos en bruto.
function indep(id, m) {
  const { h, a } = m.score, ht = m.score.ht, st = m.st || {}, tot = h + a;
  const sumA = x => Array.isArray(x) ? x[0] + x[1] : null;
  const co = sumA(st.corners), ca = Array.isArray(st.yellow) && Array.isArray(st.red) ? sumA(st.yellow) + sumA(st.red) : null;
  const h1 = ht ? ht.h + ht.a : null, h2 = ht ? tot - h1 : null;
  const T_ = { '1': h > a, '2': a > h, dc1X: h >= a, dcX2: a >= h, ft_o15: tot >= 2, ft_o25: tot >= 3, ft_o35: tot >= 4, ft_u25: tot <= 2, btts: h > 0 && a > 0, nobtts: h === 0 || a === 0,
    ht_o05: h1 == null ? null : h1 >= 1, ht_o15: h1 == null ? null : h1 >= 2, h2_o05: h2 == null ? null : h2 >= 1, h2_o15: h2 == null ? null : h2 >= 2,
    co_o85: co == null ? null : co >= 9, co_o95: co == null ? null : co >= 10, co_o105: co == null ? null : co >= 11, co_o115: co == null ? null : co >= 12,
    ca_o25: ca == null ? null : ca >= 3, ca_o35: ca == null ? null : ca >= 4, ca_o45: ca == null ? null : ca >= 5, ca_o55: ca == null ? null : ca >= 6 };
  assert.ok(id in T_, `mercado desconocido en el test: ${id}`);
  return T_[id];
}

test('simulación con datos reales: guardar antes, liquidar después y comprobar todo por separado', () => {
  const hist = { v: null };
  const early = [], late = [], truth = new Map();
  for (const f of files) {
    const lg = load(f), fm = fin(lg);
    if (fm.length < 40) continue;
    const cutMs = Date.parse(fm[fm.length - 15].kickoff) - 36e5;         // "ahora" simulado: antes de los 15 últimos partidos jugados
    const played = fm.filter(m => Date.parse(m.kickoff) > cutMs);
    played.forEach(m => truth.set(m.id, m));
    early.push({ ...lg, matches: lg.matches.map(m => Date.parse(m.kickoff) > cutMs ? strip(m) : m), cutMs });
    late.push(lg);
  }
  assert.ok(early.length >= 5, 'hacen falta datos reales de varias ligas');
  const nowEarly = new Date(Math.min(...early.map(l => l.cutMs)));
  // Cada liga se simula en su propio "ahora": se hace liga a liga y se juntan los registros
  let records = [];
  for (const lg of early) records = records.concat(updateHistory(null, [lg], { now: new Date(lg.cutMs) }).history.records);
  assert.ok(records.length >= truth.size, 'cada partido por jugar debe tener pronóstico');
  const nowLate = new Date(Math.max(...late.flatMap(lg => lg.matches.map(m => Date.parse(m.kickoff)))) + 864e5);
  const settledAll = updateHistory({ records }, late, { now: nowLate }).history.records;
  const mine = settledAll.filter(r => truth.has(r.id));
  assert.equal(mine.length, truth.size, 'todos los partidos simulados tienen pronóstico');
  let favs = 0, nulls = 0;
  for (const r of mine) {
    const m = truth.get(r.id), before = records.find(x => x.id === r.id);
    assert.ok(r.r, `${r.id} sin liquidar`);
    assert.deepEqual([r.r.h, r.r.a], [m.score.h, m.score.a]);
    assert.ok(same({ ...r, r: null }, before), `${r.id}: el pronóstico cambió al liquidar`);             // congelado
    assert.ok(Date.parse(r.t) < Date.parse(r.k), `${r.id}: pronóstico guardado después del inicio`);
    near(r.p.reduce((a, b) => a + b, 0), 1, 2e-4);
    assert.ok(r.fav.length <= 2 && new Set(r.fav.map(f => f.id)).size === r.fav.length);
    r.fav.forEach((f, i) => { favs++; const e = indep(f.id, m); if (e == null) nulls++; assert.equal(r.r.f[i], e, `${r.id} ${f.id}`); });
  }
  assert.ok(favs > 20, `pocos favoritos para comprobar (${favs})`);
  // Estadísticas: se recalculan por separado con fórmulas explícitas
  const s = summarize(settledAll.filter(r => truth.has(r.id)), { now: nowLate });
  assert.equal(s.settled, mine.length);
  let br = 0, ll = 0, brB = 0, hit = 0, ky = 0, fk = 0, fn = 0;
  for (const r of mine) {
    const y = r.r.h > r.r.a ? 0 : r.r.h === r.r.a ? 1 : 2;
    br += [0, 1, 2].reduce((t, k) => t + (r.p[k] - (k === y ? 1 : 0)) ** 2, 0);
    brB += [0, 1, 2].reduce((t, k) => t + (r.b[k] - (k === y ? 1 : 0)) ** 2, 0);
    ll += -Math.log(r.p[y]);
    hit += r.p[y] === Math.max(...r.p) ? 1 : 0;
    ky += result1x2(r.r) === y ? 1 : 0;
    r.fav.forEach((f, i) => { if (r.r.f[i] != null) { fn++; fk += r.r.f[i] ? 1 : 0; } });
  }
  near(s.x12.model.brier, br / mine.length); near(s.x12.base.brier, brB / mine.length); near(s.x12.model.logloss, ll / mine.length);
  near(s.x12.model.hit, hit / mine.length); assert.equal(ky, mine.length);
  assert.deepEqual([s.favs.n, s.favs.k], [fn, fk]);
  // Valor esperado: cada apuesta de valor tiene EV >= 5% con la cuota y probabilidad guardadas
  if (s.value) assert.ok(s.value.n <= s.value.baseline.n);
  void nowEarly; void hist; void nulls;
});

test('el historial guardado en el repositorio (si existe) es coherente', () => {
  const p = new URL('history.json', dir);
  if (!existsSync(p)) return;
  const h = JSON.parse(readFileSync(p));
  assert.ok(Array.isArray(h.records));
  const ids = new Set();
  for (const r of h.records) {
    assert.ok(!ids.has(r.id), `id repetido ${r.id}`); ids.add(r.id);
    near(r.p.reduce((a, b) => a + b, 0), 1, 2e-4);
    assert.ok(r.fav.length <= 2);
    if (r.r) { assert.equal(r.r.f.length, r.fav.length); assert.ok(Date.parse(r.t) <= Date.parse(r.k), `${r.id}: guardado tras el inicio`); }
  }
  const s = summarize(h.records);
  assert.equal(s.settled + s.pending + s.void + s.otherVersions, h.records.length);
});
