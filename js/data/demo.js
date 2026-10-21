// DATOS DE DEMOSTRACIÓN: equipos y resultados ficticios generados con semilla fija.
// No corresponden a ninguna competición real.
import { computeStandings } from './standings.js';

const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const binom = (n, p, r) => { let k = 0; for (let i = 0; i < n; i++) if (r() < p) k++; return k; };
const poisson = (l, r) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
const DAY = 864e5;
const DEFS = [
  { id: 'liga-norte', name: 'Liga Demo Norte', played: 6, teams: ['Costa Azul', 'Unión Valle', 'Deportivo Norte', 'Atlético Muralla', 'Racing Ribera', 'Sporting Faro', 'Real Cumbre', 'Ciudad Sur'] },
  { id: 'liga-sur', name: 'Liga Demo Sur', played: 5, teams: ['Olimpia Alba', 'Levante Roble', 'Estrella Roja', 'Náutico Bahía', 'Juventud Pino', 'Marengo CF'] },
];

function rounds(teams) { // método del círculo (todos contra todos)
  const n = teams.length, arr = [...teams], out = [];
  for (let r = 0; r < n - 1; r++) {
    out.push(Array.from({ length: n / 2 }, (_, i) => r % 2 ? [arr[n - 1 - i], arr[i]] : [arr[i], arr[n - 1 - i]]));
    arr.splice(1, 0, arr.pop());
  }
  return out;
}

function build() {
  const r = rng(2026), rh = rng(77), today = new Date(); today.setHours(0, 0, 0, 0);
  const leagues = [], matches = [];
  for (const d of DEFS) {
    const teams = d.teams.map((name, i) => ({ id: `${d.id}-${i}`, name, att: .9 + r() * .9, leak: .8 + r() * .7 }));
    const first = rounds(teams), all = first.concat(first.map(rd => rd.map(([a, b]) => [b, a])));
    all.forEach((rd, ri) => rd.forEach(([h, a], i) => {
      const when = +today + (ri - d.played) * 7 * DAY + (i % 3) * DAY + [21, 19, 17, 20][i % 4] * 36e5;
      const hg = poisson(1.25 * h.att * a.leak * 1.1, r), ag = poisson(1.1 * a.att * h.leak, r);
      const fin = when < Date.now() - 2 * 36e5;
      matches.push({
        id: `${d.id}-j${ri + 1}-${i}`, leagueId: d.id, round: ri + 1, kickoff: new Date(when).toISOString(),
        home: { id: h.id, name: h.name }, away: { id: a.id, name: a.name },
        status: fin ? 'FT' : 'NS', score: fin ? { h: hg, a: ag, ht: { h: binom(hg, .45, rh), a: binom(ag, .45, rh) } } : null, source: 'demo',
      });
    }));
    leagues.push({ id: d.id, name: d.name, country: 'Demo', rounds: all.length, teams: teams.map(({ id, name }) => ({ id, name })), source: 'demo' });
  }
  return { leagues, matches };
}

const { leagues, matches } = build();
const sorted = f => matches.filter(f).sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);

// Contrato del proveedor: cualquier fuente real debe exponer estos mismos métodos y formas.
export const demo = {
  meta: { id: 'demo', label: 'Demo', isDemo: true },
  async leagues() { return leagues; },
  async league(id) { return leagues.find(l => l.id === id) || null; },
  async match(id) { return matches.find(m => m.id === id) || null; },
  async matches({ leagueId, teamId, status, limit } = {}) {
    const r = sorted(m => (!leagueId || m.leagueId === leagueId) && (!teamId || m.home.id === teamId || m.away.id === teamId) && (!status || m.status === status));
    if (status === 'FT') r.reverse();
    return limit ? r.slice(0, limit) : r;
  },
  async standings(leagueId) {
    const l = leagues.find(x => x.id === leagueId);
    return l ? computeStandings(matches.filter(m => m.leagueId === leagueId), l.teams) : [];
  },
};
