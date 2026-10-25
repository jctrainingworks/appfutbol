// Historial de pronósticos: guarda lo que el modelo decía ANTES de cada partido (probabilidades, favoritos y cuotas de ese momento)
// y lo compara con el resultado real. Funciones puras, sin red ni disco: las usa la tarea de GitHub (scripts/update-history.mjs)
// para guardar y liquidar, y la pantalla Historial (js/views/history.js) para calcular las estadísticas.
//
// Reglas que hacen el historial honrado:
//  - Se guarda el pronóstico de TODOS los partidos próximos (no solo los que parecen buenos): sin elegir a posteriori.
//  - Mientras el partido no ha empezado, el pronóstico se refresca con los datos y cuotas más recientes; al empezar queda congelado.
//  - Nunca se crea un pronóstico de un partido que ya tiene resultado (no hay pronósticos retroactivos).
//  - Cada registro lleva la versión del modelo; las estadísticas solo cuentan la versión vigente (no se mezclan modelos distintos).
import { analyze } from './analyze.js';
import { marketOutcome } from './trends.js';

// SUBIR cuando cambie cómo se calculan las probabilidades o se eligen los favoritos (poisson.js, trends.js, insight.js, analyze.js).
export const MODEL_VERSION = 1;
export const VALUE_EV = 0.05;  // "apuesta de valor" teórica: valor esperado >= +5% (igual que la calculadora de cuotas de Análisis)
export const VOID_DAYS = 7;    // un partido sin resultado 7 días después de su hora se da por aplazado/anulado y no cuenta
const DAY = 864e5;
const r4 = x => Math.round(x * 1e4) / 1e4;
const r2 = x => Math.round(x * 100) / 100;

// ---------- Guardar ----------
function makeRecord(m, a, now) {
  const { pr, ins, train } = a;
  if (!pr || !train.length) return null;
  const n = train.length, c = [0, 0, 0];
  let over = 0;
  for (const x of train) { c[x.score.h > x.score.a ? 0 : x.score.h === x.score.a ? 1 : 2]++; if (x.score.h + x.score.a > 2.5) over++; }
  const o = m.odds || {};
  return {
    id: m.id, l: m.leagueId, k: m.kickoff, h: { id: m.home.id, name: m.home.name }, a: { id: m.away.id, name: m.away.name },
    t: now.toISOString(), v: MODEL_VERSION,
    p: [r4(pr.p1), r4(pr.pX), r4(pr.p2)], o: r4(pr.over['2.5']), xg: [r2(pr.xg.h), r2(pr.xg.a)], g: [pr.games.h, pr.games.a],
    b: c.map(x => r4(x / n)), bo: r4(over / n),                      // base ingenua: frecuencias de la liga hasta ese día
    od: o.b365 || o.ou25 ? { b365: o.b365 || null, ou25: o.ou25 || null } : null, // cuotas Bet365 disponibles en ese momento
    fav: ins.favorites.map(f => ({ id: f.id, label: f.label, role: f.role, conf: f.conf, p: r4(f.p), odds: f.odds || null })),
    r: null,
  };
}

// ---------- Liquidar ----------
// ¿Se cumplió este favorito? 1/2/dc se calculan con el marcador; el resto son mercados de trends.js. null = la fuente no trae el dato.
export function pickOutcome(id, m) {
  if (!m || !m.score) return null;
  const { h, a } = m.score;
  if (id === '1') return h > a;
  if (id === '2') return a > h;
  if (id === 'dc1X') return h >= a;
  if (id === 'dcX2') return a >= h;
  return marketOutcome(id, m);
}

// Partido jugado que corresponde a un pronóstico: mismo id o, si el id cambió (hora distinta), mismos equipos con fecha a menos de 4 días.
export function findResult(matches, rec) {
  const fin = matches.filter(x => x.status === 'FT' && x.score);
  const byId = fin.find(x => x.id === rec.id);
  if (byId) return byId;
  const t = Date.parse(rec.k);
  return fin.find(x => x.home.id === rec.h.id && x.away.id === rec.a.id && Math.abs(Date.parse(x.kickoff) - t) < 4 * DAY) || null;
}
const settle = (rec, m, now) => ({ h: m.score.h, a: m.score.a, f: rec.fav.map(f => pickOutcome(f.id, m)), at: now.toISOString() });

// old: { records } guardado antes (o null). leagues: [{ id, matches, teams, prev }] con los datos actuales. Devuelve { history, stats, changed }.
export function updateHistory(old, leagues, { now = new Date() } = {}) {
  const nowMs = now.getTime(), by = new Map((old?.records || []).map(r => [r.id, structuredClone(r)]));
  const stats = { nuevos: 0, actualizados: 0, liquidados: 0, sinModelo: 0 };
  for (const lg of leagues) {
    for (const m of lg.matches) {
      if (m.status !== 'NS' || !(Date.parse(m.kickoff) > nowMs)) continue; // solo partidos que aún no han empezado
      const cur = by.get(m.id);
      if (cur && cur.r) continue;
      const rec = makeRecord({ ...m, leagueId: m.leagueId || lg.id }, analyze({ m, all: lg.matches, prevAll: lg.prev || [], teams: lg.teams || [], withBacktest: false, withStandings: false }), now);
      if (!rec) { stats.sinModelo++; continue; }
      if (!cur) { by.set(m.id, rec); stats.nuevos++; }
      else if (JSON.stringify({ ...cur, t: 0 }) !== JSON.stringify({ ...rec, t: 0 })) { by.set(m.id, rec); stats.actualizados++; } // si nada cambió se conserva la hora de guardado
    }
    for (const rec of by.values()) {
      if (rec.r || rec.l !== lg.id) continue;
      const m = findResult(lg.matches, rec);
      if (m) { rec.r = settle(rec, m, now); delete rec.x; stats.liquidados++; }
    }
  }
  for (const rec of by.values()) if (!rec.r && Date.parse(rec.k) < nowMs - VOID_DAYS * DAY) rec.x = 1;
  const records = [...by.values()].sort((a, b) => a.k < b.k ? -1 : a.k > b.k ? 1 : a.id < b.id ? -1 : 1);
  const changed = JSON.stringify(records) !== JSON.stringify(old?.records || []);
  return { history: { version: 1, updated: changed || !old?.updated ? now.toISOString() : old.updated, records }, stats, changed };
}

// ---------- Estadísticas ----------
export const result1x2 = r => r.h > r.a ? 0 : r.h === r.a ? 1 : 2;
const sq = (p, y) => p.reduce((s, pk, k) => s + (pk - (k === y ? 1 : 0)) ** 2, 0);   // Brier multiclase (igual que poisson.backtest)
const ll = (p, y) => -Math.log(Math.max(p[y], 1e-12));
// Probabilidades que implica la cuota quitando el margen de la casa (reparto proporcional). null si falta alguna cuota.
export const implied = odds => {
  if (!Array.isArray(odds) || odds.length < 2 || odds.some(o => !(o > 1))) return null;
  const q = odds.map(o => 1 / o), s = q.reduce((a, b) => a + b, 0);
  return q.map(x => x / s);
};
// Intervalo de Wilson al 95% para k aciertos de n.
export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - w) / d, (c + w) / d];
}
const sum = xs => xs.reduce((a, b) => a + b, 0);
const avg = xs => xs.length ? sum(xs) / xs.length : null;
// Media y error típico de una lista de diferencias pareadas (modelo − referencia). Negativo = el modelo va mejor (menor error).
export function meanSe(xs) {
  const n = xs.length;
  if (!n) return null;
  const m = sum(xs) / n;
  return { n, mean: m, se: n > 1 ? Math.sqrt(sum(xs.map(x => (x - m) ** 2)) / (n - 1) / n) : null };
}

// Rentabilidad por unidad apostada (ROI) y su error típico: el azar solo ya mueve el ROI ±2·se con pocas apuestas.
const roiOf = xs => { const m = meanSe(xs); return { roi: m ? m.mean : null, se: m ? m.se : null }; };

const BINS = [0, 0.15, 0.25, 0.35, 0.45, 0.55, 0.7, 1.0001];

// records: lista guardada. opts.league filtra por liga. Solo cuenta la versión vigente del modelo.
export function summarize(records, { version = MODEL_VERSION, league = null, now = new Date() } = {}) {
  const all = records.filter(r => !league || r.l === league);
  const cur = all.filter(r => r.v === version);
  const settled = cur.filter(r => r.r), pending = cur.filter(r => !r.r && !r.x), voided = cur.filter(r => !r.r && r.x);
  const out = { version, total: cur.length, settled: settled.length, pending: pending.length, void: voided.length, otherVersions: all.length - cur.length,
    since: cur.length ? cur.map(r => r.t).sort()[0] : null, x12: null, ou: null, calib: [], favs: null, value: null };
  if (!settled.length) return out;

  // 1X2: modelo contra base ingenua (frecuencias de la liga) y contra el mercado (cuotas Bet365 sin margen)
  const rows = settled.map(r => { const y = result1x2(r.r); return { r, y, mk: implied(r.od?.b365) }; });
  const mine = rows.map(x => sq(x.r.p, x.y)), base = rows.map(x => sq(x.r.b, x.y));
  const withMk = rows.filter(x => x.mk && x.mk.length === 3);
  out.x12 = {
    n: rows.length,
    model: { brier: avg(mine), logloss: avg(rows.map(x => ll(x.r.p, x.y))), hit: avg(rows.map(x => x.r.p.indexOf(Math.max(...x.r.p)) === x.y ? 1 : 0)) },
    base: { brier: avg(base), logloss: avg(rows.map(x => ll(x.r.b, x.y))) },
    vsBase: meanSe(rows.map((x, i) => mine[i] - base[i])),
    market: withMk.length ? {
      n: withMk.length, brier: avg(withMk.map(x => sq(x.mk, x.y))), logloss: avg(withMk.map(x => ll(x.mk, x.y))), hit: avg(withMk.map(x => x.mk.indexOf(Math.max(...x.mk)) === x.y ? 1 : 0)),
      modelBrier: avg(withMk.map(x => sq(x.r.p, x.y))), vsModel: meanSe(withMk.map(x => sq(x.r.p, x.y) - sq(x.mk, x.y))),
    } : null,
  };

  // Más/menos 2,5 goles (error cuadrático de la probabilidad de "más de 2,5", como poisson.backtest)
  const ou = settled.map(r => ({ r, y: r.r.h + r.r.a > 2.5 ? 1 : 0, mk: implied(r.od?.ou25) }));
  const ouMk = ou.filter(x => x.mk);
  out.ou = {
    n: ou.length, model: avg(ou.map(x => (x.r.o - x.y) ** 2)), base: avg(ou.map(x => (x.r.bo - x.y) ** 2)),
    vsBase: meanSe(ou.map(x => (x.r.o - x.y) ** 2 - (x.r.bo - x.y) ** 2)),
    market: ouMk.length ? { n: ouMk.length, brier: avg(ouMk.map(x => (x.mk[0] - x.y) ** 2)), modelBrier: avg(ouMk.map(x => (x.r.o - x.y) ** 2)), vsModel: meanSe(ouMk.map(x => (x.r.o - x.y) ** 2 - (x.mk[0] - x.y) ** 2)) } : null,
  };

  // Calibración: de todas las veces que el modelo dio ~X% a un resultado 1X2, ¿cuántas ocurrieron?
  const cb = BINS.slice(0, -1).map((lo, i) => ({ lo, hi: Math.min(BINS[i + 1], 1), n: 0, ps: 0, k: 0 }));
  for (const x of rows) x.r.p.forEach((p, k) => { const b = cb.find(z => p >= z.lo && p < BINS[cb.indexOf(z) + 1]); b.n++; b.ps += p; b.k += k === x.y ? 1 : 0; });
  out.calib = cb.filter(b => b.n).map(b => ({ lo: b.lo, hi: b.hi, n: b.n, pred: b.ps / b.n, obs: b.k / b.n }));

  // Favoritos de la lectura del partido
  const fv = [];
  for (const r of settled) r.fav.forEach((f, i) => { const hit = r.r.f[i]; if (hit === true || hit === false) fv.push({ f, hit, r }); });
  if (fv.length) {
    const k = fv.filter(x => x.hit).length, priced = fv.filter(x => x.f.odds > 1), pk = priced.filter(x => x.hit).length;
    const grp = c => { const g = fv.filter(x => x.f.conf === c); return g.length ? { conf: c, n: g.length, k: g.filter(x => x.hit).length, pred: avg(g.map(x => x.f.p)) } : null; };
    out.favs = {
      n: fv.length, k, rate: k / fv.length, ci: wilson(k, fv.length), pred: avg(fv.map(x => x.f.p)), unknown: settled.reduce((s, r) => s + r.r.f.filter(v => v == null).length, 0),
      priced: priced.length ? { n: priced.length, k: pk, ...roiOf(priced.map(x => x.hit ? x.f.odds - 1 : -1)) } : null,
      byConf: ['alta', 'media', 'baja'].map(grp).filter(Boolean),
    };
  }

  // Apuestas de valor teóricas: selecciones con cuota Bet365 y valor esperado >= +5% según el modelo, 1 unidad cada una.
  const bets = [];
  for (const r of settled) {
    const y = result1x2(r.r), over = r.r.h + r.r.a > 2.5;
    if (r.od?.b365?.every(o => o > 1)) r.od.b365.forEach((od, k) => bets.push({ od, p: r.p[k], win: k === y, sel: ['1', 'X', '2'][k] }));
    if (r.od?.ou25?.every(o => o > 1)) bets.push({ od: r.od.ou25[0], p: r.o, win: over, sel: '+2,5' }, { od: r.od.ou25[1], p: 1 - r.o, win: !over, sel: '-2,5' });
  }
  const profit = bs => bs.map(b => b.win ? b.od - 1 : -1);
  const vb = bets.filter(b => b.p * b.od - 1 >= VALUE_EV);
  if (bets.length) out.value = {
    n: vb.length, k: vb.filter(b => b.win).length, ...roiOf(profit(vb)), avgOdds: avg(vb.map(b => b.od)), avgP: avg(vb.map(b => b.p)),
    baseline: { n: bets.length, ...roiOf(profit(bets)) },   // apostar a TODAS las selecciones: sirve de referencia (≈ −margen de la casa)
  };
  return out;
}
