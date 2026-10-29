import { data } from '../data/index.js';
import { analyze } from '../model/analyze.js';
import { rate, sortRated } from '../model/today.js';
import { esc, crest, fmtTime, dayLabel, groupByDay, table, countryRows } from '../ui.js';

const pct = p => Math.round(p * 100) + '%';
function hoyRow({ m, r }, names) {
  return `<a class="hrow hoyr" href="#/analisis/${esc(m.id)}"><i class="tl ${r.light}" aria-label="${r.light === 'green' ? 'verde' : r.light === 'yellow' ? 'amarillo' : 'rojo'}"></i>
    <div class="hb"><b>${esc(m.home.name)} – ${esc(m.away.name)}</b><span>${esc(r.reason)}</span><span class="mu">${esc(names[m.leagueId] || '')}</span></div>
    <div class="hs"><small class="mu">${dayLabel(m.kickoff)}</small><b>${fmtTime(m.kickoff)}</b></div></a>`;
}
// Semáforo de los próximos partidos (se calcula en el navegador con el mismo análisis que la pantalla Análisis).
async function hoyHtml(leagues, names) {
  const next = await data.matches({ status: 'NS', limit: 120 });
  if (!next.length) return `<div class="card empty"><p>La fuente de datos aún no ha publicado próximos partidos. Cuando los haya, aquí verás cuáles mirar y cuáles evitar.</p></div>`;
  const by = new Map();
  for (const m of next) { if (!by.has(m.leagueId)) by.set(m.leagueId, []); by.get(m.leagueId).push(m); }
  const items = [];
  for (const [lg, list] of by) {
    const [l, all, prevAll] = await Promise.all([data.league(lg), data.matches({ leagueId: lg }), data.prevMatches ? data.prevMatches(lg) : []]);
    for (const m of list) { const a = analyze({ m, all, prevAll, teams: l.teams || [], withBacktest: false, withStandings: false }); items.push({ m, r: rate(a.pr, m) }); }
  }
  const sorted = sortRated(items), g = sorted.filter(x => x.r.light === 'green'), y = sorted.filter(x => x.r.light === 'yellow'), r = sorted.filter(x => x.r.light === 'red');
  const block = (title, list, hint, open) => list.length ? `<details class="fold"${open ? ' open' : ''}><summary>${title} (${list.length})</summary><p class="mu">${hint}</p><div class="card list">${list.map(x => hoyRow(x, names)).join('')}</div></details>` : '';
  const picks = g.length ? `<div class="card hoy-top"><b>Selecciones que modelo y mercado confirman</b>${g.slice(0, 8).map(x => `<div class="pkrow"><span><b>${esc(x.m.home.name)} – ${esc(x.m.away.name)}</b><small class="mu">${dayLabel(x.m.kickoff)} ${fmtTime(x.m.kickoff)}</small></span><span class="pkb">${esc(x.r.pick.label)}<small>${pct(x.r.pick.mk)}</small></span></div>`).join('')}</div>` : '<div class="card empty"><p>Ahora mismo ningún partido tiene una selección que modelo y mercado confirmen a la vez. Mejor no forzar.</p></div>';
  return `${picks}
    ${block('🟢 Para mirar', g, 'Hay cuotas, el modelo coincide con el mercado y existe una selección (1, 2, más o menos de 2,5) con probabilidad entre 55 % y 85 %.', true)}
    ${block('🟡 Con dudas', y, 'Falta algo para decidir: sin cuotas, diferencia pequeña o partido parejo.', g.length === 0)}
    ${block('🔴 Mejor evitar', r, 'Pocos partidos previos, sin estimación, o el modelo y el mercado discrepan mucho (ahí el mercado suele acertar más).', false)}
    <p class="mu" style="margin-top:8px">Verde no es «apuesta ganadora»: la cuota ya cobra esa probabilidad, así que no hay ventaja asegurada. Significa que dos fuentes independientes (el mercado y el modelo) dicen lo mismo. El porcentaje es el del mercado sin margen. La app no conoce lesiones ni alineaciones: míralas antes de apostar.</p>`;
}

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
  if (!data.meta.isDemo) setTimeout(() => hoyHtml(leagues, names).then(h => { const el = document.getElementById('hoy'); if (el) el.innerHTML = h; }).catch(e => { const el = document.getElementById('hoy'); if (el) el.innerHTML = `<div class="card empty"><p>No se pudo calcular el semáforo (${esc(e.message)}).</p></div>`; }), 0);
  return `${data.meta.isDemo ? `<div class="demo"><b>Datos de demostración.</b> Equipos, partidos y resultados son ficticios y sirven solo para revisar el diseño.</div>` : ''}
  <h2>Hoy: qué mirar y qué evitar</h2><div id="hoy"><div class="card empty"><p>Calculando el semáforo de los próximos partidos…</p></div></div>
  ${hero}
  <h2>Próximos partidos</h2>${groupByDay(next, names)}
  <h2>Ligas</h2>${countryRows(leagues)}
  <h2>Clasificación · ${esc(leagues[0].name)}</h2>${table(first.slice(0, 5), true)}
  <h2>Estado de la app</h2>
  <div class="card">${status.map(([k, v, s]) => `<div class="st"><span>${k}</span><span class="mu"><i class="dot ${s}"></i>${v}</span></div>`).join('')}</div>`;
};
