// «Hoy»: semáforo por partido y selección sugerida. El MERCADO es la base (acierta más que el modelo, ver Historial) y el modelo solo
// confirma o desaconseja. Funciones puras.
//  🟢 verde: hay cuotas, modelo y mercado coinciden y existe una selección (1, 2, más o menos de 2,5) con probabilidad de mercado entre 55 % y 85 % que el modelo confirma.
//  🟡 amarillo: falta algo para decidir (sin cuotas, diferencia pequeña, partido parejo).
//  🔴 rojo: no mirar: muestra pequeña, sin estimación, o modelo y mercado discrepan mucho.
// Verde NO es «apuesta ganadora»: la cuota ya cobra esa probabilidad; solo significa que dos fuentes independientes dicen lo mismo.
import { compareMarket, NOTICE, DISAGREE } from './market.js';
import { implied } from './history.js';

export const PICK_MIN = 0.55;
export const PICK_MAX = 0.85;
export const MIN_GAMES = 5;
const ORDER = { green: 0, yellow: 1, red: 2 };

// Selecciones posibles con probabilidad de mercado (cuotas sin margen) y del modelo.
export function options(pr, odds, home, away) {
  const out = [], mk = implied(odds?.b365), ou = implied(odds?.ou25);
  if (mk && mk.length === 3) out.push(
    { key: '1', label: `Gana ${home}`, mk: mk[0], md: pr.p1 }, { key: '2', label: `Gana ${away}`, mk: mk[2], md: pr.p2 },
    { key: '1X', label: `${home} o empate`, mk: mk[0] + mk[1], md: pr.dc['1X'] }, { key: 'X2', label: `${away} o empate`, mk: mk[1] + mk[2], md: pr.dc['X2'] });
  if (ou && ou.length === 2) out.push(
    { key: 'o25', label: 'Más de 2,5 goles', mk: ou[0], md: pr.over['2.5'] }, { key: 'u25', label: 'Menos de 2,5 goles', mk: ou[1], md: pr.under['2.5'] });
  return out;
}

// pr: estimación del modelo (o null). m: partido con odds. Devuelve { light, reason, pick, level }.
export function rate(pr, m) {
  if (!pr) return { light: 'red', reason: 'Sin estimación: un equipo aún no tiene partidos.', pick: null, level: null };
  const g = Math.min(pr.games.h, pr.games.a);
  if (g < MIN_GAMES) return { light: 'red', reason: `Muy pocos partidos previos (${g}): estimación poco fiable.`, pick: null, level: null };
  const c = compareMarket(pr, m.odds);
  if (c.level === 'alto') return { light: 'red', reason: `Modelo y mercado no coinciden (${Math.round(c.x12.maxAbs * 100)} puntos): mejor evitar.`, pick: null, level: 'alto' };
  if (c.ou && c.ou.maxAbs >= DISAGREE) return { light: 'red', reason: `En goles, modelo y mercado no coinciden (${Math.round(c.ou.maxAbs * 100)} puntos): mejor evitar.`, pick: null, level: c.level };
  if (!c.x12) return { light: 'yellow', reason: c.ou ? 'Solo hay cuotas de goles: sin 1X2 para contrastar.' : 'Sin cuotas todavía: no se puede contrastar con el mercado.', pick: null, level: null };
  // La doble oportunidad (1X, X2) casi siempre supera el 55 %: dejaría en verde cualquier partido, así que no cuenta como candidata.
  const cand = options(pr, m.odds, m.home.name, m.away.name).filter(o => !['1X', 'X2'].includes(o.key) && o.mk >= PICK_MIN && o.mk <= PICK_MAX && Math.abs(o.md - o.mk) < NOTICE).sort((a, b) => b.mk - a.mk);
  if (c.level === 'medio') return { light: 'yellow', reason: 'Pequeña diferencia entre modelo y mercado: mejor no fiarse del todo.', pick: null, level: 'medio' };
  if (!cand.length) return { light: 'yellow', reason: 'Partido parejo: ninguna selección supera el 55 % en el mercado.', pick: null, level: 'ok' };
  const p = cand[0];
  return { light: 'green', reason: `${p.label}: mercado ${Math.round(p.mk * 100)} % · modelo ${Math.round(p.md * 100)} %`, pick: p, level: 'ok' };
}

// items: [{ m, r }] → ordenados verde, amarillo, rojo y por hora.
export const sortRated = items => [...items].sort((a, b) => ORDER[a.r.light] - ORDER[b.r.light] || (a.m.kickoff < b.m.kickoff ? -1 : a.m.kickoff > b.m.kickoff ? 1 : 0));
