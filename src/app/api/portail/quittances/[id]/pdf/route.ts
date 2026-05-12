import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { generateQuittancePdf } from '@/lib/pdf-generator';
import { moisLabel } from '@/lib/utils';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Download / aperçu d'une quittance par le locataire propriétaire.
 *
 * Sécurité critique : le filtre tenantUserId === session.user.id est
 * AU NIVEAU DU findUnique (where composite), pas en post-filtrage.
 * Si la quittance n'appartient pas au TENANT loggué → 404 (pas 403, pour
 * ne pas révéler son existence).
 *
 * Le middleware enforce déjà role === 'TENANT' sur /api/portail/*.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  // Phase 1 doc sharing : portailActif=true ET partageQuittances=true.
  // Cas false → 404 (Q7 cadrage : pas d'oracle).
  const quittance = await prisma.quittance.findFirst({
    where: {
      id: params.id,
      locataire: {
        tenantUserId: session.user.id,
        portailActif: true,
        partageQuittances: true,
      },
    },
    include: { locataire: { include: { bien: { include: { bailleur: true } } } } },
  });
  if (!quittance) {
    return NextResponse.json({ error: 'Quittance introuvable' }, { status: 404 });
  }

  // Numéro = même formule que côté staff
  const olderCount = await prisma.quittance.count({
    where: {
      mois: quittance.mois,
      annee: quittance.annee,
      createdAt: { lte: quittance.createdAt },
    },
  });
  const numero = `${quittance.annee}-${String(quittance.mois).padStart(2, '0')}-${String(olderCount).padStart(3, '0')}`;

  let buffer: Buffer;
  try {
    buffer = await generateQuittancePdf({
      quittance,
      locataire: quittance.locataire,
      bien: quittance.locataire.bien,
      bailleur: quittance.locataire.bien.bailleur,
      numero,
    });
  } catch (e) {
    console.error('[portail/pdf] generation failed', e);
    return NextResponse.json({ error: 'Erreur de génération du PDF' }, { status: 500 });
  }

  const download = req.nextUrl.searchParams.get('download') === '1';
  const filename = `Quittance_${moisLabel(quittance.mois)}_${quittance.annee}_${quittance.locataire.nom}.pdf`
    .replace(/\s+/g, '_');

  await logAudit({
    actorId: session.user.id,
    action: download ? 'tenant.quittance_download' : 'tenant.quittance_view',
    targetType: 'Quittance',
    targetId: quittance.id,
    metadata: { mois: quittance.mois, annee: quittance.annee },
    ip: ipFromRequest(req),
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
