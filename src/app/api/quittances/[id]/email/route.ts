import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { requireResourceInScope, handleScopeError } from '@/lib/multi-bailleur';
import { envoyerQuittance } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  try {
    await requireResourceInScope(session, allowed =>
      prisma.quittance.findFirst({
        where: {
          id: params.id,
          locataire: { bien: { bailleurId: { in: allowed } } },
        },
        select: { id: true },
      })
    );
    const body = await req.json().catch(() => ({}));
    await envoyerQuittance({ userId: session.user!.id, quittanceId: params.id, to: body.to });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
