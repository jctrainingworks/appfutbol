// Guarda los filtros personalizados en este móvil (localStorage). Si no hay almacenamiento, funcionan igual hasta cerrar la página.
import { sanitizeFilters } from './model/filters.js';
const KEY = 'futbol-filtros-v1';
export function loadFilters() { try { return sanitizeFilters(JSON.parse(localStorage.getItem(KEY))); } catch { return []; } }
export function saveFilters(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } }

// Registro en vivo de los partidos que cada filtro enseñó antes de empezar (para medir el filtro de verdad en el Historial).
import { sanitizeLog } from './model/filterstats.js';
const LOG = 'futbol-filtros-log-v1';
export function loadLog() { try { return sanitizeLog(JSON.parse(localStorage.getItem(LOG))); } catch { return []; } }
export function saveLog(list) { try { localStorage.setItem(LOG, JSON.stringify(list)); return true; } catch { return false; } }
