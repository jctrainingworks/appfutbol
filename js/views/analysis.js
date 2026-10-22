import { data } from '../data/index.js';
import { fit, predict, backtest, fairOdds, expectedValue } from '../model/poisson.js';
import { matchTrends, SMOOTH } from '../model/trends.js';
import { insight } from '../model/insight.js';
import { computeStandings } from '../data/standings.js';
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
    ${ins.favorites.length ? `<div class="grid">${ins.favorites.map(fav).join('')}</div>` : empty('Ningún mercado cumple los filtros (probabilidad ≥ 55%, muestra suficiente y tendencia y modelo de acuerdo). Mejor no forzar.')}
    <ul class="mu cav">${ins.caveats.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    <p class="mu">Son frecuencias pasadas y un modelo simple, no una garantía ni una recomendación de apuesta.</p>`;
}

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
  const list = await data.matches({ leagueId: lg || undefined, status: 'NS', limit: 30 });
  const href = l => `#/analisis${l ? '?l=' + encodeURIComponent(l) : ''}`;
  return `<h1>Análisis</h1>${analysisTabs('p')}<p class="mu">Elige un partido para ver las estimaciones del modelo Poisson.</p>${demoNote()}
    ${chips([[href(''), 'Todas', !lg], ...leagues.map(l => [href(l.id), l.name, lg === l.id])])}
    ${groupByDay(list, Object.fromEntries(leagues.map(l => [l.id, l.name]))).replace(/href="#\/partidos\//g, 'href="#/analisis/')}`;
};

export const analisisPartido = async ({ id, q }) => {
  const m = await data.match(id);
  if (!m) return empty('Partido no encontrado.');
  const [l, all] = await Promise.all([data.league(m.leagueId), data.matches({ leagueId: m.leagueId })]);
  // Entrenamiento: solo partidos terminados ANTES de este (también válido al revisar un partido ya jugado).
  const train = all.filter(x => x.status === 'FT' && x.kickoff < m.kickoff);
  const last = q?.get('n') === 'all' ? 0 : 10, ord = q?.get('o') === 'edge' ? 'edge' : 'p', tr = matchTrends(train, m.home.id, m.away.id, { last });
  const model = fit(train), pr = predict(model, m.home.id, m.away.id), bt = backtest(train);
  const ins = insight({ train, m, tr, pr, bt, standings: computeStandings(train, l.teams || []) });
  const head = `<a class="back" href="#/analisis">‹ Análisis</a>
  <div class="hero"><div class="mu">${esc(l.name)} · Jornada ${m.round} · ${dayLabel(m.kickoff)} ${fmtTime(m.kickoff)}</div>
    <div class="vs"><div class="side-t">${crest(m.home, 1)}<span>${esc(m.home.name)}</span></div>
      <div class="when"><b>${m.status === 'FT' ? `${m.score.h} - ${m.score.a}` : 'vs'}</b><small>${m.status === 'FT' ? 'Finalizado' : 'Por jugar'}</small></div>
      <div class="side-t">${crest(m.away, 1)}<span>${esc(m.away.name)}</span></div></div></div>${demoNote()}`;
  const trends = insightHtml(ins) + trendsHtml(tr, m, last, ord);
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

  return `${head}
  ${trends}
  <h2>Estimación del modelo (Poisson)</h2>
  ${low ? '<div class="demo">Muestra pequeña: algún equipo tiene menos de 5 partidos previos. La estimación se apoya sobre todo en la media de la liga.</div>' : ''}
  <div class="grid">
    <div class="card"><b>1X2</b>${bar('1 · ' + esc(m.home.name), pr.p1)}${bar('X · Empate', pr.pX)}${bar('2 · ' + esc(m.away.name), pr.p2)}</div>
    <div class="card"><b>Doble oportunidad</b>${bar('1X', pr.dc['1X'])}${bar('12', pr.dc['12'])}${bar('X2', pr.dc['X2'])}</div>
    <div class="card"><b>Goles totales</b>${[1.5, 2.5, 3.5].map(L => bar(`Más de ${String(L).replace('.', ',')}`, pr.over[L])).join('')}
      ${bar('Menos de 2,5', pr.under[2.5])}</div>
    <div class="card"><b>Ambos marcan</b>${bar('Sí', pr.btts.si)}${bar('No', pr.btts.no)}</div>
  </div>
  <div class="card" style="margin-top:12px"><div class="st"><span>Goles esperados (xG del modelo)</span><span>${pr.xg.h.toFixed(2).replace('.', ',')} – ${pr.xg.a.toFixed(2).replace('.', ',')}</span></div>
    <div class="st"><span>Marcadores más probables</span><span>${pr.top.slice(0, 3).map(s => `${s.h}-${s.a} (${pc(s.p)})`).join(' · ')}</span></div>
    <div class="st"><span>Partidos previos usados</span><span>${pr.trainMatches} liga · ${pr.games.h} local · ${pr.games.a} visitante</span></div></div>
  <p class="mu" style="margin-top:6px">«@» es la cuota justa (1/probabilidad), sin margen de casa. Son estimaciones, no certezas ni garantía de beneficio.</p>
  <h2>Validación del modelo</h2>${btHtml}
  <h2>Cuotas Bet365 y valor esperado</h2>${oddsHtml(m, pr, bt)}
  <h2>Método</h2><div class="card empty"><p>Poisson independiente para goles de cada equipo. Ataque y defensa de cada equipo = goles a favor/en contra respecto a la media de la liga, encogidos hacia esa media con 4 partidos virtuales. Solo usa partidos anteriores a este.</p>
    <p>No incluye ventaja de forma reciente, lesiones, descansos ni la correlación 0-0/1-1 de Dixon-Coles.</p></div>`;
};
