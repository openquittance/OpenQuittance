import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { withBailleurScope, allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { quittanceCreateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;

  try {
    const { bailleurId } = withBailleurScope(
      session,
      req.nextUrl.searchParams.get('bailleurId'),
    );

    const { searchParams } = req.nextUrl;
    const mois = searchParams.get('mois');
    const annee = searchParams.get('annee');
    const locataireId = searchParams.get('locataireId');
    const sent = searchParams.get('sent');

    const where: Prisma.QuittanceWhereInput = {
      locataire: { bien: { bailleurId } },
    };
    if (mois) where.mois = Number(mois);
    if (annee) where.annee = Number(annee);
    if (locataireId) where.locataireId = locataireId;
    if (sent === '1') where.emailEnvoye = true;
    if (sent === '0') where.emailEnvoye = false;

    const quittances = await prisma.quittance.findMany({
      where,
      include: {
        locataire: {
          include: { bien: { include: { bailleur: { select: { id: true, nom: true } } } } },
        },
      },
      orderBy: [{ annee: 'desc' }, { mois: 'desc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json(quittances);
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;

  const body = await req.json();
  const parsed = quittanceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { locataireId, mois, annee, datePaiement, dateEmission } = parsed.data;

  try {
    const allowed = allowedBailleurIds(session);
    const locataire = await prisma.locataire.findFirst({
      where: { id: locataireId, bien: { bailleurId: { in: allowed } } },
    });
    if (!locataire) return NextResponse.json({ error: 'Locataire introuvable' }, { status: 404 });

    const avoirAppliqueLoyer = parsed.data.avoirAppliqueLoyer ?? 0;
    const avoirAppliqueCharges = parsed.data.avoirAppliqueCharges ?? 0;
    const montantTotal = +((locataire.loyerNu - avoirAppliqueLoyer) + (locataire.charges - avoirAppliqueCharges)).toFixed(2);
    const montantPercu = parsed.data.montantPercu ?? null;

    const created = await prisma.quittance.create({
      data: {
        locataireId, mois, annee,
        loyerNu: locataire.loyerNu,
        charges: locataire.charges,
        montantTotal,
        datePaiement: new Date(datePaiement),
        dateEmission: new Date(dateEmission),
        avoirAppliqueLoyer, avoirAppliqueCharges, montantPercu,
        surplusLoyer: parsed.data.surplusLoyer ?? 0,
        surplusCharges: parsed.data.surplusCharges ?? 0,
        commentaire: parsed.data.commentaire || null,
      },
    });
    return NextResponse.json(created);
  } catch (e: unknown) {
    const r = handleScopeError(e); if (r) return r;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Unique')) {
      return NextResponse.json({ error: 'Quittance déjà existante pour ce mois.' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
