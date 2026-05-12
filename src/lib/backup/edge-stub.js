// v3.1.0-rc8 — stub vide pour bundle Edge runtime de Next.js.
//
// Le scheduler backup utilise `node:fs`, `node:child_process`, `archiver`,
// `googleapis` et autres modules Node-only. Le bundle Edge ne sait pas
// les compiler. instrumentation.ts importe le scheduler dynamiquement
// MAIS gating runtime check `NEXT_RUNTIME !== 'nodejs'` ne suffit pas
// au build webpack, qui trace les imports même morts.
//
// next.config.js alias `./lib/backup/scheduler` vers ce stub uniquement
// pour `nextRuntime === 'edge'`. Pour le runtime Node, le vrai
// `scheduler.ts` est utilisé.

module.exports = {
  initScheduler: async () => {},
  reloadScheduler: async () => ({ status: 'stopped', schedule: null }),
  stopScheduler: () => {},
};
