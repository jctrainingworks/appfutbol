// Cálculo del análisis de un partido, compartido por la pantalla de Análisis y por el Historial (tarea de GitHub).
// Es el MISMO código en los dos sitios: así lo que guarda el Historial es exactamente lo que la app enseñaba antes del partido.
// Solo usa partidos terminados ANTES del partido analizado (nunca el propio partido ni posteriores).
import { fit, predict, backtest } from './poisson.js';
import { matchTrends } from './trends.js';
import { insight } from './insight.js';
import { computeStandings } from '../data/standings.js';
import { halfShare, halfProbs } from './halves.js';

// La temporada anterior cuenta la mitad (w=0,5): en el backtest walk-forward con datos reales mejoró Brier y log-loss frente a no usarla.
export const PREV_W = 0.5;

// m: partido a analizar. all: partidos de la liga (temporada actual). prevAll: temporada anterior (solo jugados). teams: equipos de la liga.
// last: 10 = últimos 10 (con temporada anterior), 0 = toda la temporada actual. withBacktest/withStandings: solo hacen falta para pintar la pantalla.
export function analyze({ m, all, prevAll = [], teams = [], last = 10, withBacktest = true, withStandings = true }) {
  const prevSeason = prevAll.filter(x => x.status === 'FT' && x.score && x.kickoff < m.kickoff);
  const train = all.filter(x => x.status === 'FT' && x.score && x.kickoff < m.kickoff);
  const tr = matchTrends(last ? [...prevSeason, ...train] : train, m.home.id, m.away.id, { last });
  const model = fit([...prevSeason.map(x => ({ ...x, w: PREV_W })), ...train]), pr = predict(model, m.home.id, m.away.id);
  if (pr) pr.halves = halfProbs(pr.xg.h + pr.xg.a, halfShare([...prevSeason, ...train]));   // goles por partes (aproximación; no entra en el Historial)
  const bt = withBacktest ? backtest(train) : null;
  const ins = insight({ train, m, tr, pr, bt, standings: withStandings ? computeStandings(train, teams) : null });
  return { prevSeason, train, tr, model, pr, bt, ins };
}
