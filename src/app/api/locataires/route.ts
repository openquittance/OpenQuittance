import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { withBailleurScope, allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { locataireSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  try {
    const { bailleurId } = withBailleurScope(
      session,
      req.nextUrl.searchParams.get('bailleurId'),
    );
    const locataires = await prisma.locataire.findMany({
      where: { bien: { bailleurId } },
      include: { bien: { include: { bailleur: { select: { nom: true } } } } },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });
    return NextResponse.json(locataires);
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  const body = await req.json();
  const parsed = locataireSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    // Le bienId pointé doit être dans un bailleur du scope.
    const allowed = allowedBailleurIds(session);
    const bien = await prisma.bien.findFirst({
      where: { id: parsed.data.bienId, bailleurId: { in: allowed } },
      select: { id: true },
    });
    if (!bien) {
      return NextResponse.json({ error: 'Bien introuvable' }, { status: 404 });
    }
    const data = {
      ...parsed.data,
      dateEntree: new Date(parsed.data.dateEntree),
      dateSortie: parsed.data.dateSortie ? new Date(parsed.data.dateSortie) : null,
      email: parsed.data.email || null,
    };
    const created = await prisma.locataire.create({ data });
    return NextResponse.json(created);
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
