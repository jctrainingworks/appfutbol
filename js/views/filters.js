// «Mis filtros» en Inicio: reglas con tus porcentajes; la pantalla muestra solos los próximos partidos que las cumplen.
import { esc, fmtTime, dayLabel } from '../ui.js';
import { SOURCES, marketOptions, marketLabel, applyFilter, newFilter, newRule, exampleFilter, MAX_FILTERS, MAX_RULES } from '../model/filters.js';
import { loadFilters, saveFilters, loadLog, saveLog } from '../filterstore.js';
import { logHits } from '../model/filterstats.js';

let items = null, names = {}, filters = loadFilters();
const openLists = new Set();                      // filtros cuya lista de partidos está desplegada (por defecto, plegada)
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const short = iso => { const d = dayLabel(iso); return /^(Hoy|Mañana)/.test(d) ? d : new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }); };
const p0 = p => p == null ? '–' : Math.round(p * 100) + '%';
const sel = (opts, cur, attrs) => `<select ${attrs}>${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;

function ruleRow(f, r, i) {
  const a = `data-f="${esc(f.id)}" data-r="${i}"`;
  return `<div class="fr">${sel(Object.entries(SOURCES), r.src, `${a} data-k="src" aria-label="Fuente"`)}${sel(marketOptions(r.src), r.mk, `${a} data-k="mk" aria-label="Mercado"`)}
    <span class="fr2">${sel([['ge', 'al menos'], ['le', 'como máximo']], r.op, `${a} data-k="op" aria-label="Condición"`)}
    <input ${a} data-k="v" inputmode="numeric" value="${r.v}" aria-label="Porcentaje"><b>%</b>
    ${f.rules.length > 1 ? `<button type="button" class="bdel" data-act="delrule" ${a} aria-label="Quitar regla">✕</button>` : ''}</span></div>`;
}
function editor(f) {
  const a = `data-f="${esc(f.id)}"`;
  return `<details class="fold fed"><summary>Editar filtro</summary>
    <label class="flb">Nombre <input ${a} data-k="name" value="${esc(f.name)}" maxlength="40"></label>
    <p class="mu">Se muestran los partidos que cumplen TODAS estas reglas:</p>
    ${f.rules.map((r, i) => ruleRow(f, r, i)).join('')}
    ${f.rules.length < MAX_RULES ? `<button type="button" class="btn" data-act="addrule" ${a}>＋ Regla</button>` : ''}
    <label class="flc"><input type="checkbox" ${a} data-k="noDisagree"${f.noDisagree ? ' checked' : ''}> Descartar si el modelo y el mercado discrepan mucho (cuando hay cuotas)</label>
    <label class="flb">Mínimo de partidos previos por equipo <input ${a} data-k="minGames" inputmode="numeric" value="${f.minGames}" class="fnum"></label>
    <p class="mu"><b>Modelo</b> = probabilidad del modelo Poisson. <b>Tendencia</b> = cuántas veces se cumplió en los últimos partidos de ambos equipos (local en casa, visitante fuera). <b>Mercado</b> = lo que dicen las cuotas Bet365 sin margen (solo 1X2 y más/menos 2,5, y solo si ya hay cuotas). Si falta un dato, la regla no se cumple.</p>
    <button type="button" class="btn bd" data-act="delf" ${a}>Borrar este filtro</button></details>`;
}
function card(f) {
  const hits = items && f.on ? applyFilter(f, items) : null, a = `data-f="${esc(f.id)}"`;
  const rows = !f.on || !openLists.has(f.id) ? '' : !items ? '<p class="mu">Calculando partidos…</p>' : !hits.length ? '<p class="mu">Ningún partido encaja ahora mismo.</p>'
    : (() => { const row = ({ it, e }) => `<a class="hrow hoyr" href="#/analisis/${esc(it.m.id)}"><div class="hb"><b>${esc(it.m.home.name)} – ${esc(it.m.away.name)}</b>
        <span>${e.vals.map(v => `${esc(marketLabel(v.rule.src, v.rule.mk))}: <b>${p0(v.p)}</b> <small class="mu">${SOURCES[v.rule.src].toLowerCase()}</small>`).join(' · ')}</span><span class="mu">${esc(names[it.m.leagueId] || '')}</span></div>
        <div class="hs"><small class="mu">${short(it.m.kickoff)}</small><b>${fmtTime(it.m.kickoff)}</b></div></a>`;
      return `<div class="card list">${hits.slice(0, 8).map(row).join('')}</div>${hits.length > 8 ? `<details class="fold"><summary>Ver los ${hits.length - 8} restantes</summary><div class="card list">${hits.slice(8).map(row).join('')}</div></details>` : ''}`; })();
  const desc = f.rules.map(r => `${marketLabel(r.src, r.mk)} ${r.op === 'le' ? '≤' : '≥'} ${r.v}% (${SOURCES[r.src].toLowerCase()})`).join(' · ');
  return `<div class="ff"><div class="ffh"><label class="flc"><input type="checkbox" ${a} data-k="on"${f.on ? ' checked' : ''}> <b>${esc(f.name)}</b></label>${f.on && items ? `<button type="button" class="ftog" data-act="toggle" ${a} aria-expanded="${openLists.has(f.id)}">${hits.length} partido${hits.length === 1 ? '' : 's'} ${openLists.has(f.id) ? '▴' : '▾'}</button>` : ''}</div>
    <p class="mu fdesc">${esc(desc)}</p>${rows}${editor(f)}</div>`;
}
export function filtersHtml() {
  const body = filters.length ? filters.map(card).join('') : `<div class="card empty"><p>Crea un filtro con tus porcentajes y la app te enseñará sola los próximos partidos que lo cumplen. Puedes tener varios y activarlos o apagarlos.</p></div>`;
  return `${body}<div class="fbtns"><button type="button" class="btn" data-act="newf"${filters.length >= MAX_FILTERS ? ' disabled' : ''}>＋ Nuevo filtro</button>${filters.length ? '' : '<button type="button" class="btn" data-act="example">Crear el ejemplo: +1,5 al 80 % y +2,5 al 60 %</button>'}</div>
    <p class="mu">Los filtros se guardan en este móvil. Un filtro enseña partidos que cumplen tus números, no apuestas con ventaja: el filtro solo ordena, no sabe si el mercado ya cobra esa probabilidad.</p>`;
}
function render() {
  const el = document.getElementById('filtros'); if (!el) return;
  const open = [...el.querySelectorAll('details[open]')].map(d => d.querySelector('[data-f]')?.dataset.f);
  const y = window.scrollY, h = el.offsetHeight, ae = document.activeElement, inside = ae && el.contains(ae) && ae.dataset && ae.dataset.k;
  const key = inside ? ['f', 'r', 'k'].map(k => ae.dataset[k]) : null;
  el.style.minHeight = h + 'px';                                  // no encoger la página mientras se repinta (si no, el navegador salta de sitio)
  el.innerHTML = filtersHtml();
  el.querySelectorAll('details.fed').forEach(d => { if (open.includes(d.querySelector('[data-f]')?.dataset.f)) d.open = true; });
  window.scrollTo(0, y);
  if (key) { const sel = `[data-f="${key[0]}"]${key[1] != null ? `[data-r="${key[1]}"]` : ':not([data-r])'}[data-k="${key[2]}"]`; const n = el.querySelector(sel); if (n) n.focus({ preventScroll: true }); }
  el.style.minHeight = '';
  window.scrollTo(0, y);
}
// Guarda en el móvil los partidos que cada filtro activo enseña ANTES de empezar: es el registro honrado que luego mide el Historial.
function logLive() {
  if (!items) return;
  let log = loadLog(), n = 0;
  for (const f of filters) if (f.on) { const r = logHits(log, f, applyFilter(f, items)); log = r.log; n += r.added; }
  if (n) saveLog(log);
}
export function setItems(list, leagueNames) { items = list; names = leagueNames || {}; logLive(); render(); }
export const resetItems = () => { items = null; };
const persist = () => { saveFilters(filters); logLive(); };

if (typeof document !== 'undefined' && !window.__filtros) {
  window.__filtros = true;
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-act]'); if (!b || !document.getElementById('filtros')?.contains(b)) return;
    const f = filters.find(x => x.id === b.dataset.f), act = b.dataset.act;
    if (act === 'newf') { filters.push(newFilter(uid())); const nf = filters[filters.length - 1]; persist(); render(); document.querySelector(`#filtros details.fed [data-f="${nf.id}"]`)?.closest('details')?.setAttribute('open', ''); return; }
    if (act === 'example') { filters.push(exampleFilter(uid())); }
    else if (!f) return;
    else if (act === 'toggle') { if (openLists.has(f.id)) openLists.delete(f.id); else openLists.add(f.id); render(); return; }
    else if (act === 'addrule') f.rules.push(newRule());
    else if (act === 'delrule') f.rules.splice(+b.dataset.r, 1);
    else if (act === 'delf') { if (!confirm(`¿Borrar el filtro «${f.name}»?`)) return; filters = filters.filter(x => x !== f); }
    persist(); render();
  });
  document.addEventListener('change', e => {
    const el = e.target; if (!el.dataset || !el.dataset.k || !document.getElementById('filtros')?.contains(el)) return;
    const f = filters.find(x => x.id === el.dataset.f); if (!f) return;
    const k = el.dataset.k, r = el.dataset.r != null ? f.rules[+el.dataset.r] : null;
    if (r) {
      if (k === 'src') { r.src = el.value; if (!marketOptions(r.src).some(x => x[0] === r.mk)) r.mk = marketOptions(r.src)[0][0]; }
      else if (k === 'mk') r.mk = el.value; else if (k === 'op') r.op = el.value;
      else if (k === 'v') { const v = parseFloat(el.value.replace(',', '.')); r.v = Number.isFinite(v) ? Math.min(99, Math.max(1, Math.round(v))) : r.v; }
    } else if (k === 'name') f.name = el.value.trim().slice(0, 40) || 'Filtro';
    else if (k === 'on') f.on = el.checked; else if (k === 'noDisagree') f.noDisagree = el.checked;
    else if (k === 'minGames') { const v = parseInt(el.value, 10); f.minGames = Number.isFinite(v) ? Math.min(15, Math.max(0, v)) : f.minGames; }
    persist(); render();
  });
}
