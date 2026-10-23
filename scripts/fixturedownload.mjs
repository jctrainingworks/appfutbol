// Calendario de próximos partidos desde fixturedownload.com (feed JSON público, uso personal).
// football-data.co.uk publica sus próximos partidos tarde y solo de algunas ligas; esta fuente trae el calendario completo
// (con hora UTC y jornada real) de 13 de nuestras ligas. Funciones puras salvo fetchFeed. Si algo falla, no se pierde nada:
// se sigue usando lo de football-data.
//
// Problema principal: el mismo equipo se llama distinto en cada fuente ("Spurs" / "Tottenham", "Internazionale" / "Inter").
// Se casan los nombres con los de football-data (los ids de data/<liga>.json) en 3 pasos: alias manuales, nombres que
// contienen al otro y parecido de letras; después se asigna uno a uno (cada equipo solo una vez). Lo dudoso se anota en el
// diagnóstico de data/index.json para revisarlo.

export const SOURCE = 'fixturedownload.com';
export const SLUGS = {
  E0: 'epl-2026', E1: 'championship-2026', E2: 'efl-league-one-2026', E3: 'efl-league-two-2026', SP1: 'la-liga-2026', D1: 'bundesliga-2026', I1: 'serie-a-2026', F1: 'ligue-1-2026',
  F2: 'ligue-2-2026', N1: 'eredivisie-2026', SC0: 'scottish-premiership-2026', P1: 'primeira-liga-2026', T1: 'super-lig-2026',
};
export const feedUrl = code => `https://fixturedownload.com/feed/json/${SLUGS[code]}`;

const STOP = new Set(['fc', 'cf', 'sc', 'sv', 'fk', 'sk', 'afc', 'ac', 'as', 'us', 'ssc', 'cd', 'ud', 'rc', 'sd', 'rcd', 'ca', 'club', 'de', 'la', 'el',
  'fsv', 'vfb', 'vfl', 'tsg', 'bsc', 'sco', 'mfc', 'stade', '1', '04', '05', '07', '09', '29', '63', '96', '1860', '1899', '1846']);

export const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/ß/g, 'ss').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();
const toks = s => new Set(norm(s).split(' ').filter(t => t && !STOP.has(t)));
const key = s => [...toks(s)].join(' ');

// Alias manuales: nombre del feed (sin acentos ni mayúsculas) -> id del equipo en football-data.
const ALIAS_RAW = {
  'Spurs': 'tottenham', 'Man Utd': 'man-united', 'Queens Park Rangers': 'qpr', 'West Bromwich Albion': 'west-brom', 'Wolverhampton Wanderers': 'wolves',
  'R. Racing Club': 'santander', 'Real Racing Club de Santander': 'santander', 'RCD Espanyol de Barcelona': 'espanol', 'Atlético de Madrid': 'ath-madrid',
  'Club Atlético de Madrid': 'ath-madrid', 'RC Deportivo': 'la-coruna', 'Athletic Club': 'ath-bilbao', 'Celta de Vigo': 'celta',
  'Borussia Mönchengladbach': 'm-gladbach', 'Eintracht Frankfurt': 'ein-frankfurt', 'FC Bayern München': 'bayern-munich', 'Bayern München': 'bayern-munich',
  'Hamburger SV': 'hamburg', 'Internazionale': 'inter', 'Paris Saint-Germain': 'paris-sg', 'Olympique Lyonnais': 'lyon', 'Stade Brestois 29': 'brest',
  'Stade Rennais FC': 'rennes', 'Havre Athletic Club': 'le-havre', 'Le Havre AC': 'le-havre', 'Stade Lavallois MFC': 'laval', 'AS Saint-Étienne': 'st-etienne',
  'Fortuna Sittard': 'for-sittard', 'Heart of Midlothian': 'hearts', 'Vitória SC': 'guimaraes', 'Vitória SC Guimarães': 'guimaraes', 'Sporting CP': 'sp-lisbon',
  'Sporting Clube de Portugal': 'sp-lisbon', 'SC Braga': 'sp-braga', 'İstanbul Başakşehir': 'buyuksehyr', 'Istanbul Basaksehir': 'buyuksehyr',
  'Başakşehir': 'buyuksehyr', 'Amed SK': 'amedspor', 'Göztepe': 'goztep',
};
export const ALIAS = Object.fromEntries(Object.entries(ALIAS_RAW).map(([k, v]) => [norm(k), v]));

const bigrams = s => { const t = ` ${norm(s)} `, o = new Map(); for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); o.set(g, (o.get(g) || 0) + 1); } return o; };
export function dice(a, b) {
  const x = bigrams(a), y = bigrams(b); let inter = 0, tx = 0, ty = 0;
  for (const [g, n] of x) { tx += n; inter += Math.min(n, y.get(g) || 0); }
  for (const n of y.values()) ty += n;
  return tx + ty ? 2 * inter / (tx + ty) : 0;
}

// Parecido entre un nombre del feed y un equipo nuestro ({id, name}). >= 5 alias, 3 nombre igual, 2-3 uno contiene al otro, < 1 parecido de letras.
export function score(feedName, team) {
  if (ALIAS[norm(feedName)] === team.id) return 5;
  const f = key(feedName), cand = [key(team.name), key(team.id.replace(/-/g, ' '))];
  if (cand.includes(f)) return 3;
  const tf = toks(feedName);
  let best = Math.max(...cand.map(c => dice(f, c)));
  for (const c of cand) {
    const tc = new Set(c.split(' ').filter(Boolean));
    if (!tf.size || !tc.size) continue;
    const inter = [...tf].filter(t => tc.has(t)).length;
    if (inter === tf.size || inter === tc.size) best = Math.max(best, 2 + inter / Math.max(tf.size, tc.size));
  }
  return best;
}

// Asignación uno a uno (voraz por puntuación). Devuelve Map(nombre del feed -> equipo) y lo que merece revisión.
export function matchTeams(feedNames, teams, min = 0.6) {
  const pairs = [];
  for (const f of feedNames) for (const t of teams) pairs.push([score(f, t), f, t]);
  pairs.sort((a, b) => b[0] - a[0]);
  const map = new Map(), used = new Set(), review = [];
  for (const [sc, f, t] of pairs) {
    if (sc < min || map.has(f) || used.has(t.id)) continue;
    map.set(f, t); used.add(t.id);
    if (sc < 2) review.push([f, t.id, Math.round(sc * 100) / 100]);
  }
  return { map, review, unmatched: feedNames.filter(f => !map.has(f)) };
}

// feed = array del JSON de fixturedownload: { RoundNumber, DateUtc, HomeTeam, AwayTeam, HomeTeamScore, AwayTeamScore }.
// Solo partidos SIN resultado, entre hace `backH` horas y dentro de `days` días (el resto no hace falta y engordaría los datos).
export function toFixtures(code, feed, teams, now = new Date(), { days = 14, backH = 6 } = {}) {
  const rows = Array.isArray(feed) ? feed.filter(r => r && r.HomeTeam && r.AwayTeam && r.DateUtc) : [];
  const names = [...new Set(rows.flatMap(r => [r.HomeTeam, r.AwayTeam]))];
  const { map, review, unmatched } = matchTeams(names, teams);
  const from = now.getTime() - backH * 36e5, to = now.getTime() + days * 864e5, fixtures = [];
  for (const r of rows) {
    if (r.HomeTeamScore != null && r.HomeTeamScore !== '') continue;
    const t = Date.parse(String(r.DateUtc).replace(' ', 'T'));
    if (!Number.isFinite(t) || t < from || t > to) continue;
    const h = map.get(r.HomeTeam), a = map.get(r.AwayTeam);
    if (!h || !a) continue;
    const ymd = new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
    fixtures.push({ id: `${code}-${ymd}-${h.id}-${a.id}`, leagueId: code, round: Number(r.RoundNumber) || 0, kickoff: new Date(t).toISOString(),
      home: { id: h.id, name: h.name }, away: { id: a.id, name: a.name }, status: 'NS', score: null, source: SOURCE, st: {}, odds: {} });
  }
  return { fixtures, review, unmatched, rows: rows.length };
}

// Descarga y convierte. Nunca lanza: devuelve error en el diagnóstico y sin fixtures.
export async function altFixtures({ getText, code, teams, now = new Date() }) {
  if (!SLUGS[code]) return { fixtures: [], diag: null };
  try {
    const feed = JSON.parse(await getText(feedUrl(code)));
    const r = toFixtures(code, feed, teams, now);
    return { fixtures: r.fixtures, diag: { filas: r.rows, guardados: r.fixtures.length, revisar: r.review, sinCasar: r.unmatched } };
  } catch (e) { return { fixtures: [], diag: { error: String(e.message || e).slice(0, 120) } }; }
}
