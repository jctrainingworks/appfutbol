// Medición de los filtros personalizados: ¿los partidos que cumplen un filtro cumplen de verdad lo que el filtro decía?
// Dos fuentes: (1) registro EN VIVO (se guardan los partidos que el filtro enseñaba ANTES de empezar: es la prueba honrada) y
// (2) RETROSPECTIVO (se recalcula el filtro con los partidos ya jugados usando solo datos anteriores a cada uno; sirve para tener
// muestra ya, pero si ajustaste los porcentajes mirándolo es a posteriori). Funciones puras.
import { marketOutcome } from './trends.js';
import { wilson, meanSe } from './history.js';

const r4 = x => Math.round(x * 1e4) / 1e4;
// ¿Ocurrió el mercado de una regla? true/false, o null si la fuente no trae el dato (córners, tarjetas, descanso).
export function ruleOutcome(rule, m) {
  if (!m || !m.score) return null;
  const { h, a } = m.score;
  switch (rule.mk) {
    case '1': return h > a; case 'X': return h === a; case '2': return a > h;
    case '1X': return h >= a; case 'X2': return a >= h; case '12': return h !== a;
    default: return marketOutcome(rule.mk, m);
  }
}
// Cuota Bet365 del mercado de una regla (solo 1, X, 2 y más/menos 2,5).
export function oddsFor(mk, odds) {
  if (!odds) return null;
  const x = mk === '1' ? odds.b365?.[0] : mk === 'X' ? odds.b365?.[1] : mk === '2' ? odds.b365?.[2] : mk === 'ft_o25' ? odds.ou25?.[0] : mk === 'ft_u25' ? odds.ou25?.[1] : null;
  return x > 1 ? x : null;
}
export const sigOf = f => JSON.stringify([f.rules.map(r => [r.src, r.mk, r.op, r.v]), f.minGames, f.noDisagree]);

// matched: [{ m (jugado), vals: [prob de cada regla en ese momento], odds }]. universe: [{ m }] todos los partidos evaluados (para la tasa base) o null.
export function summarize(filter, matched, universe = null) {
  const rules = filter.rules.map((rule, i) => {
    let n = 0, k = 0, sp = 0, spv = 0;
    const profits = [];
    for (const row of matched) {
      const y = ruleOutcome(rule, row.m); if (y == null) continue;
      const p = row.vals[i]; n++; if (y) k++;
      if (p != null) { sp += p; spv += p * (1 - p); }
      const od = oddsFor(rule.mk, row.odds); if (od) profits.push(y ? od - 1 : -1);
    }
    let bn = 0, bk = 0;
    if (universe) for (const u of universe) { const y = ruleOutcome(rule, u.m); if (y == null) continue; bn++; if (y) bk++; }
    const ms = meanSe(profits);
    return {
      rule, n, k, rate: n ? k / n : null, ci: wilson(k, n), exp: n ? sp / n : null,
      z: n && spv > 0 ? (k - sp) / Math.sqrt(spv) : null,                       // diferencia entre aciertos y lo esperado, en errores típicos
      base: universe && bn ? { n: bn, rate: bk / bn } : null,
      roi: ms && ms.n ? { n: ms.n, mean: ms.mean, se: ms.se } : null,
    };
  });
  const ge = filter.rules.map((r, i) => [r, i]).filter(([r]) => r.op === 'ge');
  let jn = 0, jk = 0;
  if (ge.length > 1) for (const row of matched) { const ys = ge.map(([r]) => ruleOutcome(r, row.m)); if (ys.some(y => y == null)) continue; jn++; if (ys.every(Boolean)) jk++; }
  return { n: matched.length, rules, joint: jn ? { n: jn, k: jk, rate: jk / jn, ci: wilson(jk, jn) } : null };
}

// ---- Registro en vivo (guardado en el móvil) ----
export const MAX_LOG = 3000;
// hits: [{ it: { m }, e: { vals } }] de applyFilter. Solo se guardan partidos que aún no han empezado y solo la primera vez que se ven.
export function logHits(log, filter, hits, now = Date.now()) {
  const s = sigOf(filter), have = new Set(log.filter(e => e.f === filter.id && e.s === s).map(e => e.mid)), add = [];
  for (const { it, e } of hits) {
    const m = it.m; if (have.has(m.id) || !(Date.parse(m.kickoff) > now)) continue;
    add.push({ f: filter.id, s, mid: m.id, l: m.leagueId, k: m.kickoff, h: { id: m.home.id, name: m.home.name }, a: { id: m.away.id, name: m.away.name }, t: new Date(now).toISOString(),
      p: e.vals.map(v => v.p == null ? null : r4(v.p)), od: m.odds && (m.odds.b365 || m.odds.ou25) ? { b365: m.odds.b365 || null, ou25: m.odds.ou25 || null } : null });
  }
  if (!add.length) return { log, added: 0 };
  return { log: [...log, ...add].slice(-MAX_LOG), added: add.length };
}
export function sanitizeLog(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(e => e && typeof e.f === 'string' && typeof e.s === 'string' && typeof e.mid === 'string' && typeof e.k === 'string' && e.h && e.a && Array.isArray(e.p)).slice(-MAX_LOG);
}
export const forFilter = (log, f) => { const s = sigOf(f); return log.filter(e => e.f === f.id && e.s === s); };
// results: Map mid → partido jugado. Devuelve las filas para summarize y cuántas siguen pendientes.
export function liveRows(entries, results) {
  const rows = []; let pending = 0;
  for (const e of entries) { const m = results.get(e.mid); if (m && m.status === 'FT' && m.score) rows.push({ m, vals: e.p, odds: e.od }); else pending++; }
  return { rows, pending };
}
