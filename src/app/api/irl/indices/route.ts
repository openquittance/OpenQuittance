import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { periodeId } from '@/lib/irl';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const indices = await prisma.indiceIRL.findMany({
    orderBy: [{ annee: 'desc' }, { trimestre: 'desc' }],
  });
  return NextResponse.json({ indices });
}

const upsertSchema = z.object({
  annee: z.coerce.number().int().min(2000).max(2100),
  trimestre: z.coerce.number().int().min(1).max(4),
  valeur: z.coerce.number().positive(),
  variation: z.coerce.number().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { annee, trimestre, valeur, variation } = parsed.data;
  const periode = periodeId(annee, trimestre);
  const indice = await prisma.indiceIRL.upsert({
    where: { periode },
    create: { periode, annee, trimestre, valeur, variation: variation ?? null, source: 'manual' },
    update: { valeur, variation: variation ?? null, source: 'manual' },
  });

  await logAudit({
    actorId: session.user.id,
    action: 'config.update',
    targetType: 'IndiceIRL',
    targetId: indice.id,
    metadata: { annee, trimestre, valeur },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ indice });
}
