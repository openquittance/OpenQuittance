import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { withBailleurScope, handleScopeError } from '@/lib/multi-bailleur';
import { bienSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  try {
    const { bailleurId } = withBailleurScope(
      session,
      req.nextUrl.searchParams.get('bailleurId'),
    );
    const biens = await prisma.bien.findMany({
      where: { bailleurId },
      include: { bailleur: { select: { nom: true } }, _count: { select: { locataires: true } } },
      orderBy: { nom: 'asc' },
    });
    return NextResponse.json(biens);
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  const body = await req.json();
  const parsed = bienSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    // Le body porte le bailleurId ciblé : on valide qu'il est dans le scope.
    const { bailleurId } = withBailleurScope(session, parsed.data.bailleurId);
    // Hotfix v2.7.0-rc3 : narrow vers BienUncheckedCreateInput (FK
    // bailleurId direct). annonceMeta typé InputJsonValue côté Prisma.
    const data: Prisma.BienUncheckedCreateInput = {
      ...parsed.data,
      bailleurId,
      annonceMeta: parsed.data.annonceMeta as Prisma.InputJsonValue | undefined,
    };
    const created = await prisma.bien.create({ data });
    return NextResponse.json(created);
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
