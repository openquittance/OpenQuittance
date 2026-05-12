// v3.2.0-rc2 — stub vide pour bundle Edge runtime de Next.js.
//
// `lib/integrations/google.ts` lit la DB Postgres (Prisma) + utilise
// `lib/crypto.ts` (Node `crypto` module). Le bundle Edge ne sait pas
// les compiler. instrumentation.ts importe dynamiquement avec gating
// runtime check `NEXT_RUNTIME !== 'nodejs'` mais webpack trace les
// imports même morts au build.
//
// next.config.js alias `lib/integrations/google` vers ce stub
// uniquement pour `nextRuntime === 'edge'`. Pour Node, le vrai
// module est utilisé.

module.exports = {
  getGoogleCredentials: async () => null,
  invalidateGoogleCredentialsCache: () => {},
  _internals: {
    resetCache: () => {},
    setCache: () => {},
    getCache: () => null,
  },
};
