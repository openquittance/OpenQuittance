import { prisma } from '../prisma';
import { decrypt } from '../crypto';

/**
 * v3.2.0-rc2 — helper centralisé pour les credentials Google OAuth
 * (login NextAuth + Gmail API).
 *
 * Stratégie :
 *   1. Lit `AppConfig.googleClientId/Secret` (chiffrés `enc:v1:`).
 *      Si présents → décrypte → retourne `{ source: 'db' }`.
 *   2. Sinon fallback `process.env.GOOGLE_CLIENT_ID/SECRET` (rétro-compat
 *      dev local + premier boot avant migration). → `{ source: 'env' }`.
 *   3. Sinon retourne `null` → caller log warning + désactive feature.
 *
 * Cache léger 60s pour éviter requête DB à chaque hit (les credentials
 * Google changent rarement). Invalidation manuelle via
 * `invalidateGoogleCredentialsCache()` après save UI.
 *
 * Note NextAuth : les providers sont init'd au boot. Pour que Google
 * login utilise les credentials DB, instrumentation.ts pré-popule
 * process.env au démarrage (cf. fichier). Ce helper est utilisé
 * directement par Gmail API qui lit dynamiquement à chaque envoi.
 */

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  source: 'db' | 'env';
}

interface CacheEntry {
  value: GoogleCredentials | null;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
let cache: CacheEntry | null = null;

export async function getGoogleCredentials(): Promise<GoogleCredentials | null> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.value;
  }

  let result: GoogleCredentials | null = null;

  // 1. Lit DB (priorité v3.2.0+)
  try {
    const cfg = await prisma.appConfig.findUnique({
      where: { id: 'singleton' },
      select: { googleClientId: true, googleClientSecret: true },
    });
    if (cfg?.googleClientId && cfg?.googleClientSecret) {
      result = {
        clientId: decrypt(cfg.googleClientId),
        clientSecret: decrypt(cfg.googleClientSecret),
        source: 'db',
      };
    }
  } catch (e) {
    // DB indisponible (premier boot avant migration, etc.) → fallback env
    console.warn('[integrations/google] DB lookup failed, fallback env :', e instanceof Error ? e.message : e);
  }

  // 2. Fallback .env legacy
  if (!result && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    result = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      source: 'env',
    };
  }

  cache = { value: result, expiresAt: Date.now() + CACHE_TTL_MS };
  return result;
}

/**
 * Invalide le cache. À appeler après save côté
 * `/api/parametres/integrations` pour que Gmail API utilise les
 * nouvelles creds immédiatement (NextAuth nécessite restart container
 * — credentials lus au boot).
 */
export function invalidateGoogleCredentialsCache(): void {
  cache = null;
}

/**
 * Test-only : reset cache + permet d'injecter une valeur (DI).
 */
export const _internals = {
  resetCache: () => { cache = null; },
  setCache: (value: GoogleCredentials | null, ttlMs = CACHE_TTL_MS) => {
    cache = { value, expiresAt: Date.now() + ttlMs };
  },
  getCache: () => cache,
};
