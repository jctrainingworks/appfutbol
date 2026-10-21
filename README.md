# Fútbol Analytics (uso personal)

App estática (HTML + JS modular, sin dependencias ni build) para analizar fútbol. PWA instalable.

**Estado actual:** la app lee **datos reales** de `data/` (los genera una tarea diaria de GitHub desde football-data.co.uk).
Si `data/` aún no existe, muestra datos de **demostración** ficticios, marcados como DEMO. Aún no hay Supabase.
El motor estadístico (Poisson y tendencias por mercado) alimenta la pestaña Análisis.

## Estructura
- `index.html` – entrada. `manifest.webmanifest` + `sw.js` – PWA.
- `js/config.js` – único punto de configuración (`provider`, `proxyUrl`, `competitions`). Solo valores públicos; nunca secretos.
- `js/data/` – capa de datos. `demo.js` define el contrato (`leagues, league, match, matches, standings`);
  `footballdata.js` lo implementa con datos reales; `standings.js` es una función pura compartida.
- `scripts/` + `.github/workflows/update-data.yml` – descarga diaria de los CSV y conversión a `data/*.json`.
- `js/model/poisson.js` – modelo Poisson (1X2, doble oportunidad, goles, ambos marcan, cuotas justas, EV) y backtest walk-forward. Funciones puras.
- `js/views/` – vistas (Inicio, Ligas, Partidos y marcadores de Análisis/Combinadas/Historial).
- `worker/` – Cloudflare Worker que guarda la clave de football-data.org en el servidor. Ver `worker/README.md`.

## Fuente de datos (football-data.co.uk, sin claves)
CSV gratuitos para uso personal: resultados, marcador al descanso, corners, tarjetas, tiros y cuotas Bet365. Se actualizan unas
2 veces por semana (sin directos). Próximos partidos: solo los de `fixtures.csv` (pocas ligas, ~2 días). Hora asumida: británica.
La jornada se estima. Solo temporada actual, así que al principio de temporada las muestras son pequeñas.
Alternativas ya preparadas: `provider: 'footballdata'` (API con clave vía `worker/`, ligas grandes sin descanso garantizado).

## Probar en local
`python3 -m http.server 8000` y abrir http://localhost:8000
