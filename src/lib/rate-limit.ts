// Rate limiting in-memory simple, sans dépendance externe.
//
// Limitations connues :
//   - Mémoire process-local : ne fonctionne qu'avec une seule instance Docker.
//     Pour du multi-instance, migrer vers Redis (@upstash/ratelimit ou ioredis).
//   - Reset au redémarrage du conteneur.
//   - Pas de fenêtre glissante précise (sliding window approximé via decay).
//
// Suffisant pour un déploiement self-hosted typique (1 conteneur, 1-100
// utilisateurs).

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Purge périodique des buckets expirés (évite la fuite mémoire).
const PURGE_INTERVAL_MS = 5 * 60 * 1000;
let purgeTimer: ReturnType<typeof setInterval> | null = null;
function ensurePurger() {
  if (purgeTimer) return;
  purgeTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (v.resetAt < now) store.delete(k);
    }
  }, PURGE_INTERVAL_MS);
  // En Node, unref() pour ne pas empêcher le shutdown
  if (typeof purgeTimer.unref === 'function') purgeTimer.unref();
}

export interface RateLimitOptions {
  /** Identifiant unique de la limite (typ. `${endpoint}:${ip}`) */
  key: string;
  /** Nombre max d'appels autorisés dans la fenêtre */
  limit: number;
  /** Durée de la fenêtre en millisecondes */
  windowMs: number;
}

export interface RateLimitResult {
  /** false si la limite est atteinte */
  allowed: boolean;
  /** Nombre d'appels restants dans la fenêtre */
  remaining: number;
  /** Timestamp Unix ms du reset de la fenêtre */
  resetAt: number;
  /** Secondes avant le reset (utile pour Retry-After) */
  retryAfterSec: number;
}

export function rateLimit(opts: RateLimitOptions): RateLimitResult {
  ensurePurger();
  const now = Date.now();
  const bucket = store.get(opts.key);

  if (!bucket || bucket.resetAt < now) {
    // Nouvelle fenêtre
    const fresh: Bucket = { count: 1, resetAt: now + opts.windowMs };
    store.set(opts.key, fresh);
    return {
      allowed: true,
      remaining: opts.limit - 1,
      resetAt: fresh.resetAt,
      retryAfterSec: Math.ceil(opts.windowMs / 1000),
    };
  }

  bucket.count++;
  const allowed = bucket.count <= opts.limit;
  return {
    allowed,
    remaining: Math.max(0, opts.limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Extrait l'IP du client depuis les headers (Cloudflare → reverse proxy → app). */
export function clientIp(req: Request): string {
  const h = req.headers;
  return h.get('cf-connecting-ip')
      ?? h.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? h.get('x-real-ip')
      ?? 'unknown';
}
