// Más mercados derivados del MISMO modelo Poisson (mismas lambdas que js/model/poisson.js): líneas de goles, goles por equipo,
// portería a cero, hándicap, margen de victoria y matriz de marcadores. No cambia ninguna probabilidad existente: solo las desglosa.
// Son estimaciones de un modelo simple (ver Historial: no iguala al mercado), no certezas.

function pmf(l, max) {
  const p = [Math.exp(-l)];
  for (let k = 1; k <= max; k++) p.push(p[k - 1] * l / k);
  return p;
}

export const LINES = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
export const HANDICAPS = [-1.5, -1, -0.5, 0.5, 1, 1.5];   // desde el punto de vista del local

export function extras(lh, la, maxGoals = 10, grid = 5) {
  const ph = pmf(lh, maxGoals), pa = pmf(la, maxGoals), P = [];
  let tot = 0;
  for (let i = 0; i <= maxGoals; i++) { P.push([]); for (let j = 0; j <= maxGoals; j++) { const p = ph[i] * pa[j]; P[i].push(p); tot += p; } }
  for (const row of P) for (let j = 0; j < row.length; j++) row[j] /= tot;          // misma renormalización que markets()
  const sum = f => { let s = 0; for (let i = 0; i <= maxGoals; i++) for (let j = 0; j <= maxGoals; j++) if (f(i, j)) s += P[i][j]; return s; };
  const ah = h => {                                                                 // hándicap asiático del local con línea h
    const win = sum((i, j) => i - j + h > 1e-9), push = sum((i, j) => Math.abs(i - j + h) < 1e-9), lose = 1 - win - push;
    return { line: h, win, push, lose, fair: win > 0 ? 1 + lose / win : Infinity };   // cuota justa: con devolución, 1 + perder/ganar
  };
  const total = Array.from({ length: 7 }, (_, k) => sum((i, j) => (k < 6 ? i + j === k : i + j >= 6)));   // 0..5 y 6 o más
  return {
    lines: Object.fromEntries(LINES.map(L => [L, { over: sum((i, j) => i + j > L), under: sum((i, j) => i + j < L) }])),
    total,
    team: {
      h: Object.fromEntries([0.5, 1.5, 2.5].map(L => [L, sum(i => i > L)])),
      a: Object.fromEntries([0.5, 1.5, 2.5].map(L => [L, sum((i, j) => j > L)])),
    },
    cleanSheet: { h: sum((i, j) => j === 0), a: sum(i => i === 0) },
    winToNil: { h: sum((i, j) => i > 0 && j === 0), a: sum((i, j) => j > 0 && i === 0) },
    margin: { h1: sum((i, j) => i - j === 1), h2: sum((i, j) => i - j === 2), h3: sum((i, j) => i - j >= 3), draw: sum((i, j) => i === j),
      a1: sum((i, j) => j - i === 1), a2: sum((i, j) => j - i === 2), a3: sum((i, j) => j - i >= 3) },
    handicaps: HANDICAPS.map(ah),
    matrix: Array.from({ length: grid + 1 }, (_, i) => Array.from({ length: grid + 1 }, (_, j) => P[i][j])),
    inGrid: sum((i, j) => i <= grid && j <= grid),
  };
}
