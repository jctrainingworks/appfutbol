// Bloques ampliados de la pantalla Análisis: contraste con el mercado, perfil de los equipos, forma y rivales, tablas en casa/fuera,
// carga de partidos, enfrentamientos directos, más mercados y parámetros del modelo. Solo construyen HTML: los cálculos están en js/model/*.
import { esc } from '../ui.js';
import { fairOdds } from '../model/poisson.js';
import { extras } from '../model/extras.js';
import { compareMarket, DISAGREE, NOTICE } from '../model/market.js';
import { METRICS, profile, teamGames, leagueGames, strengths, recentWithOpponents, venueTable, load, headToHead } from '../model/profile.js';

const p0 = p => p == null ? '–' : Math.round(p * 100) + '%';
const p1 = p => p == null ? '–' : (p * 100).toFixed(1).replace('.', ',') + '%';
const num = (x, d = 2) => x == null ? '–' : x.toFixed(d).replace('.', ',');
const pts = d => (d >= 0 ? '+' : '−') + Math.abs(Math.round(d * 100)) ;
const fo = p => p > 0 && p < 1 ? fairOdds(p).toFixed(2).replace('.', ',') : '–';
const fdate = iso => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const NAMES = ['1', 'X', '2'];

// ---------- Contraste modelo–mercado ----------
export function marketBody(c, m) {
  const lab = ['1 · ' + m.home.name, 'X · Empate', '2 · ' + m.away.name], who = [m.home.name, 'el empate', m.away.name], x = c.x12;
  const k = x.idx, d = x.diff[k], more = d > 0;
  const head = c.level === 'alto' ? ['bad', '⚠️ El modelo y el mercado NO coinciden'] : c.level === 'medio' ? ['mid', '🟡 Pequeña diferencia'] : ['good', '✅ El modelo y el mercado coinciden'];
  const line = c.level === 'ok'
    ? 'Los dos ven el partido casi igual. Es buena señal, aunque no garantiza nada.'
    : `Con <b>${esc(who[k])}</b>, el modelo da <b>${p0(x.model[k])}</b> y el mercado <b>${p0(x.market[k])}</b>. El modelo está ${more ? 'más optimista' : 'más pesimista'} que el mercado.`
      + (c.level === 'alto' ? ` <b>Fíate más del mercado (${p0(x.market[k])}).</b> Cuando se separan tanto, el mercado suele acertar más: sabe de lesiones y alineaciones y el modelo no.` : '');
  const table = `<div class="card tw"><table class="tbl"><thead><tr><th class="l">1X2</th><th>Modelo</th><th>Mercado<small>sin margen</small></th><th>Diferencia<small>puntos</small></th></tr></thead><tbody>
    ${lab.map((l, i) => `<tr${i === k && c.level !== 'ok' ? ' class="dis"' : ''}><td class="l">${esc(l)}</td><td><b>${p0(x.model[i])}</b></td><td>${p0(x.market[i])}</td><td><b class="${Math.abs(x.diff[i]) >= DISAGREE ? 'dn' : ''}">${pts(x.diff[i])}</b></td></tr>`).join('')}
    ${c.ou ? `<tr><td class="l">Más de 2,5 goles</td><td><b>${p0(c.ou.model[0])}</b></td><td>${p0(c.ou.market[0])}</td><td><b class="${Math.abs(c.ou.diff[0]) >= DISAGREE ? 'dn' : ''}">${pts(c.ou.diff[0])}</b></td></tr>` : ''}</tbody></table></div>
    <p class="mu">Modelo = lo que calcula la app con los goles de los equipos. Mercado = lo que dicen las cuotas (sin el margen de la casa, ${p1(x.margin)}). Diferencia = modelo menos mercado. Aviso desde ${DISAGREE * 100} puntos de diferencia.</p>`;
  return `<div class="mk-${head[0]}"><b class="mk-t">${head[1]}</b><p>${line}</p></div><details class="mk-more"><summary>Ver tabla completa</summary>${table}</details>`;
}
export function marketHtml(pr, m) {
  const c = compareMarket(pr, m.odds);
  const stub = JSON.stringify({ p1: pr.p1, pX: pr.pX, p2: pr.p2 }).replace(/"/g, '&quot;');
  if (!c.x12) return `<h2>Modelo frente al mercado</h2><div class="card mkb" id="mk-live" data-live="1" data-pr="${stub}"><p class="mu">La fuente no trae cuotas 1X2 de este partido. Escribe las tres cuotas 1X2 en «Cuotas y valor» (más abajo) y aquí aparecerá el contraste con el mercado.</p></div>`;
  return `<h2>Modelo frente al mercado</h2><div class="mkb" id="mk-live" data-live="0">${marketBody(c, m)}</div>`;
}
// Versión en vivo con las cuotas que escribe la persona (solo si la fuente no trae 1X2).
export function liveMarket(box, odds, m) {
  const pr = JSON.parse(box.dataset.pr), c = compareMarket({ ...pr, over: { '2.5': 0 }, under: { '2.5': 0 } }, { b365: odds });
  box.innerHTML = c.x12 ? marketBody(c, m) : '<p class="mu">Escribe las tres cuotas 1X2 (más de 1,00) para ver el contraste con el mercado.</p>';
}

// ---------- Perfil de los equipos ----------
function fmt(mt, x) { return x.v == null ? '–' : mt.pct ? p0(x.v) : num(x.v, mt.d ?? 2); }
export function profileHtml(m, train) {
  const H = teamGames(train, m.home.id, 'home'), A = teamGames(train, m.away.id, 'away'), L = [...leagueGames(train, 'home'), ...leagueGames(train, 'away')];
  const ph = profile(H), pa = profile(A), pl = profile(L);
  let body = '';
  for (const mt of METRICS) {
    if (mt.grp) body += `<tr class="grp"><td class="l" colspan="4">${esc(mt.grp)}</td></tr>`;
    const nh = ph[mt.id].n, na = pa[mt.id].n, part = (n, tot) => n && n < tot ? `<small>${n}/${tot}</small>` : '';
    body += `<tr><td class="l">${esc(mt.label)}</td><td><b>${fmt(mt, ph[mt.id])}</b>${part(nh, H.length)}</td><td><b>${fmt(mt, pa[mt.id])}</b>${part(na, A.length)}</td><td>${fmt(mt, pl[mt.id])}</td></tr>`;
  }
  return `<div class="card tw"><table class="tbl prof"><thead><tr><th class="l">Por partido</th><th>${esc(m.home.name)}<small>en casa · ${H.length} part.</small></th><th>${esc(m.away.name)}<small>fuera · ${A.length} part.</small></th><th>Liga<small>por equipo</small></th></tr></thead><tbody>${body}</tbody></table></div>
    <p class="mu" style="margin-top:6px">Medias de esta temporada, solo con partidos anteriores a este. Cuando la fuente no trae un dato (remates, córners, tarjetas, descanso) en algún partido, solo se promedian los que lo tienen y se indica «n/total»; nunca se rellena con ceros. Goles por remate a puerta = goles / remates a puerta; el último de «Remates» mide qué parte de los tiros a puerta recibidos no acaba en gol.</p>`;
}

// ---------- Forma y calidad de los rivales ----------
export function formHtml(m, train, model) {
  const st = strengths(model);
  const one = (team, label) => {
    const r = recentWithOpponents(train, team.id, model, 5);
    if (!r.rows.length) return `<div class="card empty">${esc(team.name)}: aún sin partidos.</div>`;
    const rows = r.rows.slice().reverse().map(g => `<tr><td class="l">${fdate(g.kickoff)}</td><td class="l">${g.home ? 'vs' : '@'} ${esc(g.opp.name)}${g.rank ? `<small>${g.rank}º de ${r.n} · ${g.tier}</small>` : ''}</td><td><b>${g.gf}-${g.ga}</b></td><td><b class="${g.pts === 3 ? 'up' : g.pts === 0 ? 'dn' : ''}">${g.pts}</b>${g.expPts != null ? `<small>esp. ${num(g.expPts, 1)}</small>` : ''}</td></tr>`).join('');
    const diff = r.expPts != null ? r.pts - r.expPts : null;
    return `<div class="card tw"><table class="tbl"><thead><tr><th class="l" colspan="2">${esc(team.name)} <span class="mu">· ${label}</span></th><th>Resultado</th><th>Puntos</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="mu" style="margin:6px 0 12px">${r.pts} puntos en ${r.rows.length} partidos${r.expPts != null ? ` (el modelo esperaba ${num(r.expPts, 1)}: ${diff >= 0 ? 'rinde por encima' : 'rinde por debajo'} de lo previsto por ${num(Math.abs(diff), 1)} puntos)` : ''}${r.avgRank ? `. Rival medio: puesto ${num(r.avgRank, 1)} de ${r.n} por fuerza` : ''}.</p>`;
  };
  const note = st ? `Fuerza = ataque/defensa del modelo (puesto 1 = el más fuerte de ${st.n}). Los «puntos esperados» usan el mismo modelo, que ya incluye esos partidos: sirven para ver si el resultado fue mejor o peor de lo normal, no para predecir.` : '';
  return one(m.home, 'últimos 5, todos los campos') + one(m.away, 'últimos 5, todos los campos') + `<p class="mu">${note}</p>`;
}

// ---------- Clasificación en casa y fuera + carga ----------
export function tablesHtml(m, train, teams) {
  const tab = (venue, title) => {
    const rows = venueTable(train, teams, venue).map(r => `<tr${r.team.id === m.home.id || r.team.id === m.away.id ? ' class="me"' : ''}><td>${r.pos}</td><td class="l">${esc(r.team.name)}</td><td>${r.pj}</td><td><b>${r.pts}</b></td><td>${r.gf}-${r.gc}</td><td>${r.dg >= 0 ? '+' : '−'}${Math.abs(r.dg)}</td></tr>`).join('');
    return `<div class="card tw"><table class="tbl"><thead><tr><th colspan="2" class="l">${title}</th><th>PJ</th><th>Pts</th><th>GF-GC</th><th>DG</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  const ld = t => load(train, t.id, m.kickoff), a = ld(m.home), b = ld(m.away);
  const rest = x => x.rest == null ? '–' : x.rest + ' d';
  const carga = `<div class="card"><div class="st"><span></span><span><b>${esc(m.home.name)}</b> · <b>${esc(m.away.name)}</b></span></div>
    <div class="st"><span>Días desde su último partido de liga</span><span>${rest(a)} · ${rest(b)}</span></div>
    <div class="st"><span>Partidos de liga en 14 días</span><span>${a.last14} · ${b.last14}</span></div>
    <div class="st"><span>Partidos de liga en 30 días</span><span>${a.last30} · ${b.last30}</span></div>
    <p class="mu" style="margin-top:8px">Solo cuenta la liga: la fuente no trae copas ni competición europea, así que un equipo con descanso largo puede haber jugado entre medias. Es una pista, no un dato completo.</p></div>`;
  return `${carga}<div style="height:12px"></div>${tab('home', 'Solo partidos como local')}<div style="height:12px"></div>${tab('away', 'Solo partidos como visitante')}<p class="mu" style="margin-top:6px">Los dos equipos de este partido aparecen resaltados.</p>`;
}

// ---------- Enfrentamientos directos ----------
export function h2hHtml(m, train, prevSeason) {
  const h = headToHead(train, prevSeason, m.home.id, m.away.id, 8);
  if (!h.n) return `<div class="card empty"><p>Sin enfrentamientos directos en la temporada actual ni en la anterior (en esta fuente). No se completa con suposiciones.</p></div>`;
  const rows = h.rows.map(r => `<tr><td class="l">${fdate(r.kickoff)} ${new Date(r.kickoff).getFullYear()}</td><td class="l">${esc(r.home.name)} – ${esc(r.away.name)}</td><td><b>${r.h}-${r.a}</b></td></tr>`).join('');
  return `<div class="card tw"><table class="tbl"><tbody>${rows}</tbody></table></div>
    <p class="mu" style="margin-top:6px">Desde ${esc(m.home.name)}: ${h.w} victoria${h.w === 1 ? '' : 's'}, ${h.d} empate${h.d === 1 ? '' : 's'}, ${h.l} derrota${h.l === 1 ? '' : 's'}. Media ${num(h.gf, 1)}–${num(h.ga, 1)} goles · ambos marcan ${p0(h.btts)} · más de 2,5 ${p0(h.o25)}. Con ${h.n} partido${h.n === 1 ? '' : 's'} es una muestra muy pequeña: pesa mucho menos que la forma de cada equipo.</p>`;
}

// ---------- Más mercados del modelo ----------
export function extrasHtml(pr, m) {
  const e = extras(pr.xg.h, pr.xg.a), L = k => String(k).replace('.', ',');
  const line = k => `<tr><td class="l">${L(k)} goles</td><td><b>${p0(e.lines[k].over)}</b><small>@ ${fo(e.lines[k].over)}</small></td><td><b>${p0(e.lines[k].under)}</b><small>@ ${fo(e.lines[k].under)}</small></td></tr>`;
  const tm = (t, name) => [0.5, 1.5, 2.5].map(k => `<tr><td class="l">${esc(name)} marca más de ${L(k)}</td><td><b>${p0(e.team[t][k])}</b><small>@ ${fo(e.team[t][k])}</small></td></tr>`).join('');
  const mg = e.margin, mrow = (l, v) => `<tr><td class="l">${l}</td><td><b>${p0(v)}</b><small>@ ${fo(v)}</small></td></tr>`;
  const hc = e.handicaps.map(h => `<tr><td class="l">${esc(m.home.name)} ${h.line > 0 ? '+' : '−'}${L(Math.abs(h.line))}</td><td><b>${p0(h.win)}</b></td><td>${h.push > 0.0005 ? p0(h.push) : '–'}</td><td>${p0(h.lose)}</td><td>${h.fair === Infinity ? '–' : num(h.fair)}</td></tr>`).join('');
  const mx = Math.max(...e.matrix.flat()), G = e.matrix.length;
  const head = Array.from({ length: G }, (_, j) => `<th>${j}${j === G - 1 ? '+' : ''}</th>`).join('');
  const mrows = e.matrix.map((r, i) => `<tr><th>${i}${i === G - 1 ? '+' : ''}</th>${r.map(v => `<td style="background:rgba(59,130,246,${(0.08 + 0.8 * v / mx).toFixed(2)})">${(v * 100).toFixed(v >= 0.1 ? 0 : 1).replace('.', ',')}</td>`).join('')}</tr>`).join('');
  const hv = pr.halves ? `<div class="card tw"><table class="tbl"><thead><tr><th class="l">Goles por partes</th><th>Prob.</th></tr></thead><tbody>
      ${[['1ª parte: más de 0,5', pr.halves.ht.o05], ['1ª parte: más de 1,5', pr.halves.ht.o15], ['2ª parte: más de 0,5', pr.halves.h2.o05], ['2ª parte: más de 1,5', pr.halves.h2.o15]].map(([l, v]) => `<tr><td class="l">${l}</td><td><b>${p0(v)}</b><small>@ ${fo(v)}</small></td></tr>`).join('')}</tbody></table></div>
    <p class="mu" style="margin:6px 0 12px">Aproximación: los goles totales esperados del modelo se reparten con la proporción histórica de la liga (${p0(pr.halves.share)} en la 1ª parte). En la comprobación con 1.581 partidos reales se quedó unos 2 puntos corta en la 1ª parte y unos 4 en la 2ª: trátalo como orientativo. En Tendencias ves lo que pasó de verdad en los últimos partidos de ambos equipos.</p>` : '';
  return `${hv}<div class="card tw"><table class="tbl"><thead><tr><th class="l">Goles totales</th><th>Más</th><th>Menos</th></tr></thead><tbody>${[0.5, 1.5, 2.5, 3.5, 4.5, 5.5].map(line).join('')}</tbody></table></div>
    <div style="height:12px"></div>
    <div class="card tw"><table class="tbl"><thead><tr><th class="l">Goles por equipo y portería</th><th>Prob.</th></tr></thead><tbody>${tm('h', m.home.name)}${tm('a', m.away.name)}
      ${mrow('Portería a cero: ' + esc(m.home.name), e.cleanSheet.h)}${mrow('Portería a cero: ' + esc(m.away.name), e.cleanSheet.a)}
      ${mrow('Gana sin encajar: ' + esc(m.home.name), e.winToNil.h)}${mrow('Gana sin encajar: ' + esc(m.away.name), e.winToNil.a)}</tbody></table></div>
    <div style="height:12px"></div>
    <div class="card tw"><table class="tbl"><thead><tr><th class="l">Margen de victoria</th><th>Prob.</th></tr></thead><tbody>
      ${mrow(esc(m.home.name) + ' por 1', mg.h1)}${mrow(esc(m.home.name) + ' por 2', mg.h2)}${mrow(esc(m.home.name) + ' por 3 o más', mg.h3)}${mrow('Empate', mg.draw)}
      ${mrow(esc(m.away.name) + ' por 1', mg.a1)}${mrow(esc(m.away.name) + ' por 2', mg.a2)}${mrow(esc(m.away.name) + ' por 3 o más', mg.a3)}</tbody></table></div>
    <div style="height:12px"></div>
    <div class="card tw"><table class="tbl"><thead><tr><th class="l">Hándicap asiático</th><th>Gana</th><th>Devuelve</th><th>Pierde</th><th>Cuota justa</th></tr></thead><tbody>${hc}</tbody></table></div>
    <div style="height:12px"></div>
    <div class="card tw"><table class="tbl mx"><caption class="mu">Marcador exacto (filas: goles de ${esc(m.home.name)} · columnas: de ${esc(m.away.name)}) · %</caption><thead><tr><th></th>${head}</tr></thead><tbody>${mrows}</tbody></table></div>
    <p class="mu" style="margin-top:6px">Todo sale del mismo modelo Poisson independiente (misma estimación que el 1X2), así que comparte sus límites: sin lesiones ni alineaciones y sin la corrección de marcadores bajos (0-0, 1-1) de Dixon-Coles. La matriz cubre el ${p0(e.inGrid)} de la probabilidad (hasta 5 goles por equipo). «Cuota justa» = sin margen de la casa; en hándicap con devolución es 1 + P(pierde)/P(gana). No hay cuotas de la fuente para estos mercados: compara con la cuota real de tu casa en la calculadora.</p>`;
}

// ---------- Parámetros del modelo ----------
export function paramsHtml(pr, m, model) {
  const st = strengths(model), t = id => model.teams[id], h = t(m.home.id), a = t(m.away.id);
  const row = (l, x, y) => `<tr><td class="l">${l}</td><td>${x}</td><td>${y}</td></tr>`;
  return `<div class="card tw"><table class="tbl"><thead><tr><th class="l">Parámetro</th><th>${esc(m.home.name)}</th><th>${esc(m.away.name)}</th></tr></thead><tbody>
    ${row('Ataque (1,00 = media liga)', num(h.att), num(a.att))}${row('Defensa (menor = mejor)', num(h.def), num(a.def))}
    ${row('Fuerza = ataque / defensa', num(st.s[m.home.id]), num(st.s[m.away.id]))}${row('Puesto por fuerza', `${st.rank[m.home.id]}º de ${st.n}`, `${st.rank[m.away.id]}º de ${st.n}`)}
    ${row('Partidos usados (incl. temp. anterior)', h.n, a.n)}${row('Goles esperados (λ)', num(pr.xg.h), num(pr.xg.a))}</tbody></table></div>
    <p class="mu" style="margin-top:6px">Media de goles de la liga: ${num(model.avgH)} locales · ${num(model.avgA)} visitantes (${model.n} partidos). λ local = media local × ataque local × defensa visitante; λ visitante = media visitante × ataque visitante × defensa local. Ataque y defensa están encogidos hacia 1,00 con 4 partidos virtuales; los de la temporada anterior pesan la mitad.</p>`;
}
