# Estado del proyecto: App de análisis de fútbol (uso personal)

**Última actualización:** 22-oct-2026 (noche) · rama main (el último commit está en git log).
**Regla de mantenimiento:** al terminar cada bloque, actualizar este archivo (y la copia "estado.md" del Project de Claude) con lo hecho, lo probado, lo pendiente y el siguiente paso.

## 1. Qué es y para qué
App personal para analizar fútbol desde el móvil (PWA, tema oscuro, acentos azules), con la profundidad estadística de SoccerSTATS. Lo que más le importa a Juan: ver porcentajes por mercado (por ejemplo "1ª parte más de 0,5 goles: local 90% en casa, visitante 80% fuera"), que la app sugiera qué mercado tiene más probabilidad, y saber qué liga y qué equipo van mejor para cada mercado. Webs que consultaba a mano: SoccerSTATS, AdamChoi, FootyStats, Soccerway, TheStatsDontLie y la app Flashscore.

Repositorio: https://github.com/jctrainingworks/appfutbol · Web: GitHub Pages (Juan ya la ve en el móvil).

## 2. Cómo funciona (arquitectura real)
- Sin dependencias ni build: HTML + JavaScript modular + CSS. PWA (manifest + service worker en modo "primero red").
- **Datos reales, sin claves:** una tarea de GitHub Actions (.github/workflows/update-data.yml) se ejecuta cada día (07:20 UTC), al subir cambios en scripts/ y a mano. Descarga los CSV gratuitos de football-data.co.uk, los convierte con scripts/football-data-csv.mjs y guarda data/<liga>.json y data/index.json en el repo. Si una liga falla conserva lo anterior; nunca pisa con datos vacíos; si nada cambia no hace commit.
- La app lee esos JSON de su propia web (js/data/footballcsv.js). Si data/ no existe, cae a datos de demostración (marcados DEMO). Selección en js/data/index.js con la opción provider en js/config.js: auto (por defecto), demo o footballdata.
- Contrato de datos (definido en js/data/demo.js): leagues, league, match, matches, standings. Marcador: score {h, a, ht}; ht = marcador al descanso o null. Cada partido puede llevar st (shots, sot, corners, fouls, yellow, red como [local, visitante]) y odds (b365 = [1, X, 2], ou25 = [más 2,5, menos 2,5]).
- Modelos (funciones puras, sin red): js/model/poisson.js (Poisson independiente con ataque/defensa suavizados, mercados 1X2, doble oportunidad, más/menos 1,5/2,5/3,5, ambos marcan, cuota justa, valor esperado, backtest walk-forward con Brier y log-loss frente a una base ingenua) y js/model/trends.js (frecuencias k/n por mercado, 29 mercados: goles, 1ª y 2ª parte, corners, tarjetas, por equipo; media suavizada hacia la liga con 4 partidos virtuales; rankings de equipos y ligas).
- Vistas: Inicio (próximo partido, próximos, ligas por país, clasificación), Ligas (por país), Partidos, Análisis por partido (arriba, «Lectura del partido» y «Mercados favoritos»; después mercados más probables con orden por probabilidad o por ventaja sobre la liga, últimos 10 o temporada, modelo Poisson, validación, cuotas Bet365 con valor esperado), Análisis por mercado (mejor liga y equipo, filtros liga y casa/fuera). Combinadas e Historial son solo marcadores "próximamente".
- **Lectura del partido** (js/model/insight.js, funciones puras): resumen de un vistazo (goles esperados frente a la media de la liga → partido abierto/cerrado/normal, favorito según Poisson, forma de los últimos 5, posición en la clasificación, días de descanso, enfrentamientos previos esta temporada) y hasta 2 mercados favoritos de familias distintas: el más probable y el que más supera a la media de la liga. La probabilidad del favorito es la media de tendencia y modelo Poisson cuando ambos existen; si no coinciden (diferencia > 15 pts) se descarta; exige ≥ 55% (≥ 60% con muestra pequeña, con «confianza baja»). Muestra cuota justa y, si hay cuota Bet365 (1X2 y más/menos 2,5), valor esperado teórico. Siempre avisa de que NO hay datos de lesiones, sanciones ni alineaciones. Los umbrales son decisiones de diseño, no estadística validada.
- Alternativa preparada pero NO desplegada: proveedor footballdata.org (js/data/footballdata.js) con un Cloudflare Worker en worker/ que guarda la clave. Requiere cuenta, clave y despliegue de Juan.

## 3. Ligas disponibles (18, temporada actual)
Inglaterra (Premier, Championship, League One, League Two), Escocia (Premiership), España (LaLiga, LaLiga 2), Alemania (Bundesliga, 2. Bundesliga), Italia (Serie A, Serie B), Francia (Ligue 1, Ligue 2), Países Bajos (Eredivisie), Bélgica, Portugal, Turquía, Grecia. Al 21-oct había 1.448 partidos jugados, todos con descanso, corners, tarjetas y cuotas Bet365.

## 4. Decisiones tomadas (y por qué)
- Fuente = football-data.co.uk porque es gratuita, para uso personal, trae descanso, corners, tarjetas y cuotas, y no necesita claves ni cuentas (Juan pidió la opción con menos trabajo para él).
- Descartado: scrapear SoccerSTATS, FootyStats, Flashscore y similares (sus condiciones lo prohíben; no tienen API pública gratuita). Descartado: API-Football (Juan probó el plan gratuito y solo da datos hasta 2022). football-data.org gratis: no trae Noruega y no está confirmado el marcador al descanso. Sportmonks gratis: solo 2 ligas (dato de terceros, no contrastado). TheSportsDB: sin confirmar.
- El ranking usa porcentajes suavizados hacia la media de la liga para no premiar rachas cortas; siempre se muestra también k/n y la columna Liga.
- Tarjetas = amarillas + rojas (en Inglaterra y Escocia la 2ª amarilla que acaba en roja no cuenta como amarilla).

## 5. Qué está probado y qué no
- Probado (en el entorno de desarrollo, no en el móvil): conversor y descarga con CSV fabricados en el formato real; proveedor y todas las vistas con los datos reales descargados por la Action; recuentos a mano con datos reales (1ª parte, corners, tarjetas) y valor esperado coinciden con la app; capturas en tamaño móvil del Inicio, Ligas, Por mercado y Análisis de partido.
- Tests en el repositorio: tests/insight.test.mjs (ejecutar: node --test tests/insight.test.mjs). 22 pruebas pasan: unitarias de forma, descanso, enfrentamientos, elección de favoritos y valor esperado, más una por liga recorriendo TODOS los partidos reales terminados (máx. 2 favoritos, distintos, probabilidad y muestra mínimas, aviso de lesiones presente). No cubren poisson.js ni trends.js.
- Lectura del partido probada con datos reales en pantalla de móvil (390x844, Playwright) sin errores de consola. Aviso de descanso largo comprobado a mano (jornada 8 del Vallecano ausente en la fuente).
- No probado: la web desplegada en un móvil real por parte de Claude (Juan sí la ve y ha dado el visto bueno al diseño); el Worker de Cloudflare (nunca desplegado); la primera ejecución de la Action sí funcionó (commit b96fa8e).

## 6. Límites conocidos
- Próximos partidos: fixtures.csv de la fuente se actualiza cuando ellos quieren y solo cubre algunas ligas (el 22-oct a las 19:00 traía 27 filas de E1, E2, E3, SC1 y SP1, todas del 20-21 oct, ya jugadas: aún no estaba la jornada del fin de semana aunque Flashscore sí la tuviera). La descarga ahora corre cada 4 horas y data/index.json guarda un diagnóstico (campo fixtures: filas, ligas, fechas desde/hasta, guardados) para ver qué publicó la fuente. A veces no hay ninguno. Cuando no hay ninguno, Análisis ofrece los últimos 30 partidos jugados (con aviso) para poder revisar la lectura. No hay marcadores en directo; los datos se actualizan unas 2 veces por semana en origen.
- Noruega y otras ligas pequeñas: no hay fuente gratuita con descanso. Pendiente de decidir si se paga (API-Football desde 19 $/mes) o se prescinde.
- Muestras pequeñas al principio de temporada (4-9 partidos por equipo); la app avisa cuando hay menos de 5.
- Escudos: la fuente no trae ninguno; la app muestra iniciales de color. Opciones estudiadas: TheSportsDB gratis no sirve (búsqueda limitada a 1 equipo, lista de 10); football-data.org trae escudos de unas pocas ligas pero necesita cuenta y clave (secreto del repo); pendiente de decidir con Juan.
- Hora de los partidos: se asume hora británica (parece cuadrar con partidos reales). La jornada se estima (el CSV no la trae). Solo hay temporada actual (sin histórico de temporadas anteriores).
- Los favoritos NO son apuestas de valor: son los mercados más probables y consistentes según los datos. Sin cuotas de la casa para ese mercado no se puede saber si hay valor. Lesiones y alineaciones: fuente sin datos; revisar a mano.
- Valor esperado: teórico y basado en un Poisson simple (sin forma reciente, lesiones ni calidad del rival). No es una señal de apuesta; la pantalla lo avisa.
- Solo hay cuotas Bet365 de 1X2 y más/menos 2,5. Introducción manual de cuotas: no implementada.

## 7. Dónde vamos (siguiente)
0. Probar la lectura del partido en el móvil real y decidir si los umbrales (55%, 15 pts, 5 partidos) se ajustan.
1. Decidir con Juan: Historial (guardar pronósticos y medir rendimiento; necesita Supabase, aún no conectado) o Combinadas (con correlaciones; no necesita almacenamiento).
2. Ampliar tests a poisson.js y trends.js.
3. Introducción manual de cuotas para otros mercados.
4. Mejorar el modelo (forma reciente, ponderar por antigüedad, Dixon-Coles) validando con backtest.
5. Más datos: temporadas anteriores (para muestras mayores) y una fuente para Noruega si Juan decide pagar o hay otra gratuita.

## 8. Cómo trabajar en este proyecto
- Juan no es técnico: explicar en llano, sin pedirle pasos complicados; decidir lo técnico y avisar de lo importante. Nunca pegar claves en el chat.
- Claude accede al repo con la herramienta del entorno (add_repo) y clona en /home/claude/appfutbol; publica con commit y push a main. Verificar siempre que el HEAD remoto coincide.
- El entorno de Claude no puede abrir football-data.co.uk ni la web desplegada con curl; se lee con WebFetch. La Action de GitHub sí descarga.
- Probar en local: python3 -m http.server 8765 en la carpeta del repo; capturas móviles con Playwright (viewport 390x844).
