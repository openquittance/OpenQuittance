import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email('Email invalide').max(200),
  source: z.string().max(50).optional(),
});

/**
 * Endpoint public pour la pré-inscription à l'offre managée future.
 * Aucune authentification — accepté depuis la page /a-propos.
 * On rejette silencieusement si l'email existe déjà (idempotence).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const lowerEmail = parsed.data.email.toLowerCase();

  try {
    await prisma.earlyAccessSubscriber.create({
      data: {
        email: lowerEmail,
        source: parsed.data.source ?? 'about-page',
      },
    });
  } catch (e: unknown) {
    // Conflit unique → idempotent côté UX
    if (typeof e === 'object' && e && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return NextResponse.json({ ok: true, alreadyRegistered: true });
    }
    console.error('[early-access] failed', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
