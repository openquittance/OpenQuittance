import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { requireResourceInScope, handleScopeError } from '@/lib/multi-bailleur';
import { bailleurUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  try {
    const b = await requireResourceInScope(session, allowed =>
      prisma.bailleur.findFirst({ where: { AND: [{ id: params.id }, { id: { in: allowed } }] } })
    );
    return NextResponse.json(b);
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  const body = await req.json();
  const parsed = bailleurUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    await requireResourceInScope(session, allowed =>
      prisma.bailleur.findFirst({ where: { AND: [{ id: params.id }, { id: { in: allowed } }] } })
    );
    const updated = await prisma.bailleur.update({ where: { id: params.id }, data: parsed.data });
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
      prisma.bailleur.findFirst({ where: { AND: [{ id: params.id }, { id: { in: allowed } }] } })
    );
    // ADMIN sur ce bailleur précisément (pas juste ADMIN app-level)
    const memb = (session.user as { memberships?: { bailleurId: string; role: string }[] }).memberships ?? [];
    const m = memb.find(x => x.bailleurId === params.id);
    if (m?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Réservé ADMIN du bailleur' }, { status: 403 });
    }
    await prisma.bailleur.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
