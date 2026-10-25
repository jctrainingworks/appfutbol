// «Mis apuestas» dentro del Historial: tus apuestas reales (registradas desde la calculadora de Análisis), comprobadas solas con el resultado.
// Se guardan en este móvil (js/betstore.js); la copia de seguridad permite pasarlas a otro dispositivo o recuperarlas.
import { data } from '../data/index.js';
import { findResult } from '../model/history.js';
import { betOutcome, betProfit, summarizeBets, removeBet, setStake, parseBackup, backupText } from '../model/bets.js';
import { loadBets, saveBets } from '../betstore.js';
import { esc } from '../ui.js';

const pc0 = p => p == null ? '–' : Math.round(p * 100) + '%';
const pc1 = p => p == null ? '–' : (p * 100).toFixed(1).replace('.', ',') + '%';
const u = (x, d = 2) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d).replace('.', ',');
const dec = x => x.toFixed(2).replace('.', ',');
const fdate = iso => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

// Partido jugado de cada apuesta (una vez jugado es definitivo, se recuerda). Solo se consulta la liga de las apuestas sin resultado.
const played = new Map();
async function loadResults(bets) {
  const todo = bets.filter(b => !played.has(b.id));
  const byLeague = new Map();
  for (const b of todo) {
    let m = null;
    try { m = await data.match(b.mid); } catch { /* sin datos */ }
    if (m && m.status === 'FT' && m.score) { played.set(b.id, m); continue; }
    if (!byLeague.has(b.l)) byLeague.set(b.l, []);
    byLeague.get(b.l).push(b);
  }
  for (const [lg, list] of byLeague) {
    let ms = [];
    try { ms = await data.matches({ leagueId: lg }); } catch { /* sin datos */ }
    for (const b of list) { const m = findResult(ms, { id: b.mid, k: b.k, h: b.h, a: b.a }); if (m) played.set(b.id, m); }  // el id pudo cambiar si cambió la hora
  }
}
const outcomeOf = b => betOutcome(b, played.get(b.id));

function row(b) {
  const m = played.get(b.id), won = outcomeOf(b);
  const state = won === null ? '<span class="mu">pendiente</span>' : `<b class="${won ? 'ok' : 'ko'}">${u(betProfit(b, won))}</b><small class="mu">${m.score.h}-${m.score.a}</small>`;
  return `<div class="hrow brow"><div class="hd">${fdate(b.k)}</div>
    <div class="hb"><b>${esc(b.h.name)} – ${esc(b.a.name)}</b>
      <span>${esc(b.label)} <b>@ ${dec(b.odds)}</b>${b.p != null ? ` <small class="mu">modelo ${pc0(b.p)}</small>` : ''}</span>
      <label class="stk">Importe <input class="si" inputmode="decimal" value="${String(b.stake).replace('.', ',')}" data-id="${esc(b.id)}" aria-label="Importe de la apuesta"></label></div>
    <div class="hs bst">${state}<button type="button" class="bdel" data-id="${esc(b.id)}" aria-label="Borrar apuesta">✕</button></div></div>`;
}

function html(bets) {
  const s = summarizeBets(bets, outcomeOf), list = [...bets].sort((a, b) => a.k < b.k ? 1 : a.k > b.k ? -1 : 0);
  const buttons = `<div class="bk"><button type="button" class="btn" id="bk-copy">Copiar copia de seguridad</button><button type="button" class="btn" id="bk-restore">Restaurar copia</button></div>
    <p class="mu bk-note" role="status" id="bk-note">Tus apuestas se guardan en este móvil. Si borras los datos del navegador se pierden: copia la copia de seguridad y guárdala (Notas, un mensaje a ti mismo).</p>`;
  if (!bets.length) return `<div class="card empty"><p>Aún no has registrado ninguna apuesta. En Análisis, abre un partido, escribe la cuota que ves en tu casa y pulsa ＋: aquí se comprobará sola con el resultado y verás tu beneficio y si aciertas más o menos de lo que el modelo esperaba.</p></div>${buttons}`;
  const e = s.expected;
  const kpi = `<div class="card"><div class="vk" style="grid-template-columns:repeat(3,1fr)"><div><b>${s.total}</b><small>apuestas (${s.pending} pendientes)</small></div>
      <div><b>${s.won}/${s.settled}</b><small>ganadas</small></div>
      <div><b class="${s.settled ? (s.profit >= 0 ? 'ok' : 'ko') : ''}">${s.settled ? u(s.profit) : '–'}</b><small>beneficio (unidades)</small></div></div>
    ${s.settled ? `<div class="st" style="margin-top:10px"><span>Rentabilidad sobre lo apostado (${dec(s.staked)} u.)</span><span><b class="ev ${s.roi >= 0 ? 'up' : 'dn'}">${u(s.roi * 100, 1)}%</b>${s.roiSe != null && s.settled >= 10 ? ` ± ${pc1(2 * s.roiSe)}` : ''}</span></div>
    ${e ? `<div class="st"><span>Ganadas: el modelo esperaba (${e.n} con probabilidad guardada)</span><span>${e.hits.toFixed(1).replace('.', ',')} · real ${e.won}</span></div>
    <div class="st"><span>Beneficio esperado por el modelo / real</span><span>${u(e.profit)} / ${u(e.profitReal)}</span></div>` : ''}` : ''}
    <p class="mu" style="margin-top:8px">${s.settled < 30 ? `Con ${s.settled} apuesta${s.settled === 1 ? '' : 's'} comprobada${s.settled === 1 ? '' : 's'} el resultado depende casi todo del azar: no saques conclusiones todavía. ` : ''}El «±» es el ruido que el azar produce por sí solo (2 errores típicos). Si ganas menos de lo que el modelo esperaba de forma sostenida, el «valor» que veías no era real.</p></div>`;
  return `${kpi}<div class="card list" style="margin-top:12px">${list.map(row).join('')}</div>${buttons}`;
}

const box = () => document.getElementById('mybets');
async function refresh() { const b = loadBets(); await loadResults(b); const el = box(); if (el) el.innerHTML = html(b); }
const note = t => { const n = document.getElementById('bk-note'); if (n) n.textContent = t; };

if (typeof document !== 'undefined' && !window.__misApuestas) {
  window.__misApuestas = true;
  document.addEventListener('change', e => {
    const el = e.target; if (!el.classList || !el.classList.contains('si')) return;
    const v = parseFloat(el.value.replace(',', '.'));
    if (v > 0) saveBets(setStake(loadBets(), el.dataset.id, v));
    refresh();
  });
  document.addEventListener('click', async e => {
    const t = e.target.closest && e.target.closest('button'); if (!t || !box()) return;
    if (t.classList.contains('bdel')) {
      if (confirm('¿Borrar esta apuesta?')) { saveBets(removeBet(loadBets(), t.dataset.id)); refresh(); }
    } else if (t.id === 'bk-copy') {
      const text = backupText(loadBets());
      try { await navigator.clipboard.writeText(text); note('Copia en el portapapeles. Pégala en Notas o envíatela por mensaje para guardarla.'); }
      catch { prompt('Copia todo este texto y guárdalo:', text); }
    } else if (t.id === 'bk-restore') {
      const text = prompt('Pega aquí la copia de seguridad:'); if (!text) return;
      const r = parseBackup(text);
      if (!r.ok) { note(`No se restauró nada: ${r.error}`); return; }
      const now = loadBets().length;
      if (!confirm(`Esto sustituye tus ${now} apuesta${now === 1 ? '' : 's'} actuales por las ${r.bets.length} de la copia. ¿Seguir?`)) return;
      note(saveBets(r.bets) ? `Restauradas ${r.bets.length} apuestas.` : 'No se pudo guardar: el navegador bloquea el almacenamiento.');
      await refresh(); note(`Restauradas ${r.bets.length} apuestas.`);
    }
  });
}

// Devuelve el bloque HTML de «Mis apuestas» para el Historial.
export async function misApuestas() {
  const bets = loadBets();
  await loadResults(bets);
  return `<h2>Mis apuestas</h2><div id="mybets">${html(bets)}</div>`;
}
