// Proxy mínimo para football-data.org (Cloudflare Worker).
// La clave vive SOLO como secreto del Worker (FOOTBALL_DATA_TOKEN); el navegador nunca la ve.
// - Solo permite GET y un conjunto cerrado de rutas de lectura.
// - Solo deja pasar los parámetros de consulta conocidos.
// - Cachea en el borde para respetar el límite gratuito (10 llamadas/min).
// - CORS limitado a los orígenes de ALLOWED_ORIGINS (separados por comas).

const UPSTREAM = 'https://api.football-data.org/v4';
const ROUTES = [
  /^\/competitions$/,
  /^\/competitions\/[A-Z0-9]{2,6}\/matches$/,
  /^\/competitions\/[A-Z0-9]{2,6}\/standings$/,
];
const PARAMS = ['season', 'status', 'matchday', 'dateFrom', 'dateTo', 'stage', 'group'];
const TTL = 300; // segundos de caché; los datos del plan gratuito van con retraso de todos modos
const DEFAULT_ORIGINS = 'https://jctrainingworks.github.io,http://localhost:8000';

const json = (body, status, headers) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
});

export default {
  async fetch(req, env, ctx) {
    const origins = (env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map(s => s.trim());
    const origin = req.headers.get('Origin');
    const cors = {
      'access-control-allow-origin': origins.includes(origin) ? origin : origins[0],
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'vary': 'Origin',
    };

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'GET') return json({ error: 'Método no permitido' }, 405, cors);
    if (origin && !origins.includes(origin)) return json({ error: 'Origen no permitido' }, 403, cors);

    const url = new URL(req.url);
    if (!ROUTES.some(r => r.test(url.pathname))) return json({ error: 'Ruta no permitida' }, 404, cors);
    if (!env.FOOTBALL_DATA_TOKEN) return json({ error: 'Falta el secreto FOOTBALL_DATA_TOKEN en el Worker' }, 500, cors);

    const up = new URL(UPSTREAM + url.pathname);
    for (const k of PARAMS) if (url.searchParams.has(k)) up.searchParams.set(k, url.searchParams.get(k));

    const cache = caches.default, key = new Request(up.toString());
    let res = await cache.match(key);
    if (!res) {
      const r = await fetch(up, { headers: { 'X-Auth-Token': env.FOOTBALL_DATA_TOKEN } });
      res = new Response(r.body, r);
      res.headers.set('Cache-Control', `public, max-age=${r.ok ? TTL : 15}`);
      if (r.ok) ctx.waitUntil(cache.put(key, res.clone()));
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
