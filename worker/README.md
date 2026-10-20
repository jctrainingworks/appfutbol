# Proxy de football-data.org

La API de football-data.org exige una clave (`X-Auth-Token`). Como la web es estática y pública,
la clave no puede ir en el navegador: este Worker la añade en el servidor y reenvía solo las rutas de lectura permitidas.

## Despliegue (una vez, ~5 min, plan gratuito de Cloudflare)
1. Crea una cuenta gratuita en https://www.football-data.org/client/register y copia tu clave.
2. Cloudflare → Workers & Pages → Create → Worker → pega `football-data-proxy.js` → Deploy.
3. En ese Worker: Settings → Variables and Secrets → añade un **Secret** llamado `FOOTBALL_DATA_TOKEN` con tu clave.
4. (Opcional) Variable `ALLOWED_ORIGINS` si sirves la app desde otro dominio distinto de `https://jctrainingworks.github.io`.
5. Copia la URL del Worker (`https://futbol-data-proxy.<tu-subdominio>.workers.dev`) en `js/config.js` → `proxyUrl`
   y cambia `provider` a `'footballdata'`.

Alternativa con CLI: `cd worker && npx wrangler secret put FOOTBALL_DATA_TOKEN && npx wrangler deploy`.

## Límites
- Plan gratuito de football-data.org: 12 competiciones, 10 llamadas/min, marcadores con retraso.
- El Worker cachea 5 min por URL para no agotar el cupo.
