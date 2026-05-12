import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserId, isError } from '@/lib/auth-helpers';
import { ensureAppConfig, updateAppConfig } from '@/lib/app-config';
import { requireRole } from '@/lib/access-control';

export const dynamic = 'force-dynamic';

const schema = z.object({
  appName: z.string().min(1).optional(),
  registrationMode: z.enum(['CLOSED', 'INVITATION_ONLY']).optional(),
});

export async function GET() {
  const userId = await requireUserId();
  if (isError(userId)) return userId;
  if (!await requireRole(userId, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  const cfg = await ensureAppConfig();
  return NextResponse.json(cfg);
}

export async function PUT(req: NextRequest) {
  const userId = await requireUserId();
  if (isError(userId)) return userId;
  if (!await requireRole(userId, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const cfg = await updateAppConfig(parsed.data);
  return NextResponse.json(cfg);
}
