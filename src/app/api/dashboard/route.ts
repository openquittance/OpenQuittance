import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { withBailleurScope, handleScopeError } from '@/lib/multi-bailleur';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  try {
    const { bailleurId } = withBailleurScope(
      session,
      req.nextUrl.searchParams.get('bailleurId'),
    );
    const bienFilter = { bailleurId };

    const now = new Date();
    const mois = now.getMonth() + 1;
    const annee = now.getFullYear();

    const baseLocataire = { bien: bienFilter };

    const [locActifs, biensCount, quittancesMois, locAgg, dernieres, sansEmail, nonEnvoyees] = await Promise.all([
      prisma.locataire.count({ where: { actif: true, ...baseLocataire } }),
      prisma.bien.count({ where: { actif: true, ...bienFilter } }),
      prisma.quittance.count({ where: { mois, annee, locataire: baseLocataire } }),
      prisma.locataire.aggregate({
        where: { actif: true, ...baseLocataire },
        _sum: { loyerNu: true, charges: true },
      }),
      prisma.quittance.findMany({
        where: { locataire: baseLocataire },
        include: { locataire: { include: { bien: { include: { bailleur: { select: { nom: true } } } } } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.locataire.count({
        where: { actif: true, ...baseLocataire, OR: [{ email: null }, { email: '' }] },
      }),
      prisma.quittance.count({
        where: { mois, annee, emailEnvoye: false, locataire: baseLocataire },
      }),
    ]);

    const revenusMensuels = (locAgg._sum.loyerNu ?? 0) + (locAgg._sum.charges ?? 0);

    return NextResponse.json({
      locActifs, biensCount, quittancesMois, revenusMensuels,
      dernieres, mois, annee, sansEmail, nonEnvoyees,
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
