import { data } from '../data/index.js';
import { fairOdds, expectedValue } from '../model/poisson.js';
import { SMOOTH } from '../model/trends.js';
import { analyze } from '../model/analyze.js';
import { esc, crest, fmtTime, dayLabel, groupByDay, chips, empty, analysisTabs } from '../ui.js';

const pc = p => (p * 100).toFixed(1).replace('.', ',') + '%';
const odd = p => fairOdds(p).toFixed(2).replace('.', ',');
const f3 = x => x.toFixed(3).replace('.', ',');
const bar = (label, p) => `<div class="pb"><div class="pbh"><span>${label}</span><b>${pc(p)}</b><span class="mu">@ ${odd(p)}</span></div><div class="pbt"><i style="width:${(p * 100).toFixed(1)}%"></i></div></div>`;
const pct0 = p => p == null ? '–' : Math.round(p * 100) + '%';
const cell = (r, p) => `<td><b>${pct0(p)}</b><small>${r.k}/${r.n}</small></td>`;

function trendsHtml(tr, m, last, ord) {
  const href = (n, o) => `#/analisis/${esc(m.id)}?n=${n}&o=${o}`, N = last ? '10' : 'all';
  const sel = chips([[href('10', ord), 'Últimos 10', last === 10], [href('all', ord), 'Toda la temporada', last === 0]]) + chips([[href(N, 'p'), 'Más probables', ord === 'p'], [href(N, 'edge'), 'Mayor ventaja vs liga', ord === 'edge']]);
  if (ord === 'edge') tr = { ...tr, game: [...tr.game].sort((a, b) => b.edge - a.edge) };
  if (!tr.n.h || !tr.n.a) return `<h2>Mercados más probables</h2>${empty('Sin tendencias: alguno de los equipos aún no tiene partidos jugados como local/visitante en esta competición.')}`;
  const small = tr.n.h < 5 || tr.n.a < 5;
  const game = `<div class="card tw"><table class="tbl"><thead><tr><th class="l">Mercado del partido</th><th>${esc(m.home.name)}<small>en casa</small></th><th>${esc(m.away.name)}<small>fuera</small></th><th>Media</th><th>Liga</th></tr></thead><tbody>
    ${tr.game.map((r, i) => `<tr${i < 3 ? ' class="top"' : ''}><td class="l">${esc(r.label)}</td>${cell(r.h, r.ph)}${cell(r.a, r.pa)}<td><b>${pct0(r.avg)}</b></td><td>${pct0(r.pl)}</td></tr>`).join('')}</tbody></table></div>`;
  const team = `<div class="card tw"><table class="tbl"><thead><tr><th class="l">Por equipo</th><th>${esc(m.home.name)}<small>en casa</small></th><th>${esc(m.away.name)}<small>fuera</small></th><th>Liga</th></tr></thead><tbody>
    ${tr.team.map(r => `<tr><td class="l">${esc(r.label)}</td>${cell(r.h, r.ph)}${cell(r.a, r.pa)}<td>${pct0(r.pl)}</td></tr>`).join('')}</tbody></table></div>`;
  return `<h2>Mercados más probables</h2>${sel}
    ${small ? '<div class="demo">Muestra pequeña: algún equipo tiene menos de 5 partidos en esa condición. Los porcentajes son poco fiables.</div>' : ''}
    <p class="mu">Basado en ${tr.n.h} partidos de ${esc(m.home.name)} en casa y ${tr.n.a} de ${esc(m.away.name)} fuera. Orden: ${ord === 'edge' ? '«Media» menos «Liga» (qué mercados superan más a la media de la liga)' : '«Media» (de ambos equipos, suavizada hacia la media de la liga con ' + SMOOTH + ' partidos virtuales)'}. Los 3 primeros están marcados.</p>
    ${game}<div style="height:12px"></div>${team}
    <p class="mu" style="margin-top:6px">«k/n» = veces que se cumplió / partidos. Es lo que pasó, no una garantía de lo que pasará: compáralo siempre con la columna «Liga».
    ${tr.skipped ? ' Algunos mercados no se muestran porque la fuente no trae ese dato (descanso, corners o tarjetas) de suficientes partidos.' : ''} Tarjetas = amarillas + rojas.</p>`;
}

const evCls = ev => ev > 0.05 ? 'up' : ev < -0.05 ? 'dn' : '';
// Tarjeta de un vistazo: cómo se ve el partido y 1-2 mercados favoritos. Todo calculado por código (ver js/model/insight.js).
function insightHtml(ins) {
  const fav = f => `<div class="fav"><div class="favh"><span class="role">${esc(f.role)}</span><span class="conf c-${f.conf}">Confianza ${f.conf}</span></div>
    <div class="favm">${esc(f.label)}</div>
    <div class="favs"><b>${pct0(f.p)}</b><span>cuota justa ${odd(f.p)}</span>${f.odds ? `<span>Bet365 ${dec(f.odds)} · valor <b class="ev ${evCls(f.ev)}">${evTxt(f.ev)}</b></span>` : ''}</div>
    <div class="mu">${f.modelOnly ? 'Probabilidad del modelo Poisson.' : `Tendencia ${pct0(f.trend)}${f.model != null ? ` · modelo ${pct0(f.model)}${f.agree ? ' (coinciden)' : ''}` : ' · sin contraste del modelo'}`}${f.edge != null ? ` · ${f.edge >= 0 ? '+' : ''}${Math.round(f.edge * 100)} pts vs liga` : ''} · ${f.n} partidos</div></div>`;
  return `<h2>Lectura del partido</h2><div class="card read">
    ${ins.lines.map(t => `<p>${esc(t)}</p>`).join('') || '<p class="mu">Sin datos suficientes para una lectura.</p>'}
    ${ins.flags.length ? `<ul class="flags">${ins.flags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    ${ins.topTrend ? `<p class="mu">Patrón más marcado: <b>${esc(ins.topTrend.label)}</b> (${pct0(ins.topTrend.avg)}, ${Math.round(ins.topTrend.edge * 100) >= 0 ? '+' : ''}${Math.round(ins.topTrend.edge * 100)} pts sobre la media de la liga).</p>` : ''}</div>
    <h2>Mercados favoritos</h2>
    ${ins.favorites.length ? `<div class="grid">${ins.favorites.map(fav).join('')}</div>` : empty('Ningún mercado cumple los filtros (probabilidad entre 55% y 80%, muestra suficiente y tendencia y modelo de acuerdo). Mejor no forzar.')}
    <ul class="mu cav">${ins.caveats.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <p class="mu">Son frecuencias pasadas y un modelo simple, no una garantía ni una recomendación de apuesta.</p>`;
}

// ---- Veredicto de un vistazo (arriba del todo) ----
function verdictHtml(pr, m) {
  const seg = [['1', pr.p1, 'h'], ['X', pr.pX, 'x'], ['2', pr.p2, 'a']];
  const best = seg.reduce((a, b) => b[1] > a[1] ? b : a);
  return `<div class="card verdict"><div class="vt">Probabilidad del modelo (1X2)</div>
    <div class="sb">${seg.map(([k, p, c]) => `<i class="s-${c}${k === best[0] ? ' on' : ''}" style="flex:${p.toFixed(4)}"><b>${Math.round(p * 100)}%</b></i>`).join('')}</div>
    <div class="sbl"><span>${esc(m.home.name)}</span><span>Empate</span><span>${esc(m.away.name)}</span></div>
    <div class="vk"><div><b>${pr.xg.h.toFixed(2).replace('.', ',')} – ${pr.xg.a.toFixed(2).replace('.', ',')}</b><small>goles esperados</small></div>
      <div><b>${pct0(pr.over['2.5'])}</b><small>más de 2,5</small></div><div><b>${pct0(pr.btts.si)}</b><small>ambos marcan</small></div>
      <div><b>${pr.top[0].h}-${pr.top[0].a}</b><small>marcador más probable</small></div></div></div>`;
}

// ---- Calculadora de valor: cuota justa, cuota mínima con valor y valor esperado con TU cuota (se guarda en el móvil) ----
const MIN_EDGE = 1.05; // se pide al menos un 5% sobre la cuota justa para llamarlo "valor": margen de error del modelo
const calcRows = (pr, m) => [
  [`1 · ${m.home.name}`, pr.p1, 'b365:0'], ['X · Empate', pr.pX, 'b365:1'], [`2 · ${m.away.name}`, pr.p2, 'b365:2'],
  ['1X', pr.dc['1X']], ['X2', pr.dc['X2']], ['12', pr.dc['12']],
  ['Más de 1,5 goles', pr.over['1.5']], ['Más de 2,5 goles', pr.over['2.5'], 'ou25:0'], ['Menos de 2,5 goles', pr.under['2.5'], 'ou25:1'], ['Más de 3,5 goles', pr.over['3.5']],
  ['Ambos marcan: Sí', pr.btts.si], ['Ambos marcan: No', pr.btts.no],
];
const LS = 'futbol-cuotas-v1';
const store = { get() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } }, set(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch { /* sin almacenamiento */ } } };
const evBadge = (p, od) => { const ev = expectedValue(p, od); return `<b class="ev ${evCls(ev)}">${evTxt(ev)}</b>`; };

function calcHtml(pr, m, bt) {
  const saved = store.get()[m.id] || {}, o = m.odds || {};
  const rows = calcRows(pr, m).map(([label, p, src], i) => {
    const [k, j] = (src || '').split(':'), auto = k && o[k] ? o[k][+j] : null, val = saved[i] ?? auto ?? '';
    return `<tr data-p="${p}"><td class="l">${esc(label)}</td><td><b>${pct0(p)}</b><small>@ ${odd(p)}</small></td><td class="mn">${dec(fairOdds(p) * MIN_EDGE)}</td>
      <td><input class="oi" inputmode="decimal" placeholder="cuota" data-m="${esc(m.id)}" data-i="${i}" value="${val === '' ? '' : String(val).replace('.', ',')}" aria-label="Cuota para ${esc(label)}"></td><td class="ev-c">${val === '' ? '–' : evBadge(p, +val)}</td></tr>`;
  }).join('');
  const warn = bt && !bt.beatsBase ? 'En esta muestra el modelo NO mejora a la base ingenua en 1X2: no uses estos valores.' : 'Modelo simple, sin lesiones ni alineaciones: un valor positivo es una pista para investigar, no una apuesta rentable asegurada.';
  return `<div class="card tw"><table class="tbl calc"><thead><tr><th class="l">Mercado</th><th>Prob.<small>cuota justa</small></th><th>Mín.<small>con valor</small></th><th>Tu cuota</th><th>Valor</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="mu" style="margin-top:6px"><b>Cuota mín. valor</b> = cuota justa + 5%: por debajo de eso no compensa el error del modelo. Escribe la cuota que ves en tu casa de apuestas (se guarda en este móvil) y verás el valor esperado teórico (prob. × cuota − 1). Las cuotas Bet365 de la fuente aparecen ya rellenas cuando existen. ${warn}</p>`;
}

// Una sola escucha: recalcula el valor al escribir una cuota y la guarda.
if (typeof document !== 'undefined') document.addEventListener('input', e => {
  const el = e.target; if (!el.classList || !el.classList.contains('oi')) return;
  const tr = el.closest('tr'), p = +tr.dataset.p, v = parseFloat(el.value.replace(',', '.')), cellEv = tr.querySelector('.ev-c');
  cellEv.innerHTML = v > 1 ? evBadge(p, v) : '–';
  const all = store.get(), cur = all[el.dataset.m] || {};
  if (v > 1) cur[el.dataset.i] = v; else delete cur[el.dataset.i];
  all[el.dataset.m] = cur; store.set(all);
});

const fold = (title, body, open = false) => `<details class="fold"${open ? ' open' : ''}><summary>${title}</summary>${body}</details>`;

const demoNote = () => data.meta.isDemo ? '<div class="demo"><b>Sobre datos de demostración.</b> Las probabilidades se calculan con partidos ficticios: solo sirven para revisar la pantalla.</div>' : '';

const dec = x => x.toFixed(2).replace('.', ',');
const evTxt = ev => (ev >= 0 ? '+' : '') + (ev * 100).toFixed(1).replace('.', ',') + '%';

// Cuotas Bet365 que trae la fuente (1X2 y más/menos 2,5) frente a la probabilidad del modelo. EV = p·cuota − 1 (teórico).
function oddsHtml(m, pr, bt) {
  const o = m.odds || {}, rows = [];
  if (o.b365) rows.push(['1 · ' + m.home.name, o.b365[0], pr && pr.p1], ['X · Empate', o.b365[1], pr && pr.pX], ['2 · ' + m.away.name, o.b365[2], pr && pr.p2]);
  if (o.ou25) rows.push(['Más de 2,5 goles', o.ou25[0], pr && pr.over['2.5']], ['Menos de 2,5 goles', o.ou25[1], pr && pr.under['2.5']]);
  if (!rows.length) return empty('Sin cuotas Bet365 para este partido en la fuente de datos.');
  const margin = o.b365 ? o.b365.reduce((a, x) => a + 1 / x, 0) - 1 : null;
  const warn = bt && !bt.beatsBase
    ? 'En esta muestra el modelo NO mejora a la base ingenua en 1X2: ignora el valor esperado.'
    : 'El modelo es simple (Poisson sin forma reciente, lesiones ni calidad del rival) y usa pocos partidos: un valor esperado positivo aquí NO indica una apuesta rentable.';
  return `<div class="card tw"><table class="tbl"><thead><tr><th class="l">Mercado</th><th>Cuota<small>Bet365</small></th><th>Implícita<small>1/cuota</small></th><th>Modelo</th><th>Valor esperado</th></tr></thead><tbody>
    ${rows.map(([l, od, p]) => `<tr><td class="l">${esc(l)}</td><td><b>${dec(od)}</b></td><td>${pct0(1 / od)}</td><td>${p == null ? '–' : `${pct0(p)}<small>justa ${odd(p)}</small>`}</td>
      <td>${p == null ? '–' : `<b class="ev ${expectedValue(p, od) > 0.05 ? 'up' : expectedValue(p, od) < -0.05 ? 'dn' : ''}">${evTxt(expectedValue(p, od))}</b>`}</td></tr>`).join('')}</tbody></table></div>
    <p class="mu" style="margin-top:6px">${margin != null ? `Margen de la casa en 1X2: ${(margin * 100).toFixed(1).replace('.', ',')}%. ` : ''}Valor esperado teórico = probabilidad del modelo × cuota − 1, por unidad apostada. ${warn}${m.status === 'FT' ? ' Partido ya jugado: son las cuotas de antes del partido.' : ''}</p>`;
}

export const analisis = async ({ q }) => {
  const lg = q.get('l') || '', leagues = await data.leagues();
  let list = await data.matches({ leagueId: lg || undefined, status: 'NS', limit: 30 });
  // La fuente solo publica los partidos de hoy y mañana: si no hay próximos, se ofrecen los últimos jugados para poder revisar la lectura.
  const past = !list.length;
  if (past) list = await data.matches({ leagueId: lg || undefined, status: 'FT', limit: 30 });
  const href = l => `#/analisis${l ? '?l=' + encodeURIComponent(l) : ''}`;
  return `<h1>Análisis</h1>${analysisTabs('p')}<p class="mu">Elige un partido para ver la lectura, los mercados favoritos y las estimaciones del modelo Poisson.</p>${demoNote()}
    ${past ? '<div class="demo">La fuente de datos aún no ha publicado próximos partidos. Te enseño los últimos jugados: el análisis usa solo los partidos anteriores a cada uno, como si estuvieras antes de empezar.</div>' : ''}
    ${chips([[href(''), 'Todas', !lg], ...leagues.map(l => [href(l.id), l.name, lg === l.id])])}
    ${groupByDay(list, Object.fromEntries(leagues.map(l => [l.id, l.name]))).replace(/href="#\/partidos\//g, 'href="#/analisis/')}`;
};

export const analisisPartido = async ({ id, q }) => {
  const m = await data.match(id);
  if (!m) return empty('Partido no encontrado.');
  const [l, all, prevAll] = await Promise.all([data.league(m.leagueId), data.matches({ leagueId: m.leagueId }), data.prevMatches ? data.prevMatches(m.leagueId) : []]);
  // Mismo cálculo que guarda el Historial (js/model/analyze.js): solo partidos terminados ANTES de este (también válido al revisar un partido ya jugado).
  const last = q?.get('n') === 'all' ? 0 : 10, ord = q?.get('o') === 'edge' ? 'edge' : 'p';
  const { tr, pr, bt, ins } = analyze({ m, all, prevAll, teams: l.teams || [], last });
  const head = `<a class="back" href="#/analisis">‹ Análisis</a>
  <div class="hero"><div class="mu">${esc(l.name)} · Jornada ${m.round} · ${dayLabel(m.kickoff)} ${fmtTime(m.kickoff)}</div>
    <div class="vs"><div class="side-t">${crest(m.home, 1)}<span>${esc(m.home.name)}</span></div>
      <div class="when"><b>${m.status === 'FT' ? `${m.score.h} - ${m.score.a}` : 'vs'}</b><small>${m.status === 'FT' ? 'Finalizado' : 'Por jugar'}</small></div>
      <div class="side-t">${crest(m.away, 1)}<span>${esc(m.away.name)}</span></div></div></div>${demoNote()}`;
  const insightPart = insightHtml(ins), trendsTableHtml = trendsHtml(tr, m, last, ord), trends = insightPart + trendsTableHtml;
  if (!pr) return `${head}${trends}${empty('Sin estimación del modelo Poisson: alguno de los equipos todavía no tiene partidos jugados en esta competición.')}<h2>Cuotas Bet365</h2>${oddsHtml(m, null, null)}`;

  const low = Math.min(pr.games.h, pr.games.a) < 5;
  const btHtml = bt ? `<div class="card"><div class="st"><span>Partidos evaluados (walk-forward)</span><span>${bt.n}</span></div>
      <div class="st"><span>Brier 1X2 · modelo / base</span><span>${f3(bt.brier)} / ${f3(bt.baseBrier)}</span></div>
      <div class="st"><span>Log-loss 1X2 · modelo / base</span><span>${f3(bt.logloss)} / ${f3(bt.baseLogloss)}</span></div>
      <div class="st"><span>Brier más/menos 2,5 · modelo / base</span><span>${f3(bt.ou25.brier)} / ${f3(bt.ou25.baseBrier)}</span></div>
      <div class="st"><span>Acierto del resultado más probable</span><span>${pc(bt.hitRate)}</span></div>
      <p class="mu" style="margin-top:8px">${bt.beatsBase ? 'En 1X2 el modelo mejora a la base ingenua (frecuencias de la liga) en esta muestra.' : 'En 1X2 el modelo NO mejora a la base ingenua en esta muestra: no te fíes de sus probabilidades.'}
      Menor Brier/log-loss = mejor. Con pocos partidos el resultado es muy ruidoso.</p></div>`
    : `<div class="card empty">Aún no hay partidos suficientes para evaluar el modelo (se necesitan al menos 3 por equipo antes de cada predicción).</div>`;

  const grid = `<div class="grid">
    <div class="card"><b>1X2</b>${bar('1 · ' + esc(m.home.name), pr.p1)}${bar('X · Empate', pr.pX)}${bar('2 · ' + esc(m.away.name), pr.p2)}</div>
    <div class="card"><b>Doble oportunidad</b>${bar('1X', pr.dc['1X'])}${bar('12', pr.dc['12'])}${bar('X2', pr.dc['X2'])}</div>
    <div class="card"><b>Goles totales</b>${[1.5, 2.5, 3.5].map(L => bar(`Más de ${String(L).replace('.', ',')}`, pr.over[L])).join('')}${bar('Menos de 2,5', pr.under[2.5])}</div>
    <div class="card"><b>Ambos marcan</b>${bar('Sí', pr.btts.si)}${bar('No', pr.btts.no)}</div></div>
    <div class="card" style="margin-top:12px"><div class="st"><span>Marcadores más probables</span><span>${pr.top.slice(0, 3).map(s => `${s.h}-${s.a} (${pc(s.p)})`).join(' · ')}</span></div>
    <div class="st"><span>Partidos previos usados</span><span>${pr.trainMatches} liga · ${pr.games.h} local · ${pr.games.a} visitante</span></div></div>`;
  const method = `<div class="card empty"><p>Poisson independiente para goles de cada equipo. Ataque y defensa = goles a favor/en contra respecto a la media de la liga, encogidos hacia esa media con 4 partidos virtuales. Usa solo partidos anteriores a este; los de la temporada anterior pesan la mitad.</p>
    <p>No incluye lesiones, descansos ni la correlación 0-0/1-1 de Dixon-Coles.</p></div>`;
  return `${head}
  ${verdictHtml(pr, m)}
  ${low ? '<div class="demo">Muestra pequeña: algún equipo tiene menos de 5 partidos previos. La estimación se apoya sobre todo en la media de la liga.</div>' : ''}
  ${insightPart}
  <h2>Cuotas y valor</h2>${calcHtml(pr, m, bt)}
  ${m.odds && (m.odds.b365 || m.odds.ou25) ? fold('Cuotas Bet365 de la fuente', oddsHtml(m, pr, bt)) : ''}
  ${fold('Tendencias por mercado (tablas)', trendsTableHtml)}
  ${fold('Estimación completa del modelo (Poisson)', grid)}
  ${fold('Validación del modelo', btHtml)}
  ${fold('Método', method)}`;
};
