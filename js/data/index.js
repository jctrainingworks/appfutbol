// Punto único de acceso a datos. Las vistas solo importan `data` de aquí.
// Un proveedor nuevo = js/data/<fuente>.js con el contrato de demo.js, registrado aquí.
// Si se pide la fuente real pero falta el proxy, se usa la demo (marcada como DEMO en la app).
import { CONFIG } from '../config.js';
import { demo } from './demo.js';
import { footballdata } from './footballdata.js';

export const data = CONFIG.provider === 'footballdata' && CONFIG.proxyUrl ? footballdata : demo;
