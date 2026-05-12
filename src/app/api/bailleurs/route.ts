import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds } from '@/lib/multi-bailleur';
import { bailleurSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/**
 * Liste des bailleurs accessibles au user staff. Filtré aux memberships
 * uniquement (cf. docs/MULTI-BAILLEUR.md). Un user qui n'a pas accès
 * à un bailleur ne le voit pas, même en liste.
 */
export async function GET() {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  const allowed = allowedBailleurIds(session);
  const bailleurs = allowed.length === 0
    ? []
    : await prisma.bailleur.findMany({
        where: { id: { in: allowed } },
        orderBy: { createdAt: 'asc' },
      });
  return NextResponse.json(bailleurs);
}

/**
 * Création d'un bailleur. Réservé MEMBER+ app-level. Le créateur reçoit
 * automatiquement une membership ADMIN sur le bailleur créé.
 */
export async function POST(req: NextRequest) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;

  const body = await req.json();
  const parsed = bailleurSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const created = await prisma.$transaction(async tx => {
    const b = await tx.bailleur.create({ data: parsed.data });
    await tx.bailleurMembership.create({
      data: { userId: session.user!.id, bailleurId: b.id, role: 'ADMIN' },
    });
    return b;
  });
  return NextResponse.json(created);
}
