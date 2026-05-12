import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId, isError } from '@/lib/auth-helpers';
import { requireRole } from '@/lib/access-control';
import { sendInvitationEmail } from '@/lib/invitations';

export const dynamic = 'force-dynamic';

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (isError(userId)) return userId;
  if (!await requireRole(userId, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  const r = await prisma.invitation.deleteMany({
    where: { id: params.id, acceptedAt: null },
  });
  if (r.count === 0) return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();
  if (isError(userId)) return userId;
  if (!await requireRole(userId, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  try {
    const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;
    await sendInvitationEmail({ invitationId: params.id, baseUrl });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
