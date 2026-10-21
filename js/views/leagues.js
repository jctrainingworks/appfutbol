import { data } from '../data/index.js';
import { esc, table, groupByDay, chips, empty, byCountry } from '../ui.js';

export const ligas = async () => {
  const leagues = await data.leagues();
  const tables = await Promise.all(leagues.map(l => data.standings(l.id)));
  const lead = Object.fromEntries(leagues.map((l, i) => [l.id, tables[i][0]]));
  return `<h1>Ligas</h1>${byCountry(leagues).map(([c, ls]) => `<h2>${esc(c)}</h2><div class="card list">${ls.map(l => `<a class="lrow" href="#/ligas/${esc(l.id)}">
    <span><b>${esc(l.name)}</b><small class="mu">${l.teams.length} equipos · ${l.rounds} jornadas</small></span>
    <span class="mu">${lead[l.id] && lead[l.id].pj ? `${esc(lead[l.id].team.name)} · ${lead[l.id].pts} pts` : ''}</span></a>`).join('')}</div>`).join('')}`;
};

export const liga = async ({ id, q }) => {
  const l = await data.league(id);
  if (!l) return empty('Liga no encontrada.');
  const tab = q.get('t') === 'partidos' ? 'partidos' : 'tabla', base = `#/ligas/${esc(id)}`;
  let body;
  if (tab === 'tabla') body = table(await data.standings(id));
  else {
    const [next, last] = await Promise.all([data.matches({ leagueId: id, status: 'NS', limit: 8 }), data.matches({ leagueId: id, status: 'FT', limit: 8 })]);
    body = `<h2>Próximos</h2>${groupByDay(next)}<h2>Últimos resultados</h2>${groupByDay(last)}`;
  }
  return `<a class="back" href="#/ligas">‹ Ligas</a><h1>${esc(l.name)}</h1>
    ${chips([[base, 'Clasificación', tab === 'tabla'], [base + '?t=partidos', 'Partidos', tab === 'partidos']])}${body}`;
};
