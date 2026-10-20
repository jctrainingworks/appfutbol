// Única pieza de configuración. SOLO valores públicos aquí (URL del proxy, anon key de Supabase).
// Nunca claves privadas: la de football-data.org vive como secreto del Worker (ver worker/README.md).
export const CONFIG = {
  provider: 'demo',          // 'demo' | 'footballdata' (requiere proxyUrl)
  proxyUrl: '',              // URL del Worker desplegado, p. ej. https://futbol-data-proxy.<usuario>.workers.dev
  competitions: ['PD', 'PL', 'BL1', 'SA', 'FL1'], // códigos de football-data.org (plan gratuito)
  supabase: { url: '', anonKey: '' },
};
