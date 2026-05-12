import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import type { AppRole } from '@prisma/client';
import { hasRole } from './access-control';

export async function requireUserId(): Promise<string | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  return session.user.id;
}

export function isError<T>(v: T | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

/**
 * Récupère la session staff scopée. Retourne directement la `Session`
 * typée (avec `memberships` chargés par le jwt callback) si le user est
 * authentifié ET a au moins le rôle staff requis. Sinon renvoie une
 * `NextResponse` 401/403 prête à retourner.
 *
 * TENANT est explicitement exclu (utilise les routes /portail/*).
 *
 * Usage type :
 *   const session = await requireStaffSession('VIEWER');
 *   if (isError(session)) return session;
 *   try {
 *     const { bailleurId } = withBailleurScope(session, ...);
 *     ...
 *   } catch (e) {
 *     const r = handleScopeError(e); if (r) return r;
 *     throw e;
 *   }
 */
export async function requireStaffSession(
  minRole: Exclude<AppRole, 'TENANT'> = 'VIEWER',
): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const role = (session.user as { role?: AppRole }).role;
  if (role === 'TENANT' || !role) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }
  if (!hasRole(role, minRole)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }
  return session;
}
