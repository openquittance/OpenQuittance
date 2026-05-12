import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import type { Parametres } from '@prisma/client';
import { decrypt, encrypt } from '@/lib/crypto';
import { buildMimeMessage, toGmailRaw } from './mime';
import { getGoogleCredentials } from '@/lib/integrations/google';

/**
 * v3.2.0-rc2 — async + lit credentials via getGoogleCredentials()
 * (priorité DB AppConfig, fallback `.env` legacy). Cache 60s + invalidation
 * post-save UI. Throw si rien configuré.
 */
export async function buildOAuthClient(redirectUri?: string) {
  const creds = await getGoogleCredentials();
  if (!creds) {
    throw new Error(
      'Credentials Google manquants pour Gmail API. Configurez les '
      + 'dans Paramètres > Intégrations.',
    );
  }
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, redirectUri);
}

export async function getValidGmailClient(parametres: Parametres) {
  if (!parametres.gmailRefreshToken) {
    throw new Error('Aucun compte Gmail connecté.');
  }
  // Les tokens sont chiffrés en base (AES-256-GCM). decrypt() retourne la valeur
  // telle quelle si elle n'a pas le préfixe enc:v1: (compat données legacy v1).
  const refreshToken = decrypt(parametres.gmailRefreshToken);
  const accessToken = parametres.gmailAccessToken
    ? decrypt(parametres.gmailAccessToken)
    : undefined;

  const oauth2 = await buildOAuthClient();
  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: parametres.gmailTokenExpiry?.getTime(),
  });

  const needsRefresh = !parametres.gmailTokenExpiry
    || parametres.gmailTokenExpiry.getTime() < Date.now() + 60_000;

  if (needsRefresh) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    await prisma.parametres.update({
      where: { userId: parametres.userId },
      data: {
        gmailAccessToken: credentials.access_token
          ? encrypt(credentials.access_token)
          : parametres.gmailAccessToken,
        gmailTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        gmailRefreshToken: credentials.refresh_token
          ? encrypt(credentials.refresh_token)
          : parametres.gmailRefreshToken,
      },
    });
  }

  return google.gmail({ version: 'v1', auth: oauth2 });
}

export interface SendArgs {
  parametres: Parametres;
  fromName?: string | null;
  fromEmail: string;
  to: string;
  cc?: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  // Phase 1 doc sharing : email léger sans PDF (portail actif). Quand
  // pdfBuffer/pdfFilename absents, l'email est envoyé sans pièce jointe.
  pdfBuffer?: Buffer;
  pdfFilename?: string;
}

export async function sendViaGmailAPI(args: SendArgs) {
  const gmail = await getValidGmailClient(args.parametres);

  const mime = buildMimeMessage({
    fromName: args.fromName,
    fromEmail: args.fromEmail,
    to: args.to,
    cc: args.cc,
    subject: args.subject,
    textBody: args.textBody,
    htmlBody: args.htmlBody,
    attachment: args.pdfBuffer && args.pdfFilename ? {
      filename: args.pdfFilename,
      data: args.pdfBuffer,
      mimeType: 'application/pdf',
    } : undefined,
  });

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: toGmailRaw(mime) },
    });
  } catch (e: unknown) {
    const err = e as { response?: { data?: { error?: { errors?: { reason?: string }[]; message?: string } } }; message?: string };
    const googleErr = err.response?.data?.error;
    const reason = googleErr?.errors?.[0]?.reason;
    const message = googleErr?.message || err.message || 'Erreur Gmail inconnue';

    if (reason === 'accessNotConfigured' || message.toLowerCase().includes('has not been used')) {
      throw new Error('Gmail API non activée dans Google Cloud (Activer: https://console.cloud.google.com/apis/library/gmail.googleapis.com)');
    }
    if (reason === 'insufficientPermissions' || message.toLowerCase().includes('insufficient')) {
      throw new Error('Permission Gmail insuffisante. Le scope gmail.send n\'est pas accordé. Reconnectez Gmail dans Paramètres > Email après avoir vérifié les scopes du consent screen Google Cloud.');
    }
    throw new Error(`Gmail: ${message}`);
  }
}
