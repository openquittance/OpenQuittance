import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { acceptInvitation } from '@/lib/invitations';
import { getAppConfig } from '@/lib/app-config';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const invitation = await prisma.invitation.findUnique({
    where: { token: params.token },
    include: { invitedBy: { select: { name: true, email: true } } },
  });
  if (!invitation) return NextResponse.json({ error: 'Invitation introuvable' }, { status: 404 });

  const cfg = await getAppConfig();
  return NextResponse.json({
    email: invitation.email,
    appName: cfg?.appName ?? 'Quittances',
    inviterName: invitation.invitedBy.name || invitation.invitedBy.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    accepted: !!invitation.acceptedAt,
    expired: invitation.expiresAt < new Date(),
  });
}

export async function POST(_: NextRequest, { params }: { params: { token: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  try {
    await acceptInvitation(params.token, session.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
