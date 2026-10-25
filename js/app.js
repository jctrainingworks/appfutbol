import { data } from './data/index.js';
import { icon, esc } from './ui.js';
import home from './views/home.js';
import { ligas, liga } from './views/leagues.js';
import { partidos, partido } from './views/matches.js';
import { analisis, analisisPartido } from './views/analysis.js';
import { mercados } from './views/markets.js';
import { historial } from './views/history.js';
import { soon } from './views/soon.js';

const NAV = [['', 'Inicio', 'home'], ['ligas', 'Ligas', 'trophy'], ['partidos', 'Partidos', 'cal'], ['analisis', 'Análisis', 'chart'], ['combinadas', 'Combinadas', 'layers'], ['historial', 'Historial', 'clock']];
const ROUTES = [['', home], ['ligas', ligas], ['ligas/:id', liga], ['partidos', partidos], ['partidos/:id', partido],
  ['analisis', p => p.q.get('t') === 'mercados' ? mercados(p) : analisis(p)], ['analisis/:id', analisisPartido], ['combinadas', soon('combinadas')], ['historial', historial]];

const $ = s => document.querySelector(s);
const CREDITS = '<p class="credits">Escudos: <a href="https://www.footylogos.com" target="_blank" rel="noopener">FootyLogos.com</a> y football-logos.cc, propiedad de sus clubes · Datos: football-data.co.uk y fixturedownload.com · Uso personal</p>';
$('#nav').innerHTML = NAV.map(([p, l, i]) => `<a href="#/${p}" data-p="${p}">${icon(i)}<span>${l}</span></a>`).join('');
$('#src').textContent = data.meta.isDemo ? 'DEMO' : data.meta.label;
$('#src').hidden = !data.meta.isDemo;

function match(segs) {
  for (const [pat, fn] of ROUTES) {
    const ps = pat ? pat.split('/') : [];
    if (ps.length !== segs.length) continue;
    const params = {};
    if (ps.every((p, i) => p[0] === ':' ? (params[p.slice(1)] = decodeURIComponent(segs[i]), true) : p === segs[i])) return [fn, params];
  }
}

async function render() {
  const [path, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const segs = path.split('/').filter(Boolean), found = match(segs);
  const top = segs[0] || '';
  document.querySelectorAll('#nav a').forEach(a => a.toggleAttribute('aria-current', a.dataset.p === top));
  document.title = (NAV.find(n => n[0] === top)?.[1] || 'Fútbol') + ' · Fútbol Analytics';
  try {
    $('#view').innerHTML = found ? await found[0]({ ...found[1], q: new URLSearchParams(qs) }) : '<div class="card empty">Página no encontrada.</div>';
  } catch (e) {
    console.error(e);
    $('#view').innerHTML = `<div class="card empty">No se pudo cargar esta sección: ${esc(e.message)}</div>`;
  }
  $('#view').insertAdjacentHTML('beforeend', CREDITS);
  scrollTo(0, 0);
}

addEventListener('hashchange', render);
render();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
