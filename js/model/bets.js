// Registro de TUS apuestas reales: mercado, tu cuota, importe y la probabilidad que daba el modelo en ese momento.
// Se comprueban solas con el resultado del partido. Funciones puras (sin red ni almacenamiento): el guardado en el móvil está en js/betstore.js.
import { meanSe } from './history.js';

// Mercados que se pueden registrar (los de la calculadora de Análisis) y cómo se comprueban con el marcador.
export const SELECTIONS = {
  '1': s => s.h > s.a, X: s => s.h === s.a, '2': s => s.a > s.h,
  '1X': s => s.h >= s.a, X2: s => s.a >= s.h, '12': s => s.h !== s.a,
  o15: s => s.h + s.a >= 2, o25: s => s.h + s.a >= 3, u25: s => s.h + s.a <= 2, o35: s => s.h + s.a >= 4,
  btts: s => s.h > 0 && s.a > 0, nobtts: s => s.h === 0 || s.a === 0,
};
export const MAX_BETS = 5000;

// ¿Ganó la apuesta? true/false, o null si el partido aún no tiene resultado.
export const betOutcome = (bet, match) => match && match.status === 'FT' && match.score && SELECTIONS[bet.key] ? SELECTIONS[bet.key](match.score) : null;
// Beneficio en las unidades del importe: gana importe × (cuota − 1), pierde el importe.
export const betProfit = (bet, won) => won ? bet.stake * (bet.odds - 1) : -bet.stake;

// Añade la apuesta o, si ya había una del mismo partido y mercado, actualiza su cuota y probabilidad (conserva su importe).
export function upsertBet(list, bet) {
  const i = list.findIndex(b => b.mid === bet.mid && b.key === bet.key);
  if (i < 0) return { list: [...list, bet], updated: false };
  const next = list.slice();
  next[i] = { ...list[i], odds: bet.odds, p: bet.p, t: bet.t };
  return { list: next, updated: true };
}
export const removeBet = (list, id) => list.filter(b => b.id !== id);
export const setStake = (list, id, stake) => list.map(b => b.id === id && stake > 0 && stake < 1e6 ? { ...b, stake } : b);

const okTeam = t => t && typeof t.id === 'string' && typeof t.name === 'string';
const okBet = b => b && typeof b === 'object' && typeof b.id === 'string' && typeof b.mid === 'string' && typeof b.l === 'string' && typeof b.k === 'string' && !Number.isNaN(Date.parse(b.k))
  && okTeam(b.h) && okTeam(b.a) && b.key in SELECTIONS && typeof b.label === 'string' && Number.isFinite(b.odds) && b.odds > 1 && Number.isFinite(b.stake) && b.stake > 0
  && (b.p == null || (Number.isFinite(b.p) && b.p > 0 && b.p < 1)) && typeof b.t === 'string';
// Lee una copia de seguridad (texto JSON). Solo acepta apuestas con todos los campos válidos; si algo no cuadra, no importa nada.
export function parseBackup(text) {
  let j;
  try { j = JSON.parse(text); } catch { return { ok: false, error: 'El texto no es una copia válida.' }; }
  const list = Array.isArray(j) ? j : j && Array.isArray(j.bets) ? j.bets : null;
  if (!list) return { ok: false, error: 'No contiene una lista de apuestas.' };
  if (list.length > MAX_BETS) return { ok: false, error: 'Demasiadas apuestas.' };
  const bad = list.findIndex(b => !okBet(b));
  if (bad >= 0) return { ok: false, error: `La apuesta número ${bad + 1} no es válida.` };
  if (new Set(list.map(b => b.id)).size !== list.length) return { ok: false, error: 'Hay apuestas repetidas.' };
  return { ok: true, bets: list.map(b => ({ id: b.id, mid: b.mid, l: b.l, k: b.k, h: { id: b.h.id, name: b.h.name }, a: { id: b.a.id, name: b.a.name }, key: b.key, label: b.label, odds: b.odds, stake: b.stake, p: b.p ?? null, t: b.t })) };
}
export const backupText = bets => JSON.stringify({ app: 'appfutbol', version: 1, bets });

// outcomeOf(bet) → true / false / null (sin resultado). Devuelve totales y comparación con lo que esperaba el modelo.
export function summarizeBets(bets, outcomeOf) {
  const rows = bets.map(b => ({ b, won: outcomeOf(b) }));
  const done = rows.filter(r => r.won === true || r.won === false), withP = done.filter(r => r.b.p != null);
  const staked = done.reduce((s, r) => s + r.b.stake, 0), profit = done.reduce((s, r) => s + betProfit(r.b, r.won), 0);
  const unit = meanSe(done.map(r => r.won ? r.b.odds - 1 : -1));   // beneficio por unidad de cada apuesta (para el ruido del azar)
  return {
    total: bets.length, settled: done.length, pending: bets.length - done.length,
    won: done.filter(r => r.won).length, staked, profit, roi: staked ? profit / staked : null, roiSe: unit ? unit.se : null,
    // Lo que el modelo esperaba de ESTAS apuestas (las que tienen probabilidad guardada): aciertos y beneficio
    expected: withP.length ? { n: withP.length, hits: withP.reduce((s, r) => s + r.b.p, 0), won: withP.filter(r => r.won).length, profit: withP.reduce((s, r) => s + r.b.stake * (r.b.p * r.b.odds - 1), 0), profitReal: withP.reduce((s, r) => s + betProfit(r.b, r.won), 0) } : null,
    avgOdds: done.length ? done.reduce((s, r) => s + r.b.odds, 0) / done.length : null,
  };
}

// ---------- Cuota de cierre (CLV) ----------
// La cuota de cierre es la última cuota Bet365 que guardó el Historial antes del partido (se refresca cada ~4 h hasta el inicio, luego queda congelada).
// CLV = tu cuota / cuota de cierre − 1. Positivo = cogiste mejor precio que el cierre. Solo existe para 1, X, 2, más/menos 2,5 (lo que trae la fuente).
const CLOSE = { '1': o => o.b365 && o.b365[0], X: o => o.b365 && o.b365[1], '2': o => o.b365 && o.b365[2], o25: o => o.ou25 && o.ou25[0], u25: o => o.ou25 && o.ou25[1] };
const DAY4 = 4 * 864e5;
export function closingFor(bet, records, now = Date.now()) {
  const f = CLOSE[bet.key]; if (!f || !records) return null;
  const k = Date.parse(bet.k);
  const r = records.find(x => x.id === bet.mid) || records.find(x => x.h.id === bet.h.id && x.a.id === bet.a.id && Math.abs(Date.parse(x.k) - k) < DAY4);
  if (!r || !r.od || Date.parse(r.k) > now) return null;     // sin cuotas guardadas, o el partido aún no ha empezado (la cuota todavía se mueve)
  const odds = f(r.od);
  return odds > 1 ? { odds, t: r.t } : null;
}
export const clvOf = (bet, closing) => closing ? bet.odds / closing.odds - 1 : null;
export function summarizeClv(bets, records, now = Date.now()) {
  const v = [];
  for (const b of bets) { const c = clvOf(b, closingFor(b, records, now)); if (c != null) v.push(c); }
  const n = v.length;
  return { n, of: bets.length, mean: n ? v.reduce((a, x) => a + x, 0) / n : null, better: v.filter(x => x > 0.0005).length, worse: v.filter(x => x < -0.0005).length };
}
