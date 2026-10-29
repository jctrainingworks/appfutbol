// Guarda los filtros personalizados en este móvil (localStorage). Si no hay almacenamiento, funcionan igual hasta cerrar la página.
import { sanitizeFilters } from './model/filters.js';
const KEY = 'futbol-filtros-v1';
export function loadFilters() { try { return sanitizeFilters(JSON.parse(localStorage.getItem(KEY))); } catch { return []; } }
export function saveFilters(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; } }
