import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUserId, isError } from '@/lib/auth-helpers';
import { getValidGmailClient } from '@/lib/email/gmail-sender';

export const dynamic = 'force-dynamic';

interface GoogleErrorPayload {
  errors?: { message?: string; domain?: string; reason?: string }[];
  code?: number;
  message?: string;
}

export async function POST() {
  const userId = await requireUserId();
  if (isError(userId)) return userId;

  const parametres = await prisma.parametres.findUnique({ where: { userId } });
  if (!parametres) {
    return NextResponse.json({ error: 'Paramètres introuvables' }, { status: 404 });
  }
  if (!parametres.gmailRefreshToken) {
    return NextResponse.json({ error: 'Aucun compte Gmail connecté' }, { status: 400 });
  }

  try {
    const gmail = await getValidGmailClient(parametres);
    const profile = await gmail.users.getProfile({ userId: 'me' });

    return NextResponse.json({
      ok: true,
      email: profile.data.emailAddress,
      scope: parametres.gmailScope,
      hasGmailSend: (parametres.gmailScope ?? '').includes('gmail.send'),
    });
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: GoogleErrorPayload } }; message?: string; code?: string | number };
    const googleErr = err.response?.data?.error;
    const reason = googleErr?.errors?.[0]?.reason;
    const message = googleErr?.message || err.message || 'Erreur inconnue';

    let hint = '';
    if (reason === 'accessNotConfigured' || message.toLowerCase().includes('has not been used')) {
      hint = 'Activez Gmail API dans Google Cloud Console: https://console.cloud.google.com/apis/library/gmail.googleapis.com';
    } else if (reason === 'insufficientPermissions' || message.toLowerCase().includes('insufficient')) {
      hint = 'Le scope gmail.send n\'est pas accordé. Vérifiez l\'OAuth consent screen dans Google Cloud, puis cliquez "Déconnecter" et reconnectez Gmail.';
    } else if (message.toLowerCase().includes('invalid_grant')) {
      hint = 'Token expiré ou révoqué. Reconnectez votre compte Gmail.';
    }

    return NextResponse.json({
      ok: false,
      error: message,
      reason,
      scope: parametres.gmailScope,
      hint,
    }, { status: 200 }); // 200 so the client can read the body
  }
}
