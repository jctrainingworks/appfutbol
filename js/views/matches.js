import { data } from '../data/index.js';
import { esc, crest, fmtTime, dayLabel, groupByDay, chips, dots, empty } from '../ui.js';

export const partidos = async ({ q }) => {
  const f = q.get('f') === 'resultados' ? 'resultados' : 'proximos', lg = q.get('l') || '';
  const leagues = await data.leagues();
  const list = await data.matches({ leagueId: lg || undefined, status: f === 'resultados' ? 'FT' : 'NS', limit: 40 });
  const href = (nf, nl) => `#/partidos?f=${nf}${nl ? '&l=' + encodeURIComponent(nl) : ''}`;
  return `<h1>Partidos</h1>
    ${chips([[href('proximos', lg), 'Próximos', f === 'proximos'], [href('resultados', lg), 'Resultados', f === 'resultados']])}
    ${chips([[href(f, ''), 'Todas', !lg], ...leagues.map(l => [href(f, l.id), l.name, lg === l.id])])}
    ${groupByDay(list, Object.fromEntries(leagues.map(l => [l.id, l.name])))}`;
};

export const partido = async ({ id }) => {
  const m = await data.match(id);
  if (!m) return empty('Partido no encontrado.');
  const [l, st, hr, ar] = await Promise.all([data.league(m.leagueId), data.standings(m.leagueId),
    data.matches({ teamId: m.home.id, status: 'FT', limit: 5 }), data.matches({ teamId: m.away.id, status: 'FT', limit: 5 })]);
  const fin = m.status === 'FT';
  const row = t => st.find(r => r.team.id === t.id);
  const recent = (t, list) => `<div class="card"><b>${esc(t.name)}</b>${list.length ? list.map(x => {
    const home = x.home.id === t.id, gf = home ? x.score.h : x.score.a, gc = home ? x.score.a : x.score.h, opp = home ? x.away : x.home;
    return `<div class="st"><span>${home ? 'vs' : '@'} ${esc(opp.name)}</span><span><i class="f ${gf > gc ? 'W' : gf < gc ? 'L' : 'D'}"></i>${gf}-${gc}</span></div>`;
  }).join('') : '<p class="mu">Sin partidos jugados.</p>'}</div>`;
  const stat = t => { const r = row(t); return `<div class="card"><b>${esc(t.name)}</b><div class="st"><span>Posición</span><span>${r.pos}º · ${r.pts} pts</span></div>
    <div class="st"><span>Balance (G-E-P)</span><span>${r.g}-${r.e}-${r.p}</span></div><div class="st"><span>Goles a favor / en contra</span><span>${r.gf} / ${r.gc}</span></div>
    <div class="st"><span>Forma</span><span>${dots(r.form)}</span></div></div>`; };
  return `<a class="back" href="#/partidos">‹ Partidos</a>
  <div class="hero"><div class="mu">${esc(l.name)} · Jornada ${m.round} · ${dayLabel(m.kickoff)}</div>
    <div class="vs"><div class="side-t">${crest(m.home, 1)}<span>${esc(m.home.name)}</span></div>
      <div class="when"><b>${fin ? `${m.score.h} - ${m.score.a}` : fmtTime(m.kickoff)}</b><small>${fin ? 'Finalizado' : 'Por jugar'}</small></div>
      <div class="side-t">${crest(m.away, 1)}<span>${esc(m.away.name)}</span></div></div></div>
  ${m.source === 'demo' ? '<div class="demo">Partido de demostración (ficticio).</div>' : ''}
  <h2>Estadísticas observadas</h2><div class="grid">${stat(m.home)}${stat(m.away)}</div>
  <h2>Últimos resultados</h2><div class="grid">${recent(m.home, hr)}${recent(m.away, ar)}</div>
  <h2>Modelo y cuotas</h2><div class="card empty">Sin estimaciones: el motor estadístico y las cuotas aún no están conectados. No se muestran probabilidades hasta tener datos reales.</div>`;
};
