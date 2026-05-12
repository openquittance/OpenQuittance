import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { withBailleurScope, handleScopeError } from '@/lib/multi-bailleur';
import { envoyerMoisSchema } from '@/lib/validation';
import { envoyerQuittance } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  const body = await req.json();
  const parsed = envoyerMoisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    const { bailleurId } = withBailleurScope(session, parsed.data.bailleurId);
    const { mois, annee } = parsed.data;
    const userId = session.user!.id;
    const quittances = await prisma.quittance.findMany({
      where: { mois, annee, emailEnvoye: false, locataire: { bien: { bailleurId } } },
      include: { locataire: true },
    });
    let sent = 0; let skipped = 0;
    const errors: { id: string; locataire: string; error: string }[] = [];
    for (const q of quittances) {
      if (!q.locataire.email) {
        errors.push({ id: q.id, locataire: `${q.locataire.prenom} ${q.locataire.nom}`, error: 'Email manquant' });
        skipped++;
        continue;
      }
      try {
        await envoyerQuittance({ userId, quittanceId: q.id });
        sent++;
      } catch (e) {
        errors.push({ id: q.id, locataire: `${q.locataire.prenom} ${q.locataire.nom}`, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ sent, skipped, total: quittances.length, errors });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
