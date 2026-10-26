// Contraste del modelo con el mercado (cuotas de la casa sin margen). En el Historial y en una prueba con 1.114 partidos reales, el mercado
// acierta más que el modelo y mezclarlos no mejora; cuando discrepan mucho (≥ 12 puntos) el mercado ganó con claridad. Por eso se avisa.
// Funciones puras. odds: { b365: [1, X, 2], ou25: [más 2,5, menos 2,5] } (cualquiera puede faltar).
import { implied } from './history.js';

export const DISAGREE = 0.12;   // diferencia (puntos de probabilidad) a partir de la cual se avisa
export const NOTICE = 0.08;     // diferencia a partir de la cual se menciona sin alarma
const argmax = a => a.indexOf(Math.max(...a));
const margin = o => o.reduce((s, x) => s + 1 / x, 0) - 1;

export function compareMarket(pr, odds) {
  const out = { x12: null, ou: null, level: null, tops: null };
  if (!pr || !odds) return out;
  const mk = implied(odds.b365);
  if (mk && mk.length === 3) {
    const model = [pr.p1, pr.pX, pr.p2], diff = model.map((p, k) => p - mk[k]), idx = argmax(diff.map(Math.abs));
    out.x12 = { model, market: mk, diff, margin: margin(odds.b365), maxAbs: Math.abs(diff[idx]), idx, modelTop: argmax(model), marketTop: argmax(mk) };
    out.level = out.x12.maxAbs >= DISAGREE ? 'alto' : out.x12.maxAbs >= NOTICE ? 'medio' : 'ok';
  }
  const mo = implied(odds.ou25);
  if (mo && mo.length === 2) {
    const model = [pr.over['2.5'], pr.under['2.5']];
    out.ou = { model, market: mo, diff: [model[0] - mo[0], model[1] - mo[1]], margin: margin(odds.ou25), maxAbs: Math.abs(model[0] - mo[0]) };
  }
  return out;
}
