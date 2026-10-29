// Goles por partes (1ª y 2ª parte) a partir del MISMO modelo Poisson: los goles totales esperados (λ local + λ visitante) se reparten entre
// las dos partes con la proporción histórica de la liga (goles en la 1ª parte / goles totales, solo con partidos que traen el marcador al descanso).
// Es una aproximación: supone que esa proporción es igual para todos los equipos. Funciones puras.
const done = ms => ms.filter(m => m.status === 'FT' && m.score && m.score.ht);

// Proporción de goles que se marcan en la 1ª parte. null si no hay datos suficientes (< 50 goles con marcador al descanso).
export function halfShare(matches) {
  let ht = 0, tot = 0;
  for (const m of done(matches)) { ht += m.score.ht.h + m.score.ht.a; tot += m.score.h + m.score.a; }
  return tot >= 50 ? ht / tot : null;
}
const over05 = L => 1 - Math.exp(-L), over15 = L => 1 - Math.exp(-L) * (1 + L);   // Poisson: P(≥1) y P(≥2) de la suma de ambos equipos
export function halfProbs(lambdaTotal, share) {
  if (share == null || !(lambdaTotal > 0)) return null;
  const a = lambdaTotal * share, b = lambdaTotal * (1 - share);
  return { share, ht: { o05: over05(a), o15: over15(a), lambda: a }, h2: { o05: over05(b), o15: over15(b), lambda: b } };
}
