import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { generateDepotGarantie } from '@/lib/pdf-documents';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;

  const { searchParams } = req.nextUrl;
  const locataireId = searchParams.get('locataireId');
  const montantParam = searchParams.get('montant');
  const datePerceptionParam = searchParams.get('datePerception');

  if (!locataireId) {
    return NextResponse.json({ error: 'locataireId requis' }, { status: 400 });
  }

  try {
    const allowed = allowedBailleurIds(session);
    const locataire = await prisma.locataire.findFirst({
      where: { id: locataireId, bien: { bailleurId: { in: allowed } } },
      include: { bien: { include: { bailleur: true } } },
    });
    if (!locataire) {
      return NextResponse.json({ error: 'Locataire introuvable' }, { status: 404 });
    }

    const montant = montantParam
      ? parseFloat(montantParam)
      : locataire.montantDepotGarantie ?? locataire.loyerNu;

    if (!Number.isFinite(montant) || montant <= 0) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
    }

    const datePerception = datePerceptionParam
      ? new Date(datePerceptionParam)
      : locataire.dateEntree;

    const buf = await generateDepotGarantie({
      locataire,
      bien: locataire.bien,
      bailleur: locataire.bien.bailleur,
      montant,
      datePerception,
    });

    await logAudit({
      actorId: session.user!.id,
      action: 'document.generate',
      targetType: 'Locataire',
      targetId: locataire.id,
      metadata: { type: 'depot_garantie', montant, bailleurId: locataire.bien.bailleurId },
      ip: ipFromRequest(req),
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="depot-garantie-${locataire.nom}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
