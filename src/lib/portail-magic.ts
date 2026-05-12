import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { prisma } from './prisma';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

// Magic link pour le portail locataire (cf. docs/PORTAIL-LOCATAIRE.md).
// Token clair de 64 chars hex, hashé scrypt en base. Usage unique, expire 15 min.

const TOKEN_BYTES = 32;          // → 64 chars hex
const EXPIRY_MS = 15 * 60 * 1000; // 15 min

/**
 * Génère un nouveau magic link pour un user TENANT.
 * Stocke le hash en base et retourne le token clair (à mettre dans l'URL email).
 */
export async function generateMagicLink(opts: {
  tenantUserId: string;
  ip?: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(TOKEN_BYTES).toString('hex');
  const tokenHash = await hashToken(token);
  const expiresAt = new Date(Date.now() + EXPIRY_MS);
  await prisma.portailMagicLink.create({
    data: {
      tenantUserId: opts.tenantUserId,
      tokenHash,
      expiresAt,
      ip: opts.ip ?? null,
    },
  });
  return { token, expiresAt };
}

/**
 * Consomme un magic link : vérifie qu'il existe, n'est pas expiré, n'a pas déjà
 * été utilisé. Retourne tenantUserId si OK, null sinon. Marque le token comme
 * consommé (transactionnel pour éviter la double-consommation parallèle).
 */
export async function consumeMagicLink(token: string): Promise<string | null> {
  if (!token || typeof token !== 'string' || token.length !== TOKEN_BYTES * 2) {
    return null;
  }
  const tokenHash = await hashToken(token);

  // findUnique sur tokenHash (index unique) puis update avec optimistic check.
  // En cas de course (deux requêtes simultanées avec le même token),
  // updateMany avec un WHERE consumedAt IS NULL garantit qu'une seule réussit.
  const link = await prisma.portailMagicLink.findUnique({ where: { tokenHash } });
  if (!link) return null;
  if (link.consumedAt) return null;
  if (link.expiresAt.getTime() < Date.now()) return null;

  const update = await prisma.portailMagicLink.updateMany({
    where: { id: link.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (update.count !== 1) return null;

  // Vérifie que l'utilisateur n'a pas été désactivé entre-temps
  const user = await prisma.user.findUnique({
    where: { id: link.tenantUserId },
    select: { id: true, role: true, disabledAt: true },
  });
  if (!user || user.role !== 'TENANT' || user.disabledAt) return null;

  return user.id;
}

/**
 * Pre-validate un magic link sans le consommer (cf. /portail/login/verify
 * Server Component). Retourne l'état du token sans modifier la DB.
 *   - 'valid'    : token connu, pas consommé, pas expiré
 *   - 'consumed' : token connu mais déjà utilisé (one-shot)
 *   - 'expired'  : token connu, pas consommé, mais expiré
 *   - 'invalid'  : token absent ou format incorrect
 */
export async function peekMagicLink(
  token: string,
): Promise<'valid' | 'consumed' | 'expired' | 'invalid'> {
  if (!token || typeof token !== 'string' || token.length !== TOKEN_BYTES * 2) {
    return 'invalid';
  }
  const tokenHash = await hashToken(token);
  const link = await prisma.portailMagicLink.findUnique({ where: { tokenHash } });
  if (!link) return 'invalid';
  if (link.consumedAt) return 'consumed';
  if (link.expiresAt.getTime() < Date.now()) return 'expired';
  return 'valid';
}

/** Invalide tous les magic links pendants pour un user (désactivation portail). */
export async function invalidateAllMagicLinks(tenantUserId: string): Promise<number> {
  const r = await prisma.portailMagicLink.deleteMany({ where: { tenantUserId } });
  return r.count;
}

/** Purge les magic links expirés depuis plus de 24h (à appeler périodiquement). */
export async function purgeExpiredMagicLinks(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  const r = await prisma.portailMagicLink.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  return r.count;
}

// ─── Hash helpers ────────────────────────────────────────────────────────────

// v2.8.0 quick win sécu (rc2 fix) : check NEXTAUTH_SECRET lazy au premier
// usage, pas au top-level. Throw au build Next ("Collecting page data"
// phase) sinon, car cette phase évalue les modules sans env runtime.
// Cf. docs/SECURITE-CONFORMITE.md §1.1.4.
function getScryptSalt(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error(
      'NEXTAUTH_SECRET manquant ou trop court (minimum 32 caractères). '
      + 'Générer un secret avec : openssl rand -hex 32',
    );
  }
  return s;
}

async function hashToken(token: string): Promise<string> {
  // Salt déterministe (≠ recommandation OWASP générale, mais ici on a besoin
  // de pouvoir retrouver le hash via findUnique). La sécurité repose sur :
  //   1. Token de 256 bits (entropie suffisante pour empêcher le brute-force)
  //   2. NEXTAUTH_SECRET imprévisible côté serveur
  //   3. Expiration 15 min + usage unique
  const derived = await scrypt(token, getScryptSalt(), 32);
  return derived.toString('hex');
}

/** Compare deux hashes en temps constant (évite les side-channel). */
export function safeCompareHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
