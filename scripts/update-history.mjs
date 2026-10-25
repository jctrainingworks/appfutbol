// Guarda el pronóstico de los próximos partidos y liquida los ya jugados: lee data/<liga>.json (+ data/prev) y escribe data/history.json.
// Lo ejecuta GitHub Actions justo después de descargar los datos (.github/workflows/update-data.yml); a mano: node scripts/update-history.mjs
// La lógica está en js/model/history.js (la misma que usa la pantalla Historial). Aquí solo se lee y se escribe disco.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { updateHistory } from '../js/model/history.js';

const readJson = async p => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; } };

export async function run({ dir = 'data', now = new Date(), log = console.log } = {}) {
  const index = await readJson(`${dir}/index.json`);
  if (!index?.leagues?.length) throw new Error('No hay data/index.json: primero hay que descargar los datos');
  const leagues = [];
  for (const l of index.leagues) {
    const cur = await readJson(`${dir}/${l.id}.json`);
    if (!cur?.matches) { log(`AVISO ${l.id}: sin datos, se salta`); continue; }
    const prev = await readJson(`${dir}/prev/${l.id}.json`);
    leagues.push({ id: l.id, matches: cur.matches, teams: cur.teams || [], prev: prev?.matches || [] });
  }
  const old = await readJson(`${dir}/history.json`);
  const { history, stats, changed } = updateHistory(old, leagues, { now });
  if (changed) await writeFile(`${dir}/history.json`, JSON.stringify(history));
  const rs = history.records;
  log(`Historial: ${rs.length} pronósticos (${rs.filter(r => r.r).length} con resultado, ${rs.filter(r => !r.r && !r.x).length} pendientes, ${rs.filter(r => r.x).length} sin resultado). ` +
    `Esta vez: ${stats.nuevos} nuevos, ${stats.actualizados} actualizados, ${stats.liquidados} liquidados, ${stats.sinModelo} sin modelo.${changed ? '' : ' Sin cambios.'}`);
  return { history, stats, changed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  run({ dir: arg('--dir') || 'data', now: arg('--now') ? new Date(arg('--now')) : new Date() }).catch(e => { console.error(e); process.exit(1); });
}
