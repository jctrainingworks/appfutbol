// Ejecutar: node --test tests/fixturedownload.test.mjs
// Nombres reales vistos en el feed de fixturedownload.com (23-oct-2026) frente a los ids de data/<liga>.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchTeams, toFixtures, norm } from '../scripts/fixturedownload.mjs';
import { buildLeague } from '../scripts/football-data-csv.mjs';

const teams = code => JSON.parse(readFileSync(new URL(`../data/${code}.json`, import.meta.url))).teams;
const FEED = {
  SP1: ['Deportivo Alavés', 'Getafe CF', 'Sevilla FC', 'Rayo Vallecano', 'R. Racing Club', 'Villarreal CF', 'RCD Espanyol de Barcelona', 'Levante UD', 'RC Deportivo', 'Elche CF',
    'Atlético de Madrid', 'Málaga CF', 'Real Betis', 'Real Sociedad', 'Athletic Club', 'Valencia CF', 'Celta', 'Real Madrid', 'FC Barcelona', 'CA Osasuna'],
  E0: ['Ipswich', "Nott'm Forest", 'Aston Villa', 'Man City', 'Arsenal', 'Everton', 'Coventry', 'Fulham', 'Chelsea', 'Spurs', 'Crystal Palace', 'Newcastle', 'Hull', 'Brentford',
    'Liverpool', 'Brighton', 'Man Utd', 'Bournemouth', 'Sunderland', 'Leeds'],
  E1: ['Bolton Wanderers', 'Middlesbrough', 'Charlton Athletic', 'Norwich City', 'Portsmouth', 'Millwall', 'Sheffield United', 'Derby County', 'Blackburn Rovers', 'Wrexham', 'Cardiff City',
    'Birmingham City', 'Lincoln City', 'Burnley', 'Preston North End', 'West Bromwich Albion', 'Queens Park Rangers', 'Swansea City', 'Stoke City', 'Bristol City', 'West Ham United',
    'Southampton', 'Wolverhampton Wanderers', 'Watford'],
  D1: ['VfB Stuttgart', 'Borussia Mönchengladbach', 'SC Paderborn 07', 'Hamburger SV', '1. FC Köln', 'FC Schalke 04', '1. FSV Mainz 05', 'SV Werder Bremen', 'FC Augsburg', '1. FC Union Berlin',
    'RB Leipzig', 'SV Elversberg', 'Borussia Dortmund', 'Eintracht Frankfurt', 'TSG Hoffenheim', 'Bayer 04 Leverkusen', 'Sport-Club Freiburg', 'FC Bayern München'],
  I1: ['Torino', 'Monza', 'Cagliari', 'Bologna', 'Como', 'Sassuolo', 'Napoli', 'Roma', 'Lazio', 'Parma', 'Internazionale', 'Fiorentina', 'Atalanta', 'Frosinone', 'Genoa', 'Venezia', 'Lecce',
    'Juventus', 'Udinese', 'Milan'],
  F1: ['Stade Brestois 29', 'OGC Nice', 'Toulouse FC', 'Estac Troyes', 'RC Lens', 'Paris FC', 'AS Monaco', 'LOSC Lille', 'Angers SCO', 'FC Lorient', 'AJ Auxerre', 'Le Mans FC',
    'Olympique de Marseille', 'Havre Athletic Club', 'Stade Rennais FC', 'RC Strasbourg Alsace', 'Paris Saint-Germain', 'Olympique Lyonnais'],
  N1: ['Go Ahead Eagles', 'Telstar', 'FC Utrecht', 'PEC Zwolle', 'Willem II', 'SC Cambuur', 'ADO Den Haag', 'sc Heerenveen', 'Fortuna Sittard', 'Excelsior Rotterdam', 'N.E.C. Nijmegen',
    'FC Groningen', 'PSV', 'Feyenoord', 'Sparta Rotterdam', 'Ajax', 'AZ', 'FC Twente'],
  SC0: ['Dundee United', 'Aberdeen', 'Falkirk', 'Kilmarnock', 'Rangers', 'St. Johnstone', 'St. Mirren', 'Dundee', 'Hibernian', 'Celtic', 'Motherwell', 'Heart of Midlothian'],
  P1: ['Vitória SC', 'Marítimo M.', 'Estrela Amadora', 'Casa Pia AC', 'FC Alverca', 'FC Arouca', 'Gil Vicente FC', 'FC Porto', 'Estoril Praia', 'Moreirense FC', 'CD Nacional', 'SC Braga',
    'Rio Ave FC', 'FC Famalicão', 'Sporting CP', 'Académico de Viseu'],
};
// Casos difíciles que deben casar con un id concreto.
const MUST = {
  SP1: { 'Deportivo Alavés': 'alaves', 'R. Racing Club': 'santander', 'RC Deportivo': 'la-coruna', 'Atlético de Madrid': 'ath-madrid', 'Athletic Club': 'ath-bilbao', 'Real Madrid': 'real-madrid',
    'Real Sociedad': 'sociedad', 'Real Betis': 'betis', 'RCD Espanyol de Barcelona': 'espanol', 'Rayo Vallecano': 'vallecano' },
  E0: { Spurs: 'tottenham', 'Man Utd': 'man-united', 'Man City': 'man-city', "Nott'm Forest": 'nott-m-forest' },
  E1: { 'Queens Park Rangers': 'qpr', 'West Bromwich Albion': 'west-brom', 'Wolverhampton Wanderers': 'wolves', 'Sheffield United': 'sheffield-united', 'West Ham United': 'west-ham' },
  D1: { 'Borussia Mönchengladbach': 'm-gladbach', 'Hamburger SV': 'hamburg', '1. FC Köln': 'fc-koln', 'FC Bayern München': 'bayern-munich', 'Eintracht Frankfurt': 'ein-frankfurt', 'FC Schalke 04': 'schalke-04' },
  I1: { Internazionale: 'inter', Milan: 'milan', Roma: 'roma' },
  F1: { 'Paris Saint-Germain': 'paris-sg', 'Paris FC': 'paris-fc', 'Olympique Lyonnais': 'lyon', 'Stade Brestois 29': 'brest', 'Stade Rennais FC': 'rennes', 'Havre Athletic Club': 'le-havre' },
  N1: { PSV: 'psv-eindhoven', AZ: 'az-alkmaar', 'Fortuna Sittard': 'for-sittard', 'N.E.C. Nijmegen': 'nijmegen', 'ADO Den Haag': 'den-haag' },
  SC0: { 'Heart of Midlothian': 'hearts', 'St. Johnstone': 'st-johnstone', 'St. Mirren': 'st-mirren', Dundee: 'dundee', 'Dundee United': 'dundee-united' },
  P1: { 'Vitória SC': 'guimaraes', 'Sporting CP': 'sp-lisbon', 'SC Braga': 'sp-braga', 'FC Porto': 'porto', 'Estrela Amadora': 'estrela', 'CD Nacional': 'nacional', 'Académico de Viseu': 'academico-viseu' },
};
for (const code of Object.keys(FEED)) {
  test(`${code}: todos los nombres del feed casan, sin repetir equipo y los difíciles bien`, () => {
    const { map, unmatched } = matchTeams(FEED[code], teams(code));
    assert.deepEqual(unmatched, [], `sin casar: ${unmatched}`);
    const ids = [...map.values()].map(t => t.id);
    assert.equal(new Set(ids).size, ids.length, 'un equipo asignado dos veces');
    for (const [f, id] of Object.entries(MUST[code] || {})) assert.equal(map.get(f)?.id, id, `${f} debería ser ${id}, es ${map.get(f)?.id}`);
  });
}

const T = id => ({ id, name: id });
test('toFixtures: solo sin resultado, dentro de la ventana, con id y jornada reales', () => {
  const now = new Date('2026-10-23T08:00:00Z');
  const feed = [
    { RoundNumber: 10, DateUtc: '2026-10-23 19:00:00Z', HomeTeam: 'Deportivo Alavés', AwayTeam: 'Málaga CF', HomeTeamScore: null, AwayTeamScore: null },
    { RoundNumber: 9, DateUtc: '2026-10-19 19:00:00Z', HomeTeam: 'Getafe CF', AwayTeam: 'Sevilla FC', HomeTeamScore: 1, AwayTeamScore: 1 },   // ya jugado
    { RoundNumber: 20, DateUtc: '2027-03-01 19:00:00Z', HomeTeam: 'Sevilla FC', AwayTeam: 'Getafe CF', HomeTeamScore: null, AwayTeamScore: null }, // fuera de ventana
    { RoundNumber: 10, DateUtc: '2026-10-24 12:00:00Z', HomeTeam: 'Equipo Raro', AwayTeam: 'Getafe CF', HomeTeamScore: null, AwayTeamScore: null }, // no casa
  ];
  const r = toFixtures('SP1', feed, [T('alaves'), T('malaga'), T('getafe'), T('sevilla')], now);
  assert.equal(r.fixtures.length, 1);
  assert.equal(r.fixtures[0].id, 'SP1-20261023-alaves-malaga');
  assert.equal(r.fixtures[0].round, 10);
  assert.equal(r.fixtures[0].kickoff, '2026-10-23T19:00:00.000Z');
  assert.equal(r.fixtures[0].status, 'NS');
  assert.ok(r.unmatched.includes('Equipo Raro'));
});

test('buildLeague: los próximos de la 2ª fuente sustituyen a fixtures.csv y no duplican partidos jugados', () => {
  const csv = 'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG\nSP1,15/08/2026,20:00,Alaves,Getafe,1,0\n';
  const fdFix = [{ Div: 'SP1', Date: '24/10/2026', Time: '21:00', HomeTeam: 'Getafe', AwayTeam: 'Alaves' }];
  const mk = (h, a, d, round) => ({ id: `SP1-${d}-${h}-${a}`, leagueId: 'SP1', round, kickoff: `2026-${d.slice(4, 6)}-${d.slice(6)}T19:00:00.000Z`, home: { id: h, name: h }, away: { id: a, name: a }, status: 'NS', score: null, source: 'x', st: {}, odds: {} });
  const extra = [mk('getafe', 'alaves', '20261024', 10), mk('alaves', 'getafe', '20260815', 1)]; // el 2º ya está jugado (mismo cruce, misma fecha)
  const b = buildLeague('SP1', csv, fdFix, extra);
  const ns = b.matches.filter(m => m.status === 'NS');
  assert.equal(ns.length, 1);
  assert.equal(ns[0].source, 'x');           // la de la 2ª fuente sustituyó a la de fixtures.csv
  assert.equal(ns[0].round, 10);             // con su jornada real
  assert.equal(b.matches.filter(m => m.status === 'FT').length, 1);
});

test('norm: acentos, ı turca y símbolos', () => {
  assert.equal(norm('Kasımpaşa'), 'kasimpasa');
  assert.equal(norm("Nott'm Forest"), 'nott m forest');
});
