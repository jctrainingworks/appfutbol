// Filtros personalizados: «partidos con ≥ 80 % de más de 1,5 goles y ≥ 60 % de más de 2,5». Cada filtro es una lista de reglas (todas deben
// cumplirse) sobre una de tres fuentes de probabilidad y dos opciones de seguridad. Funciones puras; el guardado está en js/filterstore.js.
//  modelo  = probabilidad del modelo Poisson.      tend = frecuencia reciente de ambos equipos (últimos 10, suavizada, de Tendencias).
//  mercado = probabilidad implícita de las cuotas Bet365 sin margen (solo 1X2 y más/menos 2,5, y solo si hay cuotas).
// Si un dato no existe (p. ej. regla de mercado sin cuotas) la regla NO se cumple: nunca se supone.
import { GAME_MARKETS } from './trends.js';
import { implied } from './history.js';
import { compareMarket } from './market.js';

export const SOURCES = { modelo: 'Modelo', tend: 'Tendencia', mercado: 'Mercado' };
const WDL = [['1', 'Gana el local (1)'], ['X', 'Empate (X)'], ['2', 'Gana el visitante (2)'], ['1X', 'Local o empate (1X)'], ['X2', 'Empate o visitante (X2)'], ['12', 'Local o visitante (12)']];
const GOALS_MODEL = [['ft_o15', 'Más de 1,5 goles'], ['ft_o25', 'Más de 2,5 goles'], ['ft_o35', 'Más de 3,5 goles'], ['ft_u25', 'Menos de 2,5 goles'], ['btts', 'Ambos marcan: Sí'], ['nobtts', 'Ambos marcan: No'],
  ['ht_o05', '1ª parte: más de 0,5 goles'], ['ht_o15', '1ª parte: más de 1,5 goles'], ['h2_o05', '2ª parte: más de 0,5 goles'], ['h2_o15', '2ª parte: más de 1,5 goles']];
const GOALS_MARKET = [['ft_o25', 'Más de 2,5 goles'], ['ft_u25', 'Menos de 2,5 goles']];
const OPTIONS = {
  modelo: [...WDL, ...GOALS_MODEL],
  mercado: [...WDL, ...GOALS_MARKET],
  tend: GAME_MARKETS.map(m => [m.id, m.label]),
};
export const marketOptions = src => OPTIONS[src] || [];
export const marketLabel = (src, id) => (OPTIONS[src] || []).find(x => x[0] === id)?.[1] || id;

const MODEL = {
  '1': pr => pr.p1, X: pr => pr.pX, '2': pr => pr.p2, '1X': pr => pr.dc['1X'], X2: pr => pr.dc.X2, '12': pr => pr.dc['12'],
  ht_o05: pr => pr.halves ? pr.halves.ht.o05 : null, ht_o15: pr => pr.halves ? pr.halves.ht.o15 : null, h2_o05: pr => pr.halves ? pr.halves.h2.o05 : null, h2_o15: pr => pr.halves ? pr.halves.h2.o15 : null,
  ft_o15: pr => pr.over['1.5'], ft_o25: pr => pr.over['2.5'], ft_o35: pr => pr.over['3.5'], ft_u25: pr => pr.under['2.5'], btts: pr => pr.btts.si, nobtts: pr => pr.btts.no,
};
function marketP(id, odds) {
  const a = implied(odds?.b365), b = implied(odds?.ou25);
  if (a && a.length === 3) { if (id === '1') return a[0]; if (id === 'X') return a[1]; if (id === '2') return a[2]; if (id === '1X') return a[0] + a[1]; if (id === 'X2') return a[1] + a[2]; if (id === '12') return a[0] + a[2]; }
  if (b && b.length === 2) { if (id === 'ft_o25') return b[0]; if (id === 'ft_u25') return b[1]; }
  return null;
}
// ctx: { pr, tr, odds }. Devuelve la probabilidad (0-1) o null si no se puede saber.
export function probOf(rule, ctx) {
  if (rule.src === 'modelo') return ctx.pr && MODEL[rule.mk] ? MODEL[rule.mk](ctx.pr) : null;
  if (rule.src === 'tend') { const r = ctx.tr?.game?.find(x => x.id === rule.mk); return r ? r.avg : null; }
  if (rule.src === 'mercado') return marketP(rule.mk, ctx.odds);
  return null;
}

// Evalúa un filtro sobre un partido: { ok, why, vals: [{ rule, p, pass }] }.
export function evalFilter(f, ctx) {
  const vals = f.rules.map(rule => { const p = probOf(rule, ctx), t = rule.v / 100, pass = p != null && (rule.op === 'le' ? p <= t + 1e-9 : p >= t - 1e-9); return { rule, p, pass }; });
  const out = { ok: false, why: null, vals };
  if (!ctx.pr) { out.why = 'sin estimación del modelo'; return out; }
  if (f.minGames > 0 && Math.min(ctx.pr.games.h, ctx.pr.games.a) < f.minGames) { out.why = `menos de ${f.minGames} partidos previos`; return out; }
  if (f.noDisagree && ctx.odds) { const c = compareMarket(ctx.pr, ctx.odds); if (c.level === 'alto') { out.why = 'modelo y mercado discrepan mucho'; return out; } }
  const bad = vals.find(v => !v.pass);
  if (bad) { out.why = bad.p == null ? 'falta un dato' : 'no cumple una regla'; return out; }
  out.ok = true; return out;
}
// items: [{ m, pr, tr }] → partidos que cumplen el filtro (por hora).
export function applyFilter(f, items) {
  return items.map(it => ({ it, e: evalFilter(f, { pr: it.pr, tr: it.tr, odds: it.m.odds }) })).filter(x => x.e.ok).sort((a, b) => a.it.m.kickoff < b.it.m.kickoff ? -1 : a.it.m.kickoff > b.it.m.kickoff ? 1 : 0);
}

// ---- Alta y validación (lo guardado en el móvil puede estar roto o manipulado: se limpia todo) ----
export const MAX_FILTERS = 20, MAX_RULES = 8;
export const newRule = () => ({ src: 'modelo', mk: 'ft_o15', op: 'ge', v: 80 });
export const newFilter = (id, name = 'Nuevo filtro') => ({ id, name, on: true, minGames: 5, noDisagree: true, rules: [newRule()] });
export const exampleFilter = id => ({ id, name: 'Goles (ejemplo)', on: true, minGames: 5, noDisagree: true, rules: [{ src: 'modelo', mk: 'ft_o15', op: 'ge', v: 80 }, { src: 'modelo', mk: 'ft_o25', op: 'ge', v: 60 }] });

function cleanRule(r) {
  if (!r || typeof r !== 'object' || !OPTIONS[r.src] || !OPTIONS[r.src].some(x => x[0] === r.mk)) return null;
  const v = Number(r.v);
  return { src: r.src, mk: r.mk, op: r.op === 'le' ? 'le' : 'ge', v: Number.isFinite(v) ? Math.min(99, Math.max(1, Math.round(v))) : 50 };
}
export function sanitizeFilters(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(), out = [];
  for (const f of raw.slice(0, MAX_FILTERS)) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !f.id || seen.has(f.id)) continue;
    const rules = (Array.isArray(f.rules) ? f.rules : []).slice(0, MAX_RULES).map(cleanRule).filter(Boolean);
    if (!rules.length) continue;
    seen.add(f.id);
    const mg = Number(f.minGames);
    out.push({ id: f.id, name: String(f.name ?? '').slice(0, 40) || 'Filtro', on: f.on !== false, minGames: Number.isFinite(mg) ? Math.min(15, Math.max(0, Math.round(mg))) : 5, noDisagree: f.noDisagree !== false, rules });
  }
  return out;
}
