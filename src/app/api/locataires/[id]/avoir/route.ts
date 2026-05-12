import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { requireResourceInScope, handleScopeError } from '@/lib/multi-bailleur';
import { getAvoirSolde } from '@/lib/avoir';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  try {
    await requireResourceInScope(session, allowed =>
      prisma.locataire.findFirst({
        where: { id: params.id, bien: { bailleurId: { in: allowed } } },
        select: { id: true },
      })
    );
    const exclude = req.nextUrl.searchParams.get('excludeQuittanceId') ?? undefined;
    const solde = await getAvoirSolde(params.id, exclude);
    return NextResponse.json(solde);
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
