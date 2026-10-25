const S = {
  combinadas: ['Combinadas', 'Combinadas simuladas teniendo en cuenta la correlación entre selecciones, con cuota justa y valor esperado.'],
};
export const soon = k => async () => `<h1>${S[k][0]}</h1><div class="card empty"><p>${S[k][1]}</p>
  <p class="mu">Todavía no implementado. Depende de conectar datos reales y almacenamiento.</p></div>`;
