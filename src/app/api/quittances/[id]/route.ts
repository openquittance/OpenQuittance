import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { requireResourceInScope, handleScopeError } from '@/lib/multi-bailleur';
import { quittanceUpdateSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  try {
    const q = await requireResourceInScope(session, allowed =>
      prisma.quittance.findFirst({
        where: {
          id: params.id,
          locataire: { bien: { bailleurId: { in: allowed } } },
        },
        include: { locataire: { include: { bien: true } } },
      })
    );
    return NextResponse.json(q);
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  try {
    const owned = await requireResourceInScope(session, allowed =>
      prisma.quittance.findFirst({
        where: {
          id: params.id,
          locataire: { bien: { bailleurId: { in: allowed } } },
        },
      })
    );

    const body = await req.json();
    const parsed = quittanceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.loyerNu !== undefined) data.loyerNu = parsed.data.loyerNu;
    if (parsed.data.charges !== undefined) data.charges = parsed.data.charges;
    if (parsed.data.datePaiement) data.datePaiement = new Date(parsed.data.datePaiement);
    if (parsed.data.dateEmission) data.dateEmission = new Date(parsed.data.dateEmission);
    if (parsed.data.avoirAppliqueLoyer !== undefined) data.avoirAppliqueLoyer = parsed.data.avoirAppliqueLoyer;
    if (parsed.data.avoirAppliqueCharges !== undefined) data.avoirAppliqueCharges = parsed.data.avoirAppliqueCharges;
    if (parsed.data.montantPercu !== undefined) data.montantPercu = parsed.data.montantPercu;
    if (parsed.data.surplusLoyer !== undefined) data.surplusLoyer = parsed.data.surplusLoyer;
    if (parsed.data.surplusCharges !== undefined) data.surplusCharges = parsed.data.surplusCharges;
    if (parsed.data.commentaire !== undefined) data.commentaire = parsed.data.commentaire || null;

    const newLoyer = parsed.data.loyerNu ?? owned.loyerNu;
    const newCharges = parsed.data.charges ?? owned.charges;
    const newAvoirLoyer = parsed.data.avoirAppliqueLoyer ?? owned.avoirAppliqueLoyer ?? 0;
    const newAvoirCharges = parsed.data.avoirAppliqueCharges ?? owned.avoirAppliqueCharges ?? 0;
    data.montantTotal = parsed.data.montantTotal !== undefined
      ? parsed.data.montantTotal
      : +((newLoyer - newAvoirLoyer) + (newCharges - newAvoirCharges)).toFixed(2);

    const contentChanged = parsed.data.loyerNu !== undefined || parsed.data.charges !== undefined
      || parsed.data.datePaiement || parsed.data.dateEmission
      || parsed.data.avoirAppliqueLoyer !== undefined || parsed.data.avoirAppliqueCharges !== undefined
      || parsed.data.surplusLoyer !== undefined || parsed.data.surplusCharges !== undefined
      || parsed.data.montantPercu !== undefined || parsed.data.commentaire !== undefined;
    if (contentChanged) data.pdfGenere = false;

    const updated = await prisma.quittance.update({ where: { id: params.id }, data });
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
      prisma.quittance.findFirst({
        where: {
          id: params.id,
          locataire: { bien: { bailleurId: { in: allowed } } },
        },
        select: { id: true },
      })
    );
    await prisma.quittance.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
