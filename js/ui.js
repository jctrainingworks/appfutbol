import { CRESTS } from './crests.js';
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const I = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
};
export const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${I[n]}"/></svg>`;

const dayKey = iso => new Date(iso).toLocaleDateString('sv');
export const fmtTime = iso => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
export function dayLabel(iso) {
  const k = dayKey(iso), t = Date.now();
  if (k === dayKey(t)) return 'Hoy';
  if (k === dayKey(t + 864e5)) return 'Mañana';
  if (k === dayKey(t - 864e5)) return 'Ayer';
  const s = new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return s[0].toUpperCase() + s.slice(1);
}

export const crest = (team, big) => {
  const h = [...team.id].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360;
  const ini = team.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  // Con escudo: imagen sobre fondo transparente; si no carga, se quita y quedan las iniciales de color.
  const img = CRESTS.has(team.id) ? `<img src="${new URL(`../crests/${team.id}.png`, import.meta.url).href}" alt="" loading="lazy" onerror="this.parentNode.classList.remove('img');this.remove()">` : '';
  return `<span class="crest${big ? ' lg' : ''}${img ? ' img' : ''}" style="--h:${h}">${img}${esc(ini)}</span>`;
};

export const matchRow = (m, league) => {
  const fin = m.status === 'FT', w = (a, b) => fin && a > b ? ' w' : '';
  return `<a class="match" href="#/partidos/${esc(m.id)}">
    <span class="mt">${fin ? 'FT' : fmtTime(m.kickoff)}<small>J${m.round}</small></span>
    <span class="teams">${league ? `<span class="lgn">${esc(league)}</span>` : ''}
      <span class="tm${w(m.score?.h, m.score?.a)}">${crest(m.home)}<span class="n">${esc(m.home.name)}</span></span>
      <span class="tm${w(m.score?.a, m.score?.h)}">${crest(m.away)}<span class="n">${esc(m.away.name)}</span></span></span>
    <span class="scs">${fin ? `<b>${m.score.h}</b><b>${m.score.a}</b>` : ''}</span></a>`;
};

export const groupByDay = (list, league) => {
  let last = '', out = '';
  for (const m of list) {
    const k = dayKey(m.kickoff);
    if (k !== last) { out += `<div class="day">${dayLabel(m.kickoff)}</div>`; last = k; }
    out += matchRow(m, league?.[m.leagueId]);
  }
  return out ? `<div class="card list">${out}</div>` : empty('No hay partidos con este filtro.');
};

export const dots = f => f.map(c => `<i class="f ${c}" title="${c}"></i>`).join('');
export const empty = t => `<div class="card empty">${esc(t)}</div>`;

export const table = (rows, mini) => `<div class="card tw"><table class="tbl"><thead><tr><th>#</th><th class="l">Equipo</th><th>PJ</th>
  ${mini ? '' : '<th class="hm">G</th><th class="hm">E</th><th class="hm">P</th><th class="hm">GF:GC</th>'}<th>DG</th><th>Pts</th>${mini ? '' : '<th class="hm l">Forma</th>'}</tr></thead><tbody>
  ${rows.map(r => `<tr><td>${r.pos}</td><td class="l"><span class="tm">${crest(r.team)}<span class="n">${esc(r.team.name)}</span></span></td><td>${r.pj}</td>
  ${mini ? '' : `<td class="hm">${r.g}</td><td class="hm">${r.e}</td><td class="hm">${r.p}</td><td class="hm">${r.gf}:${r.gc}</td>`}<td>${r.dg > 0 ? '+' : ''}${r.dg}</td><td><b>${r.pts}</b></td>${mini ? '' : `<td class="hm l">${dots(r.form)}</td>`}</tr>`).join('')}
  </tbody></table></div>`;

export const chips = items => `<div class="chips">${items.map(([href, label, on]) => `<a class="chip" href="${href}"${on ? ' aria-current="true"' : ''}>${esc(label)}</a>`).join('')}</div>`;

// Ligas agrupadas por país (respeta el orden de aparición).
export const byCountry = leagues => {
  const m = new Map();
  for (const l of leagues) { const c = l.country || 'Otras'; if (!m.has(c)) m.set(c, []); m.get(c).push(l); }
  return [...m];
};
export const countryRows = leagues => `<div class="card list">${byCountry(leagues).map(([c, ls]) => `<div class="cty"><span>${esc(c)}</span><div class="chips wrap">${ls.map(l => `<a class="chip" href="#/ligas/${esc(l.id)}">${esc(l.name)}</a>`).join('')}</div></div>`).join('')}</div>`;

export const analysisTabs = active => chips([['#/analisis', 'Por partido', active === 'p'], ['#/analisis?t=mercados', 'Por mercado', active === 'm']]);
