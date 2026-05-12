/**
 * v3.1.0 — instrumentation Next.js (boot hook).
 *
 * Appelée une fois au démarrage du runtime serveur. Cf.
 * https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 *
 * Démarre le scheduler backup si configuré. Sécurisé en build (process.env
 * absents → AppConfig.findUnique throw côté Prisma → catch dans
 * initScheduler).
 *
 * v3.1.0-rc8 hotfix : `webpackIgnore: true` sur le dynamic import pour que
 * webpack ne tente PAS de tracer `./lib/backup/scheduler` (qui transitivement
 * pull pdfkit + archiver + googleapis + AWS SDK — autant de Node-natives
 * que webpack ne sait pas résoudre côté bundle Edge runtime). Au runtime
 * standalone Next.js fournit `import()` natif Node qui résout les modules.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  // v3.2.0-rc2 — pré-populer process.env.GOOGLE_CLIENT_ID/SECRET depuis
  // AppConfig DB avant que NextAuth init ses providers. NextAuth
  // synchrone au boot — sans pré-population, le provider Google
  // utilisera les valeurs `.env` (ou aucune si .env vide). Ce hook
  // permet à un user qui a configuré via UI de bénéficier du login
  // Google sans avoir à toucher au `.env`.
  //
  // Cas no-op : DB null OU .env déjà défini (rétro-compat dev).
  try {
    const { getGoogleCredentials } = await import('./lib/integrations/google');
    const creds = await getGoogleCredentials();
    if (creds && creds.source === 'db') {
      // Note : on écrase aussi si .env défini, pour que UI > DB > env.
      process.env.GOOGLE_CLIENT_ID = creds.clientId;
      process.env.GOOGLE_CLIENT_SECRET = creds.clientSecret;
      console.log('[instrumentation] Google OAuth credentials pré-populés depuis DB → process.env');
    } else if (creds && creds.source === 'env') {
      // Déjà via .env — pas d'action.
    } else {
      console.log('[instrumentation] Aucun credential Google OAuth configuré — login Google désactivé');
    }
  } catch (e) {
    console.error('[instrumentation] Échec pré-population Google creds :', e);
  }

  try {
    // v3.1.0-rc8 hotfix : import dynamique. Webpack résoud le module au
    // build (chunks code splitting) et le filtre via webpack.config :
    // pour le bundle Edge runtime, scheduler.ts est aliasé vers un stub
    // vide (cf. next.config.js webpack callback).
    const { initScheduler } = await import('./lib/backup/scheduler');
    await initScheduler();
  } catch (e) {
    console.error('[instrumentation] Échec init scheduler backup :', e);
  }
}
