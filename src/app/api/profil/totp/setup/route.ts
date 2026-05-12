import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  generateTotpSecret,
  generateQrDataUrl,
  encryptTotpSecret,
} from '@/lib/totp';

export const dynamic = 'force-dynamic';

/**
 * Démarre l'enrôlement 2FA : génère un nouveau secret, le stocke chiffré (pas
 * encore "enabled"), et retourne le QR code à scanner. L'activation effective
 * passe par /enable après vérification d'un code valide.
 *
 * Re-appel = nouveau secret (utile si l'utilisateur perd son QR avant validation).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, totpEnabled: true },
  });
  if (!user) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
  if (user.totpEnabled) {
    return NextResponse.json({ error: 'Le 2FA est déjà actif. Désactivez-le pour le réinitialiser.' }, { status: 409 });
  }

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: encryptTotpSecret(secret) },
  });

  const qr = await generateQrDataUrl(secret, user.email);
  return NextResponse.json({ secret, qr });
}
