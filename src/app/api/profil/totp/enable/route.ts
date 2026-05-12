import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  decryptTotpSecret,
  verifyTotpToken,
  generateBackupCodes,
  serializeBackupCodes,
} from '@/lib/totp';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const enableSchema = z.object({
  token: z.string().min(6).max(8),
});

/**
 * Finalise l'activation du 2FA : vérifie un code TOTP, marque totpEnabled=true
 * et génère 8 codes de secours. Les codes en clair ne sont retournés QU'UNE FOIS
 * dans cette réponse — l'utilisateur doit les sauvegarder immédiatement.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = enableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Code invalide' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, totpSecret: true, totpEnabled: true },
  });
  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
  if (user.totpEnabled) {
    return NextResponse.json({ error: 'Déjà activé' }, { status: 409 });
  }
  if (!user.totpSecret) {
    return NextResponse.json({ error: 'Aucun secret en cours. Relancez le setup.' }, { status: 400 });
  }

  const secret = decryptTotpSecret(user.totpSecret);
  if (!verifyTotpToken(parsed.data.token, secret)) {
    return NextResponse.json({ error: 'Code incorrect, vérifiez votre app TOTP' }, { status: 400 });
  }

  const { plain, hashed } = await generateBackupCodes();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabled: true,
      backupCodes: serializeBackupCodes(hashed),
    },
  });

  await logAudit({
    actorId: user.id,
    action: 'user.totp_enabled',
    targetType: 'User',
    targetId: user.id,
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ ok: true, backupCodes: plain });
}
