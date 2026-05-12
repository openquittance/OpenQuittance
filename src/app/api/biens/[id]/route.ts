import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { requireResourceInScope, handleScopeError } from '@/lib/multi-bailleur';
import type { Prisma } from '@prisma/client';
import { bienUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  const body = await req.json();
  const parsed = bienUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    // Vérifie que le Bien existe ET appartient à un bailleur dans le scope.
    // 404 si non trouvé (no oracle leak).
    await requireResourceInScope(session, allowed =>
      prisma.bien.findFirst({
        where: { id: params.id, bailleurId: { in: allowed } },
        select: { id: true },
      })
    );
    // bienUpdateSchema omit `bailleurId` → schema PUT ne contient PAS la
    // FK, donc l'union BienUpdateInput | BienUncheckedUpdateInput se
    // résout sans ambiguïté côté TS. annonceMeta typé InputJsonValue.
    const data: Prisma.BienUncheckedUpdateInput = {
      ...parsed.data,
      annonceMeta: parsed.data.annonceMeta as Prisma.InputJsonValue | undefined,
    };
    const updated = await prisma.bien.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json(updated);
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;
  try {
    await requireResourceInScope(session, allowed =>
      prisma.bien.findFirst({
        where: { id: params.id, bailleurId: { in: allowed } },
        select: { id: true },
      })
    );
    try {
      await prisma.bien.delete({ where: { id: params.id } });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json(
        { error: 'Suppression impossible (locataires liés). Désactivez plutôt.' },
        { status: 400 },
      );
    }
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
