import { data } from '../data/index.js';
import { esc, crest, fmtTime, dayLabel, groupByDay, table, countryRows } from '../ui.js';

export default async () => {
  const [leagues, next] = await Promise.all([data.leagues(), data.matches({ status: 'NS', limit: 6 })]);
  const names = Object.fromEntries(leagues.map(l => [l.id, l.name]));
  const first = await data.standings(leagues[0].id);
  const m = next[0];
  const hero = m ? `<a class="hero" href="#/partidos/${esc(m.id)}">
      <div class="mu">Próximo partido · ${esc(names[m.leagueId])}</div>
      <div class="vs"><div class="side-t">${crest(m.home, 1)}<span>${esc(m.home.name)}</span></div>
        <div class="when"><b>${fmtTime(m.kickoff)}</b><small>${dayLabel(m.kickoff)}</small></div>
        <div class="side-t">${crest(m.away, 1)}<span>${esc(m.away.name)}</span></div></div></a>` : '';
  const status = [
    ['Fuente de datos', data.meta.isDemo ? 'Demo' : data.meta.label, data.meta.isDemo ? 'warn' : 'ok'],
    ['Almacenamiento (Supabase)', 'Sin conectar', 'off'],
    ['Motor estadístico', 'Poisson + tendencias por mercado', 'ok'],
    ['Cuotas', data.meta.isDemo ? 'Pendiente' : 'Bet365 1X2 y más/menos 2,5 (según calendario)', data.meta.isDemo ? 'off' : 'ok'],
  ];
  return `${data.meta.isDemo ? `<div class="demo"><b>Datos de demostración.</b> Equipos, partidos y resultados son ficticios y sirven solo para revisar el diseño.</div>` : ''}
  ${hero}
  <h2>Próximos partidos</h2>${groupByDay(next, names)}
  <h2>Ligas</h2>${countryRows(leagues)}
  <h2>Clasificación · ${esc(leagues[0].name)}</h2>${table(first.slice(0, 5), true)}
  <h2>Estado de la app</h2>
  <div class="card">${status.map(([k, v, s]) => `<div class="st"><span>${k}</span><span class="mu"><i class="dot ${s}"></i>${v}</span></div>`).join('')}</div>`;
};
