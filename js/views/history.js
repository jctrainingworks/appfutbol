// Pantalla Historial: ¿acierta el modelo de verdad? Lee data/history.json (lo escribe la tarea de GitHub: pronóstico ANTES del partido
// y resultado después) y calcula las estadísticas con js/model/history.js. Nada de esto sale de intuiciones: son cuentas sobre lo guardado.
import { data } from '../data/index.js';
import { MODEL_VERSION, VALUE_EV, VOID_DAYS, summarize, result1x2 } from '../model/history.js';
import { esc, chips, empty } from '../ui.js';
import { misApuestas } from './mybets.js';

const num = (x, d = 3) => x == null ? '–' : x.toFixed(d).replace('.', ',');
const pc0 = p => p == null ? '–' : Math.round(p * 100) + '%';
const pc1 = p => p == null ? '–' : (p * 100).toFixed(1).replace('.', ',') + '%';
const sg = (x, d = 1) => x == null ? '–' : (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(d).replace('.', ',') + '%';
const dec = x => x == null ? '–' : x.toFixed(2).replace('.', ',');
const fdate = iso => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const fdt = iso => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });

async function load() {
  try {
    const r = await fetch(new URL('../../data/history.json', import.meta.url), { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.records) ? j : null;
  } catch { return null; }
}

// ¿El modelo es mejor, peor o no se distingue de la referencia? d = diferencia de error (modelo − referencia) pareada partido a partido:
// negativa = el modelo se equivoca menos. Solo se afirma algo si la diferencia supera 2 errores típicos (el ruido esperable por azar).
function cmp(d, min = 30) {
  if (!d || d.se == null || d.n < min) return { cls: 'mu', txt: `Aún pocos partidos (${d ? d.n : 0}): no se puede concluir nada.` };
  const z = d.mean / d.se;
  if (z <= -2) return { cls: 'up', txt: 'Mejor: la diferencia es mayor que el ruido del azar.' };
  if (z >= 2) return { cls: 'dn', txt: 'Peor: la diferencia es mayor que el ruido del azar.' };
  return { cls: 'mu', txt: `${d.mean < 0 ? 'Algo mejor' : 'Algo peor'}, pero dentro del ruido del azar: no se distingue.` };
}
const verdictLine = (label, d) => { const v = cmp(d); return `<div class="st"><span>${label}</span><span class="vd ${v.cls}">${esc(v.txt)}</span></div>`; };

const mark = v => v === true ? '<b class="ok">✓</b>' : v === false ? '<b class="ko">✗</b>' : '<b class="mu">·</b>';

function rowHtml(r, lgName) {
  const top = r.p.indexOf(Math.max(...r.p)), label = [`Gana ${r.h.name}`, 'Empate', `Gana ${r.a.name}`][top];
  const picks = r.fav.map((f, i) => `<span class="pk">${mark(r.r ? r.r.f[i] : undefined)} ${esc(f.label)} <small>${pc0(f.p)}${f.odds ? ` · @${dec(f.odds)}` : ''}</small></span>`).join('');
  return `<div class="hrow"><div class="hd">${fdate(r.k)}${lgName ? `<small>${esc(lgName)}</small>` : ''}</div>
    <div class="hb"><b>${esc(r.h.name)} – ${esc(r.a.name)}</b>
      <span class="mu">1X2 del modelo ${r.p.map(pc0).join(' / ')} → ${esc(label)} ${r.r ? mark(result1x2(r.r) === top) : ''}</span>${picks}</div>
    <div class="hs">${r.r ? `${r.r.h}-${r.r.a}` : '–'}</div></div>`;
}

function statsHtml(s) {
  const x = s.x12, mk = x.market, parts = [];
  // 1) 1X2
  parts.push(`<h2>¿Acierta el modelo? Resultado 1X2</h2><div class="card tw"><table class="tbl"><thead><tr><th class="l">Quién predice</th><th>Error<small>Brier, menor = mejor</small></th><th>Acierta el<small>más probable</small></th></tr></thead><tbody>
    <tr><td class="l"><b>Modelo</b><small>${x.n} partidos</small></td><td><b>${num(x.model.brier)}</b></td><td><b>${pc0(x.model.hit)}</b></td></tr>
    <tr><td class="l">Base de la liga<small>solo frecuencias de la liga</small></td><td>${num(x.base.brier)}</td><td>–</td></tr>
    ${mk ? `<tr><td class="l">Mercado (Bet365 sin margen)<small>${mk.n} partidos con cuota</small></td><td>${num(mk.brier)}</td><td>${pc0(mk.hit)}</td></tr>
    <tr><td class="l">Modelo en esos mismos<small>${mk.n} partidos</small></td><td>${num(mk.modelBrier)}</td><td>–</td></tr>` : ''}</tbody></table></div>
    <div class="card">${verdictLine('Modelo frente a la base de la liga', x.vsBase)}${mk ? verdictLine('Modelo frente al mercado', mk.vsModel) : '<div class="st"><span>Modelo frente al mercado</span><span class="vd mu">Aún sin partidos con cuota Bet365.</span></div>'}</div>
    <p class="mu" style="margin-top:6px">Error de Brier: cuanto más bajo, mejor (predecir ⅓-⅓-⅓ siempre da 0,667). El mercado es la vara de medir exigente: las casas de apuestas ya incluyen mucha más información (lesiones, alineaciones, dinero apostado). Si el modelo no iguala al mercado, sus «valores» sobre la cuota casi siempre serán errores del modelo, no ventajas.</p>`);
  // 2) Más/menos 2,5
  const o = s.ou;
  parts.push(`<div class="card" style="margin-top:12px"><b>Más/menos 2,5 goles</b> <span class="mu">(${o.n} partidos)</span>
    <div class="st"><span>Error del modelo / base de la liga${o.market ? ' / mercado' : ''}</span><span>${num(o.model)} / ${num(o.base)}${o.market ? ` / ${num(o.market.brier)}` : ''}</span></div>
    ${verdictLine('Modelo frente a la base', o.vsBase)}${o.market ? verdictLine('Modelo frente al mercado', o.market.vsModel) : ''}</div>`);
  // 3) Calibración
  if (s.calib.length) parts.push(`<h2>Calibración: ¿lo que dice que pasa, pasa?</h2><div class="card tw"><table class="tbl"><thead><tr><th class="l">El modelo daba</th><th>Casos</th><th>Dio de media</th><th>Pasó de verdad</th></tr></thead><tbody>
    ${s.calib.map(b => `<tr><td class="l">${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}%</td><td>${b.n}</td><td>${pc0(b.pred)}</td><td><b class="${Math.abs(b.obs - b.pred) > 0.1 && b.n >= 20 ? 'ko' : ''}">${pc0(b.obs)}</b></td></tr>`).join('')}</tbody></table></div>
    <p class="mu" style="margin-top:6px">Cada partido aporta tres casos (local, empate, visitante). Si el modelo está bien calibrado, las dos últimas columnas se parecen. Con pocos casos por tramo (menos de 20) las diferencias son ruido.</p>`);
  // 4) Favoritos
  const f = s.favs;
  if (f) parts.push(`<h2>Mercados favoritos</h2><div class="card">
    <div class="st"><span>Se cumplieron</span><span><b>${f.k}/${f.n}</b> (${pc0(f.rate)}) · intervalo 95%: ${pc0(f.ci[0])}–${pc0(f.ci[1])}</span></div>
    <div class="st"><span>El modelo esperaba de media</span><span>${pc0(f.pred)}</span></div>
    ${f.byConf.map(g => `<div class="st"><span>Confianza ${g.conf}</span><span>${g.k}/${g.n} (${pc0(g.k / g.n)}) · esperado ${pc0(g.pred)}</span></div>`).join('')}
    ${f.priced ? `<div class="st"><span>Con cuota Bet365 (${f.priced.n} favoritos)</span><span>rentabilidad <b class="ev ${f.priced.roi > 0 ? 'up' : 'dn'}">${sg(f.priced.roi)}</b> ± ${pc1(2 * (f.priced.se || 0))}</span></div>` : ''}</div>
    <p class="mu" style="margin-top:6px">Si «se cumplieron» queda claramente por debajo de «esperaba», el modelo es demasiado optimista en esos mercados. El intervalo dice cuánto puede moverse el porcentaje solo por azar.${f.unknown ? ` ${f.unknown} favorito${f.unknown > 1 ? 's' : ''} no se pudo${f.unknown > 1 ? 'ieron' : ''} comprobar (la fuente no trae ese dato).` : ''} La cuota solo existe para 1X2 y más/menos 2,5.</p>`);
  // 5) Apuestas de valor
  const v = s.value;
  if (v) parts.push(`<h2>Apuestas de valor teóricas</h2><div class="card">
    <div class="st"><span>Selecciones con valor esperado ≥ +${Math.round(VALUE_EV * 100)}% (1 unidad cada una)</span><span><b>${v.n}</b> de ${v.baseline.n}</span></div>
    ${v.n ? `<div class="st"><span>Ganadas</span><span>${v.k}/${v.n} (${pc0(v.k / v.n)}) · el modelo esperaba ${pc0(v.avgP)}</span></div>
    <div class="st"><span>Rentabilidad</span><span><b class="ev ${v.roi > 0 ? 'up' : 'dn'}">${sg(v.roi)}</b> ± ${pc1(2 * (v.se || 0))} <small class="mu">(cuota media ${dec(v.avgOdds)})</small></span></div>` : '<div class="st"><span>Aún ninguna selección con valor</span><span>–</span></div>'}
    <div class="st"><span>Referencia: apostar a TODAS las selecciones</span><span>${sg(v.baseline.roi)} ± ${pc1(2 * (v.baseline.se || 0))}</span></div></div>
    <p class="mu" style="margin-top:6px">Es el test definitivo del «valor esperado» de la calculadora: si el modelo encontrara valor real, la rentabilidad de estas selecciones sería claramente mejor que apostar a todo (que ronda −margen de la casa) y no solo en 20 apuestas. El «±» es el ruido que el azar produce por sí solo (2 errores típicos). Teórico: sin comisiones, sin limitaciones de cuenta y con la cuota del momento del pronóstico.</p>`);
  return parts.join('');
}

export const historial = async ({ q }) => {
  const head = '<h1>Historial</h1><p class="mu">Tus apuestas reales y, más abajo, si el modelo acierta de verdad: antes de cada partido se guarda lo que decía (probabilidades, favoritos y cuotas de ese momento) y cuando termina se compara con lo que pasó. Se guardan todos los próximos partidos, no solo los que parecen buenos.</p>';
  if (data.meta.isDemo) return `${head}${empty('Con datos de demostración no hay historial: solo se guarda con datos reales.')}`;
  const mine = await misApuestas(), hist = await load();
  if (!hist || !hist.records.length) return `${head}${mine}<h2>Pronósticos del modelo</h2>${empty('Todavía no hay pronósticos guardados. La tarea automática (cada 4 horas) empezará a guardarlos con los próximos partidos y aparecerán aquí.')}`;
  const lg = q.get('l') || '', leagues = await data.leagues(), names = Object.fromEntries(leagues.map(l => [l.id, l.name]));
  const recs = hist.records, inLg = [...new Set(recs.map(r => r.l))].filter(id => names[id]);
  const s = summarize(recs, { league: lg || null }), href = l => `#/historial${l ? '?l=' + encodeURIComponent(l) : ''}`;
  const filt = inLg.length > 1 ? chips([[href(''), 'Todas', !lg], ...inLg.map(id => [href(id), names[id], lg === id])]) : '';
  const cur = recs.filter(r => r.v === MODEL_VERSION && (!lg || r.l === lg));
  const done = cur.filter(r => r.r).sort((a, b) => a.k < b.k ? 1 : -1).slice(0, 30), todo = cur.filter(r => !r.r && !r.x).sort((a, b) => a.k < b.k ? -1 : 1).slice(0, 12);
  const summary = `<div class="card"><div class="vk" style="grid-template-columns:repeat(3,1fr)"><div><b>${s.settled}</b><small>con resultado</small></div><div><b>${s.pending}</b><small>pendientes</small></div><div><b>${s.total}</b><small>guardados</small></div></div>
    <p class="mu" style="margin-top:10px">${s.since ? `Se guarda desde el ${fdt(s.since)}. ` : ''}Modelo versión ${MODEL_VERSION}${s.otherVersions ? ` (${s.otherVersions} pronósticos de versiones anteriores no se cuentan para no mezclar modelos)` : ''}.${s.void ? ` ${s.void} partido${s.void > 1 ? 's' : ''} sin resultado tras ${VOID_DAYS} días (aplazados o anulados) no cuentan.` : ''}</p></div>`;
  let body;
  if (!s.settled) body = `<div class="demo">Aún no ha terminado ningún partido de los guardados. En cuanto se jueguen (y la tarea automática los recoja, máximo 4 horas después) verás aquí si el modelo acertó.</div>`;
  else {
    const small = s.settled < 100 ? `<div class="demo">Solo ${s.settled} partidos con resultado: con menos de unos 100 los porcentajes bailan mucho por azar y no se puede concluir si el modelo funciona. Mira el «±» y los intervalos, no solo el número.</div>` : '';
    body = small + statsHtml(s);
  }
  const lists = `${done.length ? `<h2>Últimos partidos con resultado</h2><div class="card list">${done.map(r => rowHtml(r, lg ? '' : names[r.l])).join('')}</div>` : ''}
    ${todo.length ? `<h2>Próximos con pronóstico guardado</h2><div class="card list">${todo.map(r => rowHtml(r, lg ? '' : names[r.l])).join('')}</div>` : ''}`;
  const how = `<details class="fold"><summary>Cómo se calcula</summary><p class="mu">Cada 4 horas, tras actualizar los datos, la tarea de GitHub recorre los partidos que aún no han empezado y guarda su pronóstico con el mismo código que usa la pantalla Análisis, solo con partidos anteriores. Mientras el partido no empieza, el pronóstico se refresca con los datos y cuotas más recientes; al empezar queda congelado. Cuando aparece el resultado se anota y se comprueba cada favorito. No hay pronósticos retroactivos.</p>
    <p class="mu">Las cuotas Bet365 solo existen para 1X2 y más/menos 2,5 y no para todos los partidos; por eso el mercado y las apuestas de valor usan menos partidos que el resto. Lesiones y alineaciones no están en la fuente: el modelo no las conoce.</p></details>`;
  return `${head}${mine}<h2>Pronósticos del modelo</h2>${filt}${summary}${body}${lists}${how}`;
};
