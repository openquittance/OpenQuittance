import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { withBailleurScope, handleScopeError } from '@/lib/multi-bailleur';
import { envoyerMoisSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  const body = await req.json();
  const parsed = envoyerMoisSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    const { bailleurId } = withBailleurScope(session, parsed.data.bailleurId);
    const { mois, annee } = parsed.data;
    const quittances = await prisma.quittance.findMany({
      where: { mois, annee, emailEnvoye: false, locataire: { bien: { bailleurId } } },
      include: { locataire: { select: { nom: true, prenom: true, email: true } } },
      orderBy: { locataire: { nom: 'asc' } },
    });
    return NextResponse.json({
      items: quittances.map(q => ({
        id: q.id,
        nomComplet: `${q.locataire.nom} ${q.locataire.prenom}`,
        email: q.locataire.email ?? '',
        hasEmail: !!q.locataire.email,
      })),
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
