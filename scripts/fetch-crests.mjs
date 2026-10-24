// Descarga escudos de footylogos.com (PNG transparente, uso personal; ellos piden citar "FootyLogos.com" como fuente).
// Lo ejecuta GitHub Actions (.github/workflows/crests.yml) UNA vez al cambiar scripts/crest-sources.json: descarga solo los que
// faltan en crests/, con pausa entre peticiones, los reduce a 128x128 y regenera js/crests.js. Escribe crests/_report.json con el resultado.
// Requiere el paquete sharp (el flujo de trabajo lo instala sin guardarlo en el repositorio).
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import sharp from 'sharp';

const BASE = 'https://www.footylogos.com';
const UA = 'appfutbol-personal/1.0 (uso personal; descarga puntual de escudos; credito: FootyLogos.com)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isPng = b => b.length > 1000 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

async function download(slug) {
  // 1) versión de 512 px; 2) PNG grande de la ficha del club (1500 px)
  const urls = [`${BASE}/dls/logo/rgba-v1/${slug}.png`, `${BASE}/es/logos/${slug}?download=png`];
  const errors = [];
  for (const u of urls) {
    try {
      const r = await fetch(u, { headers: { 'user-agent': UA } });
      if (!r.ok) { errors.push(`${r.status} ${u.replace(BASE, '')}`); await sleep(700); continue; }
      const b = Buffer.from(await r.arrayBuffer());
      if (isPng(b)) return { buf: b, from: u.replace(BASE, '') };
      errors.push(`no es PNG ${u.replace(BASE, '')}`);
    } catch (e) { errors.push(`${e.message} ${u.replace(BASE, '')}`); }
    await sleep(700);
  }
  return { errors };
}

const src = JSON.parse(await readFile('scripts/crest-sources.json', 'utf8'));
await mkdir('crests', { recursive: true });
const report = {};
for (const [id, slug] of Object.entries(src)) {
  if (id.startsWith('_')) continue;
  if (existsSync(`crests/${id}.png`)) { report[id] = { ok: true, ya: true }; continue; }
  const r = await download(slug);
  if (!r.buf) { report[id] = { ok: false, slug, errores: r.errors }; console.log('FALLO', id, r.errors.join(' | ')); await sleep(700); continue; }
  try {
    await sharp(r.buf).trim().resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toFile(`crests/${id}.png`);
    report[id] = { ok: true, slug, de: r.from, bytes: r.buf.length };
    console.log('OK', id, r.from);
  } catch (e) { report[id] = { ok: false, slug, errores: [`sharp: ${e.message}`] }; console.log('FALLO sharp', id, e.message); }
  await sleep(700);
}
await writeFile('crests/_report.json', JSON.stringify(report, null, 1));
const ids = (await readdir('crests')).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort();
await writeFile('js/crests.js', '// Escudos disponibles en la carpeta crests/ (uno por id de equipo). Solo los equipos de esta lista muestran imagen;\n// el resto usa iniciales de color. Para añadir más: copiar el PNG a crests/<id>.png y añadir el id aquí.\nexport const CRESTS = new Set(' + JSON.stringify(ids) + ');\n');
console.log(`Listo: ${Object.values(report).filter(x => x.ok).length}/${Object.keys(report).length} escudos; ${ids.length} en total`);
