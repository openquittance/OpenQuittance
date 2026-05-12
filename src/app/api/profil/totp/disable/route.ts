import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
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

// Pour désactiver, on exige : mot de passe + (code TOTP OU code de secours).
// Cette double-vérification protège contre une session volée + un mot de passe faible.
const disableSchema = z.object({
  password: z.string().min(1),
  totpToken: z.string().optional(),
  backupCode: z.string().optional(),
}).refine(d => !!(d.totpToken || d.backupCode), { message: 'Code TOTP ou code de secours requis' });

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = disableSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true, totpEnabled: true, totpSecret: true, backupCodes: true },
  });
  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
  if (!user.totpEnabled) return NextResponse.json({ error: 'Pas de 2FA actif' }, { status: 409 });

  // Comptes Google sans password local : on saute la vérif password (pas applicable).
  if (user.password) {
    const ok = await bcrypt.compare(parsed.data.password, user.password);
    if (!ok) {
      return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 });
    }
  }

  let secondFactorOk = false;
  let consumedBackup = false;

  if (parsed.data.totpToken && user.totpSecret) {
    const secret = decryptTotpSecret(user.totpSecret);
    secondFactorOk = verifyTotpToken(parsed.data.totpToken, secret);
  }
  if (!secondFactorOk && parsed.data.backupCode) {
    const codes = deserializeBackupCodes(user.backupCodes);
    const updated = await consumeBackupCode(parsed.data.backupCode, codes);
    if (updated) {
      secondFactorOk = true;
      consumedBackup = true;
      // On stocke quand même la consommation pour ne pas réutiliser le code,
      // mais comme on désactive juste après, c'est purement défensif.
      await prisma.user.update({
        where: { id: user.id },
        data: { backupCodes: serializeBackupCodes(updated) },
      });
    }
  }

  if (!secondFactorOk) {
    return NextResponse.json({ error: 'Code TOTP ou code de secours invalide' }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabled: false, totpSecret: null, backupCodes: null },
  });

  await logAudit({
    actorId: user.id,
    action: 'user.totp_disabled',
    targetType: 'User',
    targetId: user.id,
    metadata: { viaBackupCode: consumedBackup },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ ok: true });
}
