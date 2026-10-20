// Función pura: sirve igual para datos demo que para datos reales.
export function computeStandings(matches, teams) {
  const t = new Map(teams.map(x => [x.id, { team: x, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, pts: 0, results: [] }]));
  const done = matches.filter(m => m.status === 'FT').sort((a, b) => a.kickoff < b.kickoff ? -1 : 1);
  for (const m of done) {
    const { h, a } = m.score;
    for (const [id, f, c] of [[m.home.id, h, a], [m.away.id, a, h]]) {
      const r = t.get(id); if (!r) continue;
      const k = f > c ? 'W' : f < c ? 'L' : 'D';
      r.pj++; r.gf += f; r.gc += c; r.results.push(k);
      if (k === 'W') { r.g++; r.pts += 3; } else if (k === 'D') { r.e++; r.pts++; } else r.p++;
    }
  }
  return [...t.values()]
    .map(r => ({ ...r, dg: r.gf - r.gc, form: r.results.slice(-5) }))
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.team.name.localeCompare(b.team.name))
    .map((r, i) => ({ ...r, pos: i + 1 }));
}
