// Descarga los CSV de football-data.co.uk y escribe data/<liga>.json + data/index.json.
// Lo ejecuta GitHub Actions (.github/workflows/update-data.yml); también se puede lanzar a mano: node scripts/fetch-data.mjs
// Tolerante a fallos: si una liga no se descarga, se conserva su fichero anterior. Nunca se sobrescribe con datos vacíos.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LEAGUES, seasonCode, resultsUrl, FIXTURES_URL, toObjects, buildLeague, SOURCE } from './football-data-csv.mjs';

async function get(fetchFn, url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchFn(url, { headers: { 'user-agent': 'appfutbol-personal/1.0 (uso personal)' } });
      if (r.ok) return await r.text();
      err = new Error(`HTTP ${r.status}`);
      if (r.status === 404) break;
    } catch (e) { err = e; }
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  throw err;
}
const readJson = async p => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } };

export async function run({ fetchFn = fetch, outDir = 'data', now = new Date(), log = console.log } = {}) {
  const season = seasonCode(now);
  await mkdir(outDir, { recursive: true });
  let fixtures = [];
  try { fixtures = toObjects(await get(fetchFn, FIXTURES_URL)); log(`fixtures.csv: ${fixtures.length} partidos`); }
  catch (e) { log(`AVISO fixtures.csv no disponible (${e.message}): sin próximos partidos`); }
  const prevIndex = await readJson(`${outDir}/index.json`);
  const leagues = []; let ok = 0, changed = 0;
  for (const l of LEAGUES) {
    const file = `${outDir}/${l.code}.json`;
    let data = null;
    try {
      const built = buildLeague(l.code, await get(fetchFn, resultsUrl(season, l.code)), fixtures);
      if (built.matches.some(m => m.status === 'FT')) {
        ok++;
        const prev = await readJson(file);
        if (prev && prev.season === season && JSON.stringify(prev.matches) === JSON.stringify(built.matches)) { log(`= ${l.code}: sin cambios`); }
        else { data = { season, updated: now.toISOString(), ...built }; changed++; await writeFile(file, JSON.stringify(data)); log(`OK ${l.code}: ${built.matches.length} partidos`); }
      }
      else log(`AVISO ${l.code}: sin partidos jugados en ${season}; se conserva lo anterior`);
    } catch (e) { log(`AVISO ${l.code}: ${e.message}; se conserva lo anterior`); }
    data = data || await readJson(file);
    if (data) leagues.push({ id: l.code, name: l.name, country: l.country, season: data.season, matches: data.matches.length, played: data.matches.filter(m => m.status === 'FT').length });
  }
  if (!leagues.length) throw new Error('No hay datos de ninguna liga');
  if (!ok) throw new Error('No se pudo descargar ninguna liga nueva');
  const updated = changed || !prevIndex?.updated ? now.toISOString() : prevIndex.updated; // última vez que cambió algún dato
  await writeFile(`${outDir}/index.json`, JSON.stringify({ source: SOURCE, season, updated, leagues }));
  log(`Listo: ${ok} ligas descargadas (${changed} con cambios), ${leagues.length} disponibles`);
  return { ok, leagues };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
