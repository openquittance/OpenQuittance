import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { deserializeBackupCodes } from '@/lib/totp';

export const dynamic = 'force-dynamic';

/** Renvoie l'état du 2FA pour l'utilisateur courant. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { totpEnabled: true, backupCodes: true },
  });
  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });

  const codes = deserializeBackupCodes(user.backupCodes);
  return NextResponse.json({
    enabled: user.totpEnabled,
    backupCodesRemaining: codes.filter(c => !c.used).length,
  });
}
