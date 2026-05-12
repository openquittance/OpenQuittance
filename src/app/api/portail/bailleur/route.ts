import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Renvoie les infos de branding du bailleur dont dépend le TENANT loggué.
 * On prend le bailleur du PREMIER locataire actif lié (multi-bail = même
 * bailleur en v1, hypothèse documentée note de cadrage §1).
 *
 * Aucune information sensible : nom + couleur charte + logo URL publique.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const loc = await prisma.locataire.findFirst({
    where: {
      tenantUserId: session.user.id,
      portailActif: true,
    },
    include: { bien: { include: { bailleur: { select: { nom: true, pdfCouleur: true, logoUrl: true } } } } },
  });
  if (!loc) {
    return NextResponse.json({ error: 'Aucun bail actif' }, { status: 404 });
  }
  return NextResponse.json(loc.bien.bailleur);
}
