// Guardado de tus apuestas en ESTE móvil (localStorage). Solo toca el almacenamiento; la lógica está en js/model/bets.js.
// Si se borran los datos del navegador se pierden: por eso el Historial ofrece copia de seguridad y restaurar.
import { parseBackup } from './model/bets.js';

const KEY = 'futbol-apuestas-v1';

export function loadBets() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    const r = parseBackup(raw || '[]');
    if (r.ok) return r.bets;
    // Datos que no se pueden leer: se guarda una copia aparte para no perderlos al escribir después.
    if (raw) localStorage.setItem(KEY + '-roto', raw);
  } catch { /* sin almacenamiento */ }
  return [];
}
// Devuelve true si se pudo guardar (puede fallar en ventanas privadas o con el almacenamiento bloqueado).
export function saveBets(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}
