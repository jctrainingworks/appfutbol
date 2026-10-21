// Conversión pura (sin red) de los CSV de football-data.co.uk al formato de la app.
// Datos: https://www.football-data.co.uk (uso personal; ver su página de condiciones).
// Hora: el CSV no indica zona; se asume hora británica (Europe/London). Si no hay hora se usa 12:00.
// Jornada: el CSV no la trae; se ESTIMA como 1 + partidos ya jugados por el equipo con más partidos.

export const SOURCE = 'football-data.co.uk';
export const LEAGUES = [
  ['E0', 'Premier League', 'Inglaterra'], ['E1', 'Championship', 'Inglaterra'], ['E2', 'League One', 'Inglaterra'], ['E3', 'League Two', 'Inglaterra'],
  ['SC0', 'Premiership', 'Escocia'], ['SP1', 'LaLiga', 'España'], ['SP2', 'LaLiga 2', 'España'],
  ['D1', 'Bundesliga', 'Alemania'], ['D2', '2. Bundesliga', 'Alemania'], ['I1', 'Serie A', 'Italia'], ['I2', 'Serie B', 'Italia'],
  ['F1', 'Ligue 1', 'Francia'], ['F2', 'Ligue 2', 'Francia'], ['N1', 'Eredivisie', 'Países Bajos'], ['B1', 'Pro League', 'Bélgica'],
  ['P1', 'Primeira Liga', 'Portugal'], ['T1', 'Süper Lig', 'Turquía'], ['G1', 'Super League', 'Grecia'],
].map(([code, name, country]) => ({ code, name, country }));

// Temporada europea: empieza en julio/agosto. Oct-2026 -> '2627'.
export function seasonCode(now = new Date()) {
  const y = now.getUTCFullYear(), start = now.getUTCMonth() + 1 >= 7 ? y : y - 1, p = n => String(n % 100).padStart(2, '0');
  return p(start) + p(start + 1);
}
export const resultsUrl = (season, code) => `https://www.football-data.co.uk/mmz4281/${season}/${code}.csv`;
export const FIXTURES_URL = 'https://www.football-data.co.uk/fixtures.csv';

export function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
export function toObjects(text) {
  const [head, ...rest] = parseCsv(text);
  if (!head) return [];
  const keys = head.map(k => k.trim());
  return rest.filter(r => r.some(x => x.trim() !== '')).map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const num = s => s !== undefined && s !== '' && Number.isFinite(+s) ? +s : null;
const pair = (r, a, b) => { const x = num(r[a]), y = num(r[b]); return x !== null && y !== null ? [x, y] : null; };
export const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function tzOffsetMin(ts, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - ts) / 6e4;
}
export function localToUtc(y, mo, d, hh, mm, tz = 'Europe/London') {
  const guess = Date.UTC(y, mo - 1, d, hh, mm), t1 = guess - tzOffsetMin(guess, tz) * 6e4;
  return guess - tzOffsetMin(t1, tz) * 6e4;
}

function toMatch(code, r, done) {
  const dm = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(r.Date || '');
  if (!dm || !r.HomeTeam || !r.AwayTeam) return null;
  let [, d, mo, y] = dm.map(Number); if (y < 100) y += 2000;
  const tm = /^(\d{1,2}):(\d{2})/.exec(r.Time || ''), kickoff = new Date(localToUtc(y, mo, d, tm ? +tm[1] : 12, tm ? +tm[2] : 0)).toISOString();
  const home = { id: slug(r.HomeTeam), name: r.HomeTeam }, away = { id: slug(r.AwayTeam), name: r.AwayTeam };
  let score = null;
  if (done) {
    const f = pair(r, 'FTHG', 'FTAG'); if (!f) return null;
    const ht = pair(r, 'HTHG', 'HTAG');
    score = { h: f[0], a: f[1], ht: ht ? { h: ht[0], a: ht[1] } : null };
  }
  const st = {};
  for (const [k, a, b] of [['shots', 'HS', 'AS'], ['sot', 'HST', 'AST'], ['corners', 'HC', 'AC'], ['fouls', 'HF', 'AF'], ['yellow', 'HY', 'AY'], ['red', 'HR', 'AR']]) { const v = pair(r, a, b); if (v) st[k] = v; }
  const odds = {}, o1 = [num(r.B365H), num(r.B365D), num(r.B365A)], o2 = pair(r, 'B365>2.5', 'B365<2.5');
  if (o1.every(x => x !== null)) odds.b365 = o1;
  if (o2) odds.ou25 = o2;
  const ymd = `${y}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}`;
  return { id: `${code}-${ymd}-${home.id}-${away.id}`, leagueId: code, round: 0, kickoff, home, away, status: done ? 'FT' : 'NS', score, source: SOURCE, st, odds };
}

export function buildLeague(code, resultsText, fixtureRows = []) {
  const meta = LEAGUES.find(l => l.code === code) || { name: code, country: '' };
  const byId = new Map();
  for (const r of toObjects(resultsText)) { const m = toMatch(code, r, true); if (m) byId.set(m.id, m); }
  const played = [...byId.values()].sort((a, b) => a.kickoff < b.kickoff ? -1 : 1), cnt = new Map();
  for (const m of played) { m.round = Math.max(cnt.get(m.home.id) || 0, cnt.get(m.away.id) || 0) + 1; cnt.set(m.home.id, (cnt.get(m.home.id) || 0) + 1); cnt.set(m.away.id, (cnt.get(m.away.id) || 0) + 1); }
  const next = [];
  for (const r of fixtureRows.filter(x => x.Div === code)) {
    const m = toMatch(code, r, false);
    if (m && !byId.has(m.id)) { m.round = Math.max(cnt.get(m.home.id) || 0, cnt.get(m.away.id) || 0) + 1; next.push(m); }
  }
  const matches = [...played, ...next].sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);
  const teams = [...new Map(matches.flatMap(m => [m.home, m.away]).map(t => [t.id, t])).values()];
  return { id: code, name: meta.name, country: meta.country, rounds: Math.max(0, teams.length * 2 - 2), teams, source: SOURCE, matches };
}
