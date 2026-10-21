// Proveedor real "sin claves": lee data/*.json, que genera la tarea diaria de GitHub a partir de football-data.co.uk.
// Mismo contrato que demo.js. Los datos son de la web de la propia app, así que no hay CORS ni secretos.
import { computeStandings } from './standings.js';

const SRC = 'football-data.co.uk';
const url = f => new URL(`../../data/${f}`, import.meta.url).href;
const files = new Map();

const league = code => {
  if (!files.has(code)) {
    const p = fetch(url(`${code}.json`)).then(r => { if (!r.ok) throw new Error(`${code}: datos no disponibles (${r.status})`); return r.json(); });
    files.set(code, p);
    p.catch(() => files.delete(code));
  }
  return files.get(code);
};

export async function loadIndex() {
  try {
    const r = await fetch(url('index.json'), { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.leagues) && j.leagues.length ? j : null;
  } catch { return null; }
}

export function makeProvider(index) {
  const ids = index.leagues.map(l => l.id);
  const day = new Date(index.updated).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const sorted = (list, status) => {
    // "Próximos": sin resultado y que no hayan empezado hace más de 3 h (el CSV tarda en traer el resultado; no hay directos).
    const cut = Date.now() - 3 * 36e5;
    const r = list.filter(m => status === 'FT' ? m.status === 'FT' : status === 'NS' ? m.status === 'NS' && Date.parse(m.kickoff) > cut : true).sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);
    return status === 'FT' ? r.reverse() : r;
  };
  const pick = async leagueId => leagueId ? (ids.includes(leagueId) ? [await league(leagueId)] : []) : (await Promise.allSettled(ids.map(league))).filter(x => x.status === 'fulfilled').map(x => x.value);
  return {
    meta: { id: 'footballcsv', label: `${SRC} · datos del ${day}`, isDemo: false, updated: index.updated },
    async leagues() { return (await pick()).map(({ matches, ...l }) => l); },
    async league(id) { if (!ids.includes(id)) return null; const { matches, ...l } = await league(id); return l; },
    async match(id) {
      const code = String(id).split('-')[0];
      return ids.includes(code) ? (await league(code)).matches.find(m => m.id === id) || null : null;
    },
    async matches({ leagueId, teamId, status, limit } = {}) {
      const list = (await pick(leagueId)).flatMap(l => l.matches).filter(m => !teamId || m.home.id === teamId || m.away.id === teamId);
      const r = sorted(list, status);
      return limit ? r.slice(0, limit) : r;
    },
    async standings(leagueId) {
      if (!ids.includes(leagueId)) return [];
      const l = await league(leagueId);
      return computeStandings(l.matches, l.teams);
    },
  };
}
