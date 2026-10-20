# Fútbol Analytics (uso personal)

App estática (HTML + JS modular, sin dependencias ni build) para analizar fútbol. PWA instalable.

**Estado actual:** interfaz y navegación con **datos de demostración ficticios** (marcados como DEMO en la app).
Aún no hay fuente real, Supabase ni motor estadístico conectados.

## Estructura
- `index.html` – entrada. `manifest.webmanifest` + `sw.js` – PWA.
- `js/config.js` – único punto de configuración (`provider`). Solo claves públicas; nunca secretos.
- `js/data/` – capa de datos. `demo.js` define el contrato que debe cumplir cualquier proveedor real
  (`leagues, league, match, matches, standings`). `standings.js` es una función pura reutilizable.
- `js/views/` – vistas (Inicio, Ligas, Partidos y marcadores de Análisis/Combinadas/Historial).

## Probar en local
`python3 -m http.server 8000` y abrir http://localhost:8000
