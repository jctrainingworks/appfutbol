// Análisis > Por mercado: qué liga y qué equipo van mejor para un mercado concreto.
// Son frecuencias observadas esta temporada (no garantías). El ranking usa la frecuencia suavizada hacia la media de la liga.
import { data } from '../data/index.js';
import { ALL_MARKETS, marketById, rankTeams, rankLeagues, SMOOTH } from '../model/trends.js';
import { esc, crest, chips, empty, analysisTabs, byCountry } from '../ui.js';

const pct0 = p => p == null ? '–' : Math.round(p * 100) + '%';
const MIN_TEAM = 5, MIN_LEAGUE = 10, TOP = 25;
const VENUES = [['all', 'Todos'], ['home', 'En casa'], ['away', 'Fuera']];

async function loadLeagues() {
  const ls = await data.leagues();
  return Promise.all(ls.map(async l => ({ id: l.id, name: l.name, country: l.country, matches: await data.matches({ leagueId: l.id }) })));
}

export const mercados = async ({ q }) => {
  const mk = marketById(q.get('m')) || marketById('ht_o05');
  const scope = mk.kind === 'game' && q.get('s') === 'l' ? 'l' : 'e';
  const venue = VENUES.some(v => v[0] === q.get('v')) ? q.get('v') : 'all';
  const all = await loadLeagues();
  const lg = all.some(l => l.id === q.get('l')) ? q.get('l') : '';
  const url = (o = {}) => { const p = { m: mk.id, s: scope, v: venue, l: lg, ...o }; return `#/analisis?t=mercados&m=${p.m}&s=${p.s}&v=${p.v}${p.l ? '&l=' + encodeURIComponent(p.l) : ''}`; };

  const inScope = lg ? all.filter(l => l.id === lg) : all;
  const teams = rankTeams(inScope, mk, { venue, minGames: MIN_TEAM });
  const leagues = rankLeagues(all, mk, { minGames: MIN_LEAGUE });
  const grps = [...new Set(ALL_MARKETS.map(m => m.grp))];
  const group = g => `<optgroup label="${g}">${ALL_MARKETS.filter(m => m.grp === g).map(m => `<option value="${url({ m: m.id, s: m.kind === 'team' ? 'e' : scope })}"${m.id === mk.id ? ' selected' : ''}>${esc(m.label)}</option>`).join('')}</optgroup>`;
  const lgOpts = `<option value="${url({ l: '' })}">Todas las ligas</option>` + byCountry(all).map(([c, ls]) => `<optgroup label="${esc(c)}">${ls.map(l => `<option value="${url({ l: l.id })}"${l.id === lg ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</optgroup>`).join('');

  const bestT = teams[0], bestL = leagues[0];
  const best = `<div class="card best">
    ${mk.kind === 'game' ? `<div class="st"><span>Mejor liga</span><span>${bestL ? `<b>${esc(bestL.name)}</b> · ${pct0(bestL.p)} <span class="mu">(${bestL.k}/${bestL.n})</span>` : '<span class="mu">sin datos suficientes</span>'}</span></div>` : ''}
    <div class="st"><span>Mejor equipo${lg ? '' : ' (todas las ligas)'}</span><span>${bestT ? `<b>${esc(bestT.team.name)}</b> <span class="mu">${esc(bestT.league)}</span> · ${pct0(bestT.p)} <span class="mu">(${bestT.k}/${bestT.n})</span>` : '<span class="mu">sin datos suficientes</span>'}</span></div></div>`;

  let table;
  if (scope === 'l') {
    table = leagues.length ? `<div class="card tw"><table class="tbl"><thead><tr><th>#</th><th class="l">Liga</th><th>Se cumple<small>k/n partidos</small></th></tr></thead><tbody>
      ${leagues.map((r, i) => `<tr${i < 3 ? ' class="top"' : ''}><td>${i + 1}</td><td class="l">${esc(r.name)}<small class="lg">${esc(r.country)}</small></td><td><b>${pct0(r.p)}</b><small>${r.k}/${r.n}</small></td></tr>`).join('')}</tbody></table></div>` : empty('Aún no hay partidos suficientes para comparar ligas en este mercado.');
  } else {
    table = teams.length ? `<div class="card tw"><table class="tbl"><thead><tr><th>#</th><th class="l">Equipo</th><th>Se cumple<small>k/n</small></th><th>Ajustada</th><th class="hm">Liga</th></tr></thead><tbody>
      ${teams.slice(0, TOP).map((r, i) => `<tr${i < 3 ? ' class="top"' : ''}><td>${i + 1}</td><td class="l"><span class="tm">${crest(r.team)}<span class="n">${esc(r.team.name)}</span></span><small class="lg">${esc(r.league)}</small></td>
        <td><b>${pct0(r.p)}</b><small>${r.k}/${r.n}</small></td><td>${pct0(r.sm)}</td><td class="hm">${pct0(r.pl)}</td></tr>`).join('')}</tbody></table></div>
      ${teams.length > TOP ? `<p class="mu">Se muestran los ${TOP} primeros de ${teams.length} equipos.</p>` : ''}` : empty(`Ningún equipo tiene aún ${MIN_TEAM} partidos con dato para este mercado${venue !== 'all' ? ' en esa condición' : ''}.`);
  }

  return `<h1>Análisis</h1>${analysisTabs('m')}
  <div class="filters"><select class="sel" aria-label="Mercado" onchange="location.hash=this.value">${grps.map(group).join('')}</select>
    <select class="sel" aria-label="Liga" onchange="location.hash=this.value">${lgOpts}</select></div>
  ${mk.kind === 'game' ? chips([[url({ s: 'e' }), 'Equipos', scope === 'e'], [url({ s: 'l' }), 'Ligas', scope === 'l']]) : ''}
  ${scope === 'e' ? chips(VENUES.map(([v, t]) => [url({ v }), t, venue === v])) : ''}
  <h2>Mejor para este mercado</h2>${best}
  <h2>${scope === 'l' ? 'Ranking de ligas' : 'Ranking de equipos'}</h2>${table}
  <p class="mu" style="margin-top:8px">«Se cumple» = veces que ocurrió / partidos de esta temporada (mínimo ${scope === 'l' ? MIN_LEAGUE : MIN_TEAM}). «Ajustada» acerca el porcentaje a la media de su liga (${SMOOTH} partidos virtuales) para no premiar rachas cortas; el ranking se ordena por ella.
  ${/^(t_)?ca/.test(mk.id) ? 'Tarjetas = amarillas + rojas; en Inglaterra y Escocia la 2ª amarilla que acaba en roja no cuenta como amarilla.' : ''} Es lo que ha pasado, no una garantía. ${data.meta.isDemo ? 'Datos de demostración.' : ''}</p>`;
};
