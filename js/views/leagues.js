import { data } from '../data/index.js';
import { esc, table, groupByDay, chips, empty } from '../ui.js';

export const ligas = async () => {
  const leagues = await data.leagues();
  const tables = await Promise.all(leagues.map(l => data.standings(l.id)));
  return `<h1>Ligas</h1><div class="grid">${leagues.map((l, i) => `<a class="card lcard" href="#/ligas/${esc(l.id)}">
    <b>${esc(l.name)}</b><span class="mu">${esc(l.country)} · ${l.teams.length} equipos · ${l.rounds} jornadas</span>
    <span class="mu">Líder: ${esc(tables[i][0].team.name)} · ${tables[i][0].pts} pts</span></a>`).join('')}</div>`;
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
