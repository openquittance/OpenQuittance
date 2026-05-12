import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUserId, isError } from '@/lib/auth-helpers';
import { requireRole } from '@/lib/access-control';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (isError(userId)) return userId;
  if (!await requireRole(userId, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  if (params.id === userId) {
    return NextResponse.json({ error: 'Impossible de modifier votre propre rôle' }, { status: 400 });
  }
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  // Guard double :
  //   1. role === 'TENANT' (cas clean)
  //   2. user lié à un Locataire.tenantUserId (source of truth — bloque
  //      les corruptions héritées rc1/rc2 où le role peut être MEMBER/VIEWER
  //      en DB alors que le user est en réalité un TENANT, cf. test 20)
  // Le rôle TENANT est géré via la fiche locataire
  // (Locataire.tenantUserId, cf. docs/PORTAIL-LOCATAIRE.md).
  const target = await prisma.user.findUnique({
    where: { id: params.id },
    select: { role: true, _count: { select: { locatairesAccessibles: true } } },
  });
  if (!target) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  if (target.role === 'TENANT' || target._count.locatairesAccessibles > 0) {
    return NextResponse.json(
      { error: 'Ce compte est un locataire (TENANT). Géré via la fiche locataire, pas via cette page.' },
      { status: 400 },
    );
  }
  const updated = await prisma.user.update({
    where: { id: params.id },
    data: { role: parsed.data.role },
    select: { id: true, name: true, email: true, role: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (isError(userId)) return userId;
  if (!await requireRole(userId, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  if (params.id === userId) {
    return NextResponse.json({ error: 'Impossible de supprimer votre propre compte' }, { status: 400 });
  }
  // Empêcher de supprimer le dernier ADMIN
  const target = await prisma.user.findUnique({
    where: { id: params.id },
    include: { _count: { select: { locatairesAccessibles: true } } },
  });
  if (!target) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  // Guard double : role TENANT OU lié à un Locataire (source of truth).
  // La suppression d'un locataire passe par sa fiche (DELETE
  // /api/locataires/[id]) qui gère aussi l'orphelin (disabledAt).
  if (target.role === 'TENANT' || target._count.locatairesAccessibles > 0) {
    return NextResponse.json(
      { error: 'Ce compte est un locataire (TENANT). Suppression via la fiche locataire.' },
      { status: 400 },
    );
  }
  if (target.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Au moins un ADMIN doit rester' }, { status: 400 });
    }
  }
  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
