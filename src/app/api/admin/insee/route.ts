import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/access-control';
import { encryptOptional } from '@/lib/crypto';
import { ipFromRequest, logAudit } from '@/lib/audit';
import { ensureAppConfig } from '@/lib/app-config';

export const dynamic = 'force-dynamic';

/** GET : retourne l'état de configuration (jamais le secret en clair). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (!await requireRole(session.user.id, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  const cfg = await ensureAppConfig();
  // L'INSEE actuel utilise une simple API key, stockée chiffrée dans
  // inseeApiSecret. inseeApiKey est conservé en DB pour rétro-compat (legacy
  // OAuth) mais inutile en pratique.
  return NextResponse.json({
    configured: !!cfg.inseeApiSecret,
    hasSecret: !!cfg.inseeApiSecret,
    inseeLastSyncAt: cfg.inseeLastSyncAt,
  });
}

const upsertSchema = z.object({
  inseeApiKey: z.string().min(1, 'Consumer key requise'),
  inseeApiSecret: z.string().min(1, 'Consumer secret requis').optional(),
});

/**
 * PUT : met à jour la configuration. Si `inseeApiSecret` est omis, on garde
 * celui déjà enregistré (utile pour modifier juste la clé). Le secret est
 * chiffré via lib/crypto avant stockage.
 */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (!await requireRole(session.user.id, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { inseeApiKey, inseeApiSecret } = parsed.data;

  const data: { inseeApiKey: string; inseeApiSecret?: string } = { inseeApiKey };
  if (inseeApiSecret) {
    data.inseeApiSecret = encryptOptional(inseeApiSecret) ?? undefined;
  }

  await ensureAppConfig();
  await prisma.appConfig.update({ where: { id: 'singleton' }, data });

  await logAudit({
    actorId: session.user.id,
    action: 'config.update',
    targetType: 'AppConfig',
    targetId: 'singleton',
    metadata: { sub: 'insee', secretChanged: !!inseeApiSecret },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ ok: true });
}

/** DELETE : supprime la configuration INSEE (clé + secret). */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (!await requireRole(session.user.id, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  await ensureAppConfig();
  await prisma.appConfig.update({
    where: { id: 'singleton' },
    data: { inseeApiKey: null, inseeApiSecret: null, inseeLastSyncAt: null },
  });
  await logAudit({
    actorId: session.user.id,
    action: 'config.update',
    targetType: 'AppConfig',
    targetId: 'singleton',
    metadata: { sub: 'insee', cleared: true },
    ip: ipFromRequest(req),
  });
  return NextResponse.json({ ok: true });
}

