import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  decryptTotpSecret,
  verifyTotpToken,
  deserializeBackupCodes,
  consumeBackupCode,
  serializeBackupCodes,
} from '@/lib/totp';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  totpToken: z.string().optional(),
  backupCode: z.string().optional(),
}).refine(d => !!(d.totpToken || d.backupCode), { message: 'Code TOTP ou de secours requis' });

/**
 * Valide le second facteur après un login OAuth (Google) quand le user a
 * 2FA activé. À succès, mfaVerifiedAt est settré → au prochain refresh JWT
 * le middleware libère l'utilisateur.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, totpEnabled: true, totpSecret: true, backupCodes: true, mfaSessionId: true },
  });
  if (!user || !user.totpEnabled || !user.totpSecret || !user.mfaSessionId) {
    return NextResponse.json({ error: 'Pas de validation 2FA en cours' }, { status: 409 });
  }

  let ok = false;
  let viaBackup = false;
  if (parsed.data.totpToken) {
    ok = verifyTotpToken(parsed.data.totpToken, decryptTotpSecret(user.totpSecret));
  }
  if (!ok && parsed.data.backupCode) {
    const codes = deserializeBackupCodes(user.backupCodes);
    const updated = await consumeBackupCode(parsed.data.backupCode, codes);
    if (updated) {
      ok = true;
      viaBackup = true;
      await prisma.user.update({
        where: { id: user.id },
        data: { backupCodes: serializeBackupCodes(updated) },
      });
    }
  }

  if (!ok) {
    return NextResponse.json({ error: 'Code invalide' }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaVerifiedAt: new Date() },
  });

  await logAudit({
    actorId: user.id,
    action: 'user.login',
    targetType: 'User',
    targetId: user.id,
    metadata: { provider: 'google', mfaStep: '2fa-verify', viaBackup },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ ok: true });
}
