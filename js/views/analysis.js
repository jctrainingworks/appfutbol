import { data } from '../data/index.js';
import { fit, predict, backtest, fairOdds } from '../model/poisson.js';
import { esc, crest, fmtTime, dayLabel, groupByDay, chips, empty } from '../ui.js';

const pc = p => (p * 100).toFixed(1).replace('.', ',') + '%';
const odd = p => fairOdds(p).toFixed(2).replace('.', ',');
const f3 = x => x.toFixed(3).replace('.', ',');
const bar = (label, p) => `<div class="pb"><div class="pbh"><span>${label}</span><b>${pc(p)}</b><span class="mu">@ ${odd(p)}</span></div><div class="pbt"><i style="width:${(p * 100).toFixed(1)}%"></i></div></div>`;
const demoNote = () => data.meta.isDemo ? '<div class="demo"><b>Sobre datos de demostración.</b> Las probabilidades se calculan con partidos ficticios: solo sirven para revisar la pantalla.</div>' : '';

export const analisis = async ({ q }) => {
  const lg = q.get('l') || '', leagues = await data.leagues();
  const list = await data.matches({ leagueId: lg || undefined, status: 'NS', limit: 30 });
  const href = l => `#/analisis${l ? '?l=' + encodeURIComponent(l) : ''}`;
  return `<h1>Análisis</h1><p class="mu">Elige un partido para ver las estimaciones del modelo Poisson.</p>${demoNote()}
    ${chips([[href(''), 'Todas', !lg], ...leagues.map(l => [href(l.id), l.name, lg === l.id])])}
    ${groupByDay(list, Object.fromEntries(leagues.map(l => [l.id, l.name]))).replace(/href="#\/partidos\//g, 'href="#/analisis/')}`;
};

export const analisisPartido = async ({ id }) => {
  const m = await data.match(id);
  if (!m) return empty('Partido no encontrado.');
  const [l, all] = await Promise.all([data.league(m.leagueId), data.matches({ leagueId: m.leagueId })]);
  // Entrenamiento: solo partidos terminados ANTES de este (también válido al revisar un partido ya jugado).
  const train = all.filter(x => x.status === 'FT' && x.kickoff < m.kickoff);
  const model = fit(train), pr = predict(model, m.home.id, m.away.id), bt = backtest(train);
  const head = `<a class="back" href="#/analisis">‹ Análisis</a>
  <div class="hero"><div class="mu">${esc(l.name)} · Jornada ${m.round} · ${dayLabel(m.kickoff)} ${fmtTime(m.kickoff)}</div>
    <div class="vs"><div class="side-t">${crest(m.home, 1)}<span>${esc(m.home.name)}</span></div>
      <div class="when"><b>${m.status === 'FT' ? `${m.score.h} - ${m.score.a}` : 'vs'}</b><small>${m.status === 'FT' ? 'Finalizado' : 'Por jugar'}</small></div>
      <div class="side-t">${crest(m.away, 1)}<span>${esc(m.away.name)}</span></div></div></div>${demoNote()}`;
  if (!pr) return `${head}${empty('Sin estimación: alguno de los equipos todavía no tiene partidos jugados en esta competición.')}`;

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
  <h2>Estimación del modelo</h2>
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
  <h2>Cuotas y valor esperado</h2><div class="card empty">Pendiente: la introducción manual de cuotas y el cálculo del valor esperado llegan en el siguiente bloque.</div>
  <h2>Método</h2><div class="card empty"><p>Poisson independiente para goles de cada equipo. Ataque y defensa de cada equipo = goles a favor/en contra respecto a la media de la liga, encogidos hacia esa media con 4 partidos virtuales. Solo usa partidos anteriores a este.</p>
    <p>No incluye ventaja de forma reciente, lesiones, descansos ni la correlación 0-0/1-1 de Dixon-Coles.</p></div>`;
};
