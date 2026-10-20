// Punto único de acceso a datos. Las vistas solo importan `data` de aquí.
// Para conectar una fuente real: crear js/data/<fuente>.js con el contrato de demo.js y elegirla aquí.
import { CONFIG } from '../config.js';
import { demo } from './demo.js';

const providers = { demo };
export const data = providers[CONFIG.provider] || demo;
