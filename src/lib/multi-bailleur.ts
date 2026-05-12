import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import type { AppRole } from '@prisma/client';

/**
 * Helpers d'isolation multi-bailleur (cf. docs/MULTI-BAILLEUR.md).
 *
 * Toute route staff qui retourne ou modifie des données scopées par
 * bailleur DOIT passer par `withBailleurScope` (routes liste/création
 * où le bailleurId vient du client) ou `requireResourceInScope` (routes
 * `[id]` où l'on fetch une ressource précise).
 *
 * Le scope est dérivé de `session.user.memberships` chargé par le jwt
 * callback (cf. src/auth.ts). Le `localStorage.activeBailleurId` côté
 * client n'est PAS une frontière de sécurité : il est seulement utilisé
 * comme préférence UX, et chaque appel API est revalidé server-side.
 */

export interface Membership {
  bailleurId: string;
  role: AppRole;
}

export interface ScopedSession {
  user: {
    id: string;
    role: AppRole;
    memberships: Membership[];
  };
}

export interface BailleurScope {
  bailleurId: string;
  role: AppRole;
}

/**
 * Erreur typée qui porte une `Response` Next.js prête à retourner.
 * Permet aux routes de faire `throw` sans wrapper try/catch lourd.
 */
export class ScopeError extends Error {
  constructor(public response: NextResponse) {
    super('Scope error');
  }
}

function isStaffSession(session: Session | null): session is Session & ScopedSession {
  if (!session?.user?.id) return false;
  const role = (session.user as { role?: AppRole }).role;
  return role === 'ADMIN' || role === 'MEMBER' || role === 'VIEWER';
}

/**
 * Valide que `requestedBailleurId` (typiquement `?bailleurId=...`) est
 * dans les memberships du user courant. Retourne le scope résolu.
 *
 * - TENANT : 403 (utilise routes /portail/*, pas ces helpers)
 * - non-staff (TENANT exclu déjà) ou non auth : 401
 * - 0 membership : 403 (staff orphelin, à rattacher par admin app)
 * - requestedBailleurId null + 1 seule membership : fallback automatique
 * - requestedBailleurId null + plusieurs memberships : 400
 * - requestedBailleurId hors memberships : 403
 */
export function withBailleurScope(
  session: Session | null,
  requestedBailleurId: string | null,
): BailleurScope {
  if (!session?.user?.id) {
    throw new ScopeError(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }));
  }
  if (!isStaffSession(session)) {
    throw new ScopeError(NextResponse.json({ error: 'Accès refusé' }, { status: 403 }));
  }
  const memberships = session.user.memberships ?? [];
  if (memberships.length === 0) {
    throw new ScopeError(NextResponse.json({
      error: 'Aucun bailleur associé à votre compte. Contactez un administrateur.',
    }, { status: 403 }));
  }

  // Normalisation : "" et whitespace sont traités comme null (= non fourni).
  // Sinon withBailleurScope(session, "") échouait en 403 ("hors memberships")
  // alors qu'on veut le comportement fallback (1 membership) ou 400 (multi).
  const id = requestedBailleurId?.trim() || null;

  if (!id) {
    if (memberships.length === 1) {
      return { bailleurId: memberships[0]!.bailleurId, role: memberships[0]!.role };
    }
    throw new ScopeError(NextResponse.json({
      error: 'bailleurId requis (vous avez accès à plusieurs bailleurs).',
    }, { status: 400 }));
  }

  const m = memberships.find(x => x.bailleurId === id);
  if (!m) {
    throw new ScopeError(NextResponse.json({ error: 'Accès refusé' }, { status: 403 }));
  }
  return { bailleurId: m.bailleurId, role: m.role };
}

/**
 * Liste des bailleurIds accessibles au user courant. Utile pour les
 * lookups par `[id]` qui cherchent une ressource dont le bailleur
 * doit être dans le scope.
 *
 *   const allowed = allowedBailleurIds(session);
 *   const q = await prisma.quittance.findFirst({
 *     where: { id, locataire: { bien: { bailleurId: { in: allowed } } } },
 *   });
 *   if (!q) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
 *
 * Toujours **404** quand on ne trouve pas (pas 403), pour ne pas
 * révéler l'existence cross-tenant.
 */
export function allowedBailleurIds(session: Session | null): string[] {
  if (!isStaffSession(session)) return [];
  return (session.user.memberships ?? []).map(m => m.bailleurId);
}

/**
 * Wrapper utilitaire pour le pattern `[id]`. Le `fetcher` reçoit la
 * liste des bailleurIds autorisés et doit retourner null si la
 * ressource n'existe pas OU n'est pas dans le scope. Le helper
 * normalise la réponse 404.
 *
 *   const archive = await requireResourceInScope(session, allowed =>
 *     prisma.archive.findFirst({ where: { id: params.id, ... } }),
 *   );
 *
 * @throws ScopeError 401 si non auth, 403 si TENANT/non-staff, 404 sinon.
 */
export async function requireResourceInScope<T>(
  session: Session | null,
  fetcher: (allowedBailleurIds: string[]) => Promise<T | null>,
): Promise<T> {
  if (!session?.user?.id) {
    throw new ScopeError(NextResponse.json({ error: 'Non authentifié' }, { status: 401 }));
  }
  if (!isStaffSession(session)) {
    throw new ScopeError(NextResponse.json({ error: 'Accès refusé' }, { status: 403 }));
  }
  const allowed = allowedBailleurIds(session);
  if (allowed.length === 0) {
    throw new ScopeError(NextResponse.json({
      error: 'Aucun bailleur associé à votre compte. Contactez un administrateur.',
    }, { status: 403 }));
  }
  const resource = await fetcher(allowed);
  if (!resource) {
    throw new ScopeError(NextResponse.json({ error: 'Introuvable' }, { status: 404 }));
  }
  return resource;
}

/**
 * Convertit une `ScopeError` en réponse Next.js (à utiliser dans le
 * try/catch des routes refactorées). Réveille l'erreur si ce n'est pas
 * une `ScopeError`.
 */
export function handleScopeError(e: unknown): NextResponse | null {
  if (e instanceof ScopeError) return e.response;
  return null;
}
