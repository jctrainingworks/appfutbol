// Punto único de acceso a datos. Las vistas solo importan `data` de aquí.
// provider 'auto' (por defecto): usa los datos reales de data/ si existen y, si no, la demo (marcada como DEMO).
// 'footballdata' = API con clave vía proxy (worker/). 'demo' = datos ficticios.
import { CONFIG } from '../config.js';
import { demo } from './demo.js';
import { footballdata } from './footballdata.js';
import { loadIndex, makeProvider } from './footballcsv.js';

async function pick() {
  if (CONFIG.provider === 'demo') return demo;
  if (CONFIG.provider === 'footballdata') return CONFIG.proxyUrl ? footballdata : demo;
  const index = await loadIndex();
  return index ? makeProvider(index) : demo;
}
export const data = await pick();
