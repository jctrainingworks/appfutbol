# Fútbol Analytics (uso personal)

App estática (HTML + JS modular, sin dependencias ni build) para analizar fútbol. PWA instalable.

**Estado actual:** interfaz y navegación completas con **datos de demostración ficticios** (marcados como DEMO).
Ya existe el proveedor real de **football-data.org** (`js/data/footballdata.js`) y su proxy (`worker/`), pero
**no está activo** hasta desplegar el Worker y rellenar `proxyUrl` en `js/config.js`. Aún no hay Supabase ni motor estadístico.

## Estructura
- `index.html` – entrada. `manifest.webmanifest` + `sw.js` – PWA.
- `js/config.js` – único punto de configuración (`provider`, `proxyUrl`, `competitions`). Solo valores públicos; nunca secretos.
- `js/data/` – capa de datos. `demo.js` define el contrato (`leagues, league, match, matches, standings`);
  `footballdata.js` lo implementa con datos reales; `standings.js` es una función pura compartida.
- `js/views/` – vistas (Inicio, Ligas, Partidos y marcadores de Análisis/Combinadas/Historial).
- `worker/` – Cloudflare Worker que guarda la clave de football-data.org en el servidor. Ver `worker/README.md`.

## Fuente de datos real (football-data.org, plan gratuito)
12 competiciones, 10 llamadas/min, marcadores con retraso. Por defecto: LaLiga, Premier, Bundesliga, Serie A y Ligue 1.
Una llamada por liga (partidos de la temporada); la clasificación se calcula en cliente, así que el desempate puede
diferir del oficial en casos de igualdad. Para el modelo se usa el marcador a 90 min.

## Probar en local
`python3 -m http.server 8000` y abrir http://localhost:8000
