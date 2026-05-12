import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireUserId, isError } from '@/lib/auth-helpers';
import { requireRole } from '@/lib/access-control';
import { createInvitation, sendInvitationEmail } from '@/lib/invitations';

export const dynamic = 'force-dynamic';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
});

export async function GET() {
  const userId = await requireUserId();
  if (isError(userId)) return userId;
  if (!await requireRole(userId, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  const invitations = await prisma.invitation.findMany({
    where: { acceptedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(invitations);
}

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (isError(userId)) return userId;
  if (!await requireRole(userId, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    const invitation = await createInvitation({
      invitedById: userId,
      email: parsed.data.email,
      role: parsed.data.role,
    });
    const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;
    await sendInvitationEmail({ invitationId: invitation.id, baseUrl });
    return NextResponse.json({ ok: true, invitationId: invitation.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
