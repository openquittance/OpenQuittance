import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId, isError } from '@/lib/auth-helpers';
import { parametresSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await requireUserId();
  if (isError(userId)) return userId;

  let parametres = await prisma.parametres.findUnique({ where: { userId } });
  if (!parametres) {
    parametres = await prisma.parametres.create({ data: { userId } });
  }

  // Don't return sensitive tokens
  const { gmailAccessToken, gmailRefreshToken, smtpPass, ...safe } = parametres;
  return NextResponse.json({
    ...safe,
    smtpPassConfigured: !!smtpPass,
    gmailConnected: !!gmailRefreshToken,
  });
}

export async function PUT(req: NextRequest) {
  const userId = await requireUserId();
  if (isError(userId)) return userId;

  const body = await req.json();
  const parsed = parametresSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  // Empty smtpPass means "leave unchanged" so we strip it
  const data = { ...parsed.data };
  if (!data.smtpPass) delete data.smtpPass;

  const updated = await prisma.parametres.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  const { gmailAccessToken, gmailRefreshToken, smtpPass, ...safe } = updated;
  return NextResponse.json({
    ...safe,
    smtpPassConfigured: !!smtpPass,
    gmailConnected: !!gmailRefreshToken,
  });
}
