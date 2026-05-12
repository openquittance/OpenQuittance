import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

const putSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
});

/**
 * PUT : update du rôle d'une membership existante.
 *
 * Validation : caller doit être ADMIN sur le bailleur cible. Pas de
 * restriction "dernier ADMIN" pour l'instant (cf. TODO D.10 — empêcher
 * de retirer le dernier ADMIN d'un bailleur).
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { userId: string; bailleurId: string } },
) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;

  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const callerMembs = (session.user as { memberships?: { bailleurId: string; role: string }[] }).memberships ?? [];
  const callerOnTarget = callerMembs.find(m => m.bailleurId === params.bailleurId);
  if (!callerOnTarget || callerOnTarget.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé ADMIN du bailleur' }, { status: 403 });
  }

  // Self-update interdit (cohérent /api/admin/users/[id])
  if (params.userId === session.user!.id) {
    return NextResponse.json({ error: 'Impossible de modifier votre propre rôle' }, { status: 400 });
  }

  try {
    const updated = await prisma.bailleurMembership.update({
      where: { userId_bailleurId: { userId: params.userId, bailleurId: params.bailleurId } },
      data: { role: parsed.data.role },
    });
    return NextResponse.json({ ok: true, membership: updated });
  } catch {
    return NextResponse.json({ error: 'Membership introuvable' }, { status: 404 });
  }
}

/**
 * DELETE : retire la membership pour ce bailleur.
 *
 * Validation : caller doit être ADMIN sur le bailleur cible.
 *
 * Comportement "dernière membership" : laisse le user orphelin
 * (cf. docs/MULTI-BAILLEUR.md — User.role staff sans memberships =
 * filtres rc3/rc4 le bloquent partout). Pas de delete auto, pas de
 * disabledAt auto.
 */
export async function DELETE(
  _: NextRequest,
  { params }: { params: { userId: string; bailleurId: string } },
) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;

  const callerMembs = (session.user as { memberships?: { bailleurId: string; role: string }[] }).memberships ?? [];
  const callerOnTarget = callerMembs.find(m => m.bailleurId === params.bailleurId);
  if (!callerOnTarget || callerOnTarget.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Réservé ADMIN du bailleur' }, { status: 403 });
  }
  if (params.userId === session.user!.id) {
    return NextResponse.json({ error: 'Impossible de retirer votre propre membership' }, { status: 400 });
  }

  try {
    await prisma.bailleurMembership.delete({
      where: { userId_bailleurId: { userId: params.userId, bailleurId: params.bailleurId } },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Membership introuvable' }, { status: 404 });
  }
}
