import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { requireResourceInScope, handleScopeError } from '@/lib/multi-bailleur';
import { generateQuittancePdf } from '@/lib/pdf-generator';
import { moisLabel } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;

  try {
    const quittance = await requireResourceInScope(session, allowed =>
      prisma.quittance.findFirst({
        where: {
          id: params.id,
          locataire: { bien: { bailleurId: { in: allowed } } },
        },
        include: { locataire: { include: { bien: { include: { bailleur: true } } } } },
      })
    );

    const olderCount = await prisma.quittance.count({
      where: {
        mois: quittance.mois,
        annee: quittance.annee,
        createdAt: { lte: quittance.createdAt },
      },
    });
    const numero = `${quittance.annee}-${String(quittance.mois).padStart(2, '0')}-${String(olderCount).padStart(3, '0')}`;

    const buffer = await generateQuittancePdf({
      quittance,
      locataire: quittance.locataire,
      bien: quittance.locataire.bien,
      bailleur: quittance.locataire.bien.bailleur,
      numero,
    });

    await prisma.quittance.update({ where: { id: quittance.id }, data: { pdfGenere: true } });

    const inline = req.nextUrl.searchParams.get('inline') === '1';
    const filename = `Quittance_${moisLabel(quittance.mois)}_${quittance.annee}_${quittance.locataire.nom}.pdf`
      .replace(/\s+/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
