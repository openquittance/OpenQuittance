import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { withBailleurScope, handleScopeError } from '@/lib/multi-bailleur';
import { genererMoisSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  const body = await req.json();
  const parsed = genererMoisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    const { bailleurId } = withBailleurScope(session, parsed.data.bailleurId);
    const { mois, annee, datePaiement, dateEmission } = parsed.data;

    const locataires = await prisma.locataire.findMany({
      where: { actif: true, bien: { bailleurId } },
    });
    const existantes = await prisma.quittance.findMany({
      where: { mois, annee, locataireId: { in: locataires.map(l => l.id) } },
      select: { locataireId: true },
    });
    const existeSet = new Set(existantes.map(e => e.locataireId));
    const skipped: string[] = [];
    let created = 0;

    for (const l of locataires) {
      if (existeSet.has(l.id)) {
        skipped.push(`${l.prenom} ${l.nom}`);
        continue;
      }
      try {
        await prisma.quittance.create({
          data: {
            locataireId: l.id, mois, annee,
            loyerNu: l.loyerNu, charges: l.charges,
            montantTotal: +(l.loyerNu + l.charges).toFixed(2),
            datePaiement: new Date(datePaiement),
            dateEmission: new Date(dateEmission),
          },
        });
        created++;
      } catch {
        skipped.push(`${l.prenom} ${l.nom} (erreur)`);
      }
    }
    return NextResponse.json({ created, skipped, total: locataires.length });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
