// «Mis filtros» dentro del Historial: mide cada filtro con (1) el registro en vivo y (2) un recálculo con los partidos ya jugados.
import { data } from '../data/index.js';
import { analyze } from '../model/analyze.js';
import { findResult } from '../model/history.js';
import { SOURCES, marketLabel, evalFilter, probOf } from '../model/filters.js';
import { summarize, forFilter, liveRows, sigOf } from '../model/filterstats.js';
import { loadFilters, loadLog } from '../filterstore.js';
import { esc } from '../ui.js';

const DAYS = 45;
const p0 = p => p == null ? '–' : Math.round(p * 100) + '%';
const sg = x => (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(1).replace('.', ',') + '%';
const played = new Map();                         // partido jugado de cada entrada del registro (una vez jugado es definitivo)
let bt = null;                                    // recálculo retrospectivo: { rows, at, days }
const btCache = new Map();                        // firma del filtro → resumen

async function loadPlayed(entries) {
  const byLeague = new Map();
  for (const e of entries) {
    if (played.has(e.mid)) continue;
    let m = null; try { m = await data.match(e.mid); } catch { /* sin datos */ }
    if (m && m.status === 'FT' && m.score) { played.set(e.mid, m); continue; }
    if (!byLeague.has(e.l)) byLeague.set(e.l, []);
    byLeague.get(e.l).push(e);
  }
  for (const [lg, list] of byLeague) {
    let ms = []; try { ms = await data.matches({ leagueId: lg }); } catch { /* sin datos */ }
    for (const e of list) { const m = findResult(ms, { id: e.mid, k: e.k, h: e.h, a: e.a }); if (m) played.set(e.mid, m); }
  }
}

const verdict = (r, n) => {
  if (n < 30) return `<span class="mu">pocos datos</span>`;
  if (r.z == null) return '';
  return r.z >= 2 ? '<b class="ok">▲ más</b>' : r.z <= -2 ? '<b class="ko">▼ menos</b>' : '<span class="mu">≈ acorde</span>';
};
function table(f, st, withBase) {
  const rows = st.rules.map(r => `<tr><td class="l">${esc(marketLabel(r.rule.src, r.rule.mk))}<small>${r.rule.op === 'le' ? '≤' : '≥'} ${r.rule.v}% · ${SOURCES[r.rule.src].toLowerCase()}</small></td>
    <td><b>${r.n ? p0(r.rate) : '–'}</b><small>${r.k}/${r.n}</small></td><td>${p0(r.exp)}</td>${withBase ? `<td>${r.base ? p0(r.base.rate) : '–'}</td>` : ''}
    <td class="tl2">${verdict(r, r.n)}${r.roi && r.roi.n >= 10 ? `<small>rentab. ${sg(r.roi.mean)}${r.roi.se != null ? ` ± ${(2 * r.roi.se * 100).toFixed(0)}%` : ''}</small>` : ''}</td></tr>`).join('');
  return `<div class="card tw"><table class="tbl"><thead><tr><th class="l">Regla</th><th>Se cumplió</th><th>Esperado</th>${withBase ? '<th>Liga<small>en general</small></th>' : ''}<th></th></tr></thead><tbody>${rows}</tbody></table></div>
    ${st.joint ? `<p class="mu">Todas las reglas «al menos» a la vez: <b>${p0(st.joint.rate)}</b> (${st.joint.k}/${st.joint.n})${st.joint.ci ? `, margen de error ${p0(st.joint.ci[0])}–${p0(st.joint.ci[1])}` : ''}.</p>` : ''}`;
}
async function liveBlock(f) {
  const entries = forFilter(loadLog(), f); await loadPlayed(entries);
  const { rows, pending } = liveRows(entries, played);
  const head = `<div class="st"><span><b>En vivo</b> (partidos que el filtro enseñó antes de empezar)</span><span>${rows.length} comprobados · ${pending} pendientes</span></div>`;
  return head + (rows.length ? table(f, summarize(f, rows), false) : '<p class="mu">Aún no hay partidos comprobados. El filtro apunta los partidos cuando abres Inicio; se comprueban solos cuando terminan.</p>');
}
function btBlock(f) {
  const st = btCache.get(sigOf(f));
  if (!bt) return `<button type="button" class="btn" data-fh="run">Medir con los últimos ${DAYS} días (partidos ya jugados)</button>`;
  if (!st) return '<p class="mu">Sin datos para este filtro.</p>';
  return `<div class="st"><span><b>Retrospectivo</b> (últimos ${bt.days} días, ${bt.rows.length} partidos revisados)</span><span>${st.n} cumplen el filtro</span></div>
    ${st.n ? table(f, st, true) : '<p class="mu">En ese periodo ningún partido habría cumplido este filtro.</p>'}
    <p class="mu">Cada partido se evalúa solo con datos anteriores a él. Pero las cuotas son las de cierre de la fuente y, si ajustaste los porcentajes mirando esto, es a posteriori: lo honrado es el registro «En vivo».</p>`;
}
const filterCard = async f => `<div class="ff"><div class="ffh"><b>${esc(f.name)}</b>${f.on ? '' : '<span class="mu">apagado</span>'}</div>
  <p class="mu fdesc">${esc(f.rules.map(r => `${marketLabel(r.src, r.mk)} ${r.op === 'le' ? '≤' : '≥'} ${r.v}% (${SOURCES[r.src].toLowerCase()})`).join(' · '))}</p>
  <div id="fh-live-${esc(f.id)}">${await liveBlock(f)}</div><div class="fhbt" data-f="${esc(f.id)}">${btBlock(f)}</div></div>`;

async function inner() {
  const fs = loadFilters();
  if (!fs.length) return '<div class="card empty"><p>Aún no tienes filtros. Créalos en Inicio → Mis filtros y aquí verás si los partidos que cumplen tus porcentajes los cumplen de verdad.</p></div>';
  return (await Promise.all(fs.map(filterCard))).join('') + `<p class="mu">«Esperado» = media de la probabilidad que tenía cada partido cuando entró en el filtro. «Se cumplió» = cuántas veces ocurrió de verdad. «▲ más» / «▼ menos» = se cumplió más o menos de lo esperado por encima del ruido del azar (2 errores típicos). Si un filtro se cumple claramente MENOS de lo esperado, sus porcentajes eran demasiado optimistas. Que se cumpla lo esperado no significa que dé dinero: la cuota ya cobra esa probabilidad (ahí sirve la «rentab.»: apostar 1 unidad a cada partido, con su margen de error). Hacen falta muchos partidos: con menos de 30 no se concluye nada.</p>`;
}
const box = () => document.getElementById('fhist');
async function repaint() { const el = box(); if (el) el.innerHTML = await inner(); }

async function runBacktest(btn) {
  const set = t => { if (btn) btn.textContent = t; };
  set('Preparando…');
  const leagues = await data.leagues(), cut = Date.now() - DAYS * 864e5, rows = [];
  let todo = 0, done = 0; const jobs = [];
  for (const lg of leagues) {
    const [l, all, prevAll] = await Promise.all([data.league(lg.id), data.matches({ leagueId: lg.id }), data.prevMatches ? data.prevMatches(lg.id) : []]);
    const ms = all.filter(m => m.status === 'FT' && m.score && Date.parse(m.kickoff) > cut);
    todo += ms.length; jobs.push({ l, all, prevAll, ms });
  }
  for (const j of jobs) for (const m of j.ms) {
    const a = analyze({ m, all: j.all, prevAll: j.prevAll, teams: j.l.teams || [], withBacktest: false, withStandings: false });
    if (a.pr) rows.push({ m, pr: a.pr, tr: a.tr, odds: m.odds });
    if (++done % 40 === 0) { set(`Calculando ${done}/${todo}…`); await new Promise(r => setTimeout(r, 0)); }   // deja respirar a la pantalla
  }
  bt = { rows, days: DAYS };
  for (const f of loadFilters()) {
    const matched = rows.filter(r => evalFilter(f, { pr: r.pr, tr: r.tr, odds: r.odds }).ok).map(r => ({ m: r.m, vals: f.rules.map(rule => probOf(rule, { pr: r.pr, tr: r.tr, odds: r.odds })), odds: r.odds }));
    btCache.set(sigOf(f), summarize(f, matched, rows));
  }
  await repaint();
}

if (typeof document !== 'undefined' && !window.__filtrosHist) {
  window.__filtrosHist = true;
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-fh="run"]'); if (!b || !box()) return;
    b.disabled = true; runBacktest(b).catch(err => { b.disabled = false; b.textContent = 'No se pudo calcular: ' + err.message; });
  });
}

export async function misFiltrosHist() { return `<h2>Mis filtros</h2><div id="fhist">${await inner()}</div>`; }
