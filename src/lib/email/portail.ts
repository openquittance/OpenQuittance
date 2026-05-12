import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { prisma } from '@/lib/prisma';
import { buildOAuthClient } from './gmail-sender';
import { buildMimeMessage, toGmailRaw } from './mime';
import type { Bailleur, Locataire, Parametres } from '@prisma/client';

// Email d'invitation au portail locataire (cf. docs/PORTAIL-LOCATAIRE.md §6).
// Pas de PDF en pièce jointe — juste un lien magic.
// Expéditeur : le compte Gmail/SMTP du staff qui a cliqué "Inviter au portail".

export interface SendInviteArgs {
  /** L'email d'envoi configuré pour le staff qui invite */
  parametres: Parametres;
  /** Bailleur dont le locataire dépend (pour la signature) */
  bailleur: Bailleur;
  /** Locataire à inviter (pour le prénom + adresse du bien) */
  locataire: Locataire & { bien: { adresse: string; codePostal: string; ville: string } };
  /** Token clair (sera mis dans l'URL du lien) */
  magicToken: string;
  /** Base URL publique de l'app (NEXTAUTH_URL) */
  publicBaseUrl: string;
}

export async function sendPortailInviteEmail(args: SendInviteArgs): Promise<void> {
  const { parametres, bailleur, locataire, magicToken, publicBaseUrl } = args;

  // Phase 3 D.1 : URL pointe vers la PAGE Server Component qui peek le
  // token + rend une UI dédiée par état (valid → signIn client-side,
  // consumed/expired/invalid → message + bouton "demander un nouveau
  // lien"). Pré-Phase 3, on pointait vers la route API qui faisait
  // tout en une passe — pas d'UX d'erreur dédiée.
  const verifyUrl = `${publicBaseUrl.replace(/\/$/, '')}/portail/login/verify?token=${magicToken}`;
  const subject = `Vos quittances de loyer sont disponibles en ligne — ${bailleur.nom}`;

  // Salutation : prénom si présent, sinon fallback "Bonjour,"
  const greeting = locataire.prenom?.trim()
    ? `Bonjour ${locataire.prenom},`
    : 'Bonjour,';
  const adresseBien = `${locataire.bien.adresse}, ${locataire.bien.codePostal} ${locataire.bien.ville}`;
  const phoneLine = bailleur.telephone?.trim() ? bailleur.telephone : null;

  const textBody = buildTextBody({ greeting, bailleur, adresseBien, verifyUrl, phoneLine });
  const htmlBody = buildHtmlBody({ greeting, bailleur, adresseBien, verifyUrl, phoneLine });

  if (parametres.emailMethod === 'gmail_api' && parametres.gmailRefreshToken) {
    if (!parametres.gmailEmail) throw new Error('Email Gmail expéditeur manquant.');
    await sendViaGmailAPI({ parametres, fromName: bailleur.nom, fromEmail: parametres.gmailEmail,
      to: locataire.email!, subject, textBody, htmlBody });
    return;
  }
  if (parametres.emailMethod === 'smtp' && parametres.smtpUser) {
    await sendViaSMTP({ parametres, fromName: bailleur.nom, fromEmail: parametres.smtpUser,
      to: locataire.email!, subject, textBody, htmlBody });
    return;
  }
  throw new Error('Aucune méthode d\'envoi email configurée. Allez dans Paramètres > Email.');
}

// ─── Templates ───────────────────────────────────────────────────────────────

function buildTextBody(args: {
  greeting: string;
  bailleur: { nom: string };
  adresseBien: string;
  verifyUrl: string;
  phoneLine: string | null;
}): string {
  const { greeting, bailleur, adresseBien, verifyUrl, phoneLine } = args;
  return [
    greeting,
    '',
    `${bailleur.nom} a mis en place un espace en ligne sur lequel vous`,
    'retrouverez toutes vos quittances de loyer.',
    '',
    `Cet espace concerne votre logement situé au ${adresseBien}.`,
    '',
    'Pour y accéder, cliquez sur le lien ci-dessous (valide 15 minutes) :',
    '',
    verifyUrl,
    '',
    'Une fois connecté, votre accès reste valide pendant 30 jours.',
    'Passé ce délai, vous pourrez demander un nouveau lien depuis la page de connexion.',
    '',
    'Si vous n\'avez pas demandé cet accès, ignorez ce message.',
    'Pour ne plus recevoir ces emails, contactez directement votre',
    'bailleur qui pourra désactiver l\'accès.',
    '',
    'Cordialement,',
    bailleur.nom,
    ...(phoneLine ? [`Téléphone : ${phoneLine}`] : []),
    '',
    '---',
    'Propulsé par OpenQuittance (open source)',
  ].join('\n');
}

function buildHtmlBody(args: {
  greeting: string;
  bailleur: { nom: string };
  adresseBien: string;
  verifyUrl: string;
  phoneLine: string | null;
}): string {
  const { greeting, bailleur, adresseBien, verifyUrl, phoneLine } = args;
  // Style inline (compatibilité maximale avec les clients email).
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;">
  <p style="font-size:16px;margin:0 0 16px;"><strong>${escapeHtml(greeting)}</strong></p>
  <p style="margin:0 0 16px;">
    ${escapeHtml(bailleur.nom)} a mis en place un espace en ligne sur lequel
    vous retrouverez toutes vos quittances de loyer.
  </p>
  <p style="margin:0 0 16px;">
    Vous pouvez les consulter et les télécharger à tout moment, sans avoir
    besoin de demander.
  </p>
  <p style="margin:0 0 24px;color:#555;font-size:14px;">
    Cet espace concerne votre logement situé au <strong>${escapeHtml(adresseBien)}</strong>.
  </p>
  <p style="text-align:center;margin:24px 0;">
    <a href="${escapeAttr(verifyUrl)}"
       style="display:inline-block;background:#2b2540;color:#ffffff;text-decoration:none;
              padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">
      Accéder à mon espace →
    </a>
  </p>
  <p style="font-size:13px;color:#666;margin:0 0 16px;font-style:italic;">
    Le lien ci-dessus est valable 15 minutes. Une fois connecté, votre accès
    reste valide pendant 30 jours sans avoir à se reconnecter. Passé ce délai,
    vous pourrez demander un nouveau lien depuis la page de connexion.
  </p>
  <p style="font-size:13px;color:#666;margin:0 0 24px;">
    Si vous n'avez pas demandé cet accès, vous pouvez ignorer ce message
    en toute sécurité. Pour ne plus recevoir ces emails, contactez
    directement votre bailleur qui pourra désactiver l'accès.
  </p>
  <hr style="border:none;border-top:1px solid #e6e0e2;margin:24px 0;">
  <p style="margin:0;color:#333;">
    Cordialement,<br>
    <strong>${escapeHtml(bailleur.nom)}</strong>
    ${phoneLine ? `<br><span style="color:#666;font-size:14px;">Téléphone : ${escapeHtml(phoneLine)}</span>` : ''}
  </p>
  <p style="font-size:11px;color:#999;margin:32px 0 0;">
    Propulsé par <a href="https://github.com/grx14/quittances-app"
       style="color:#999;">OpenQuittance</a>, application open source de gestion locative.
  </p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' :
    '&#39;'
  ));
}
function escapeAttr(s: string): string { return escapeHtml(s); }

// ─── Senders légers (sans PJ, contrairement à gmail-sender pour quittances) ─

interface SimpleSendArgs {
  parametres: Parametres;
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}

async function sendViaGmailAPI(args: SimpleSendArgs) {
  if (!args.parametres.gmailRefreshToken) throw new Error('Aucun compte Gmail connecté.');
  const refreshToken = isEncrypted(args.parametres.gmailRefreshToken)
    ? decrypt(args.parametres.gmailRefreshToken)
    : args.parametres.gmailRefreshToken;
  const accessToken = args.parametres.gmailAccessToken
    ? (isEncrypted(args.parametres.gmailAccessToken) ? decrypt(args.parametres.gmailAccessToken) : args.parametres.gmailAccessToken)
    : undefined;
  const oauth2 = await buildOAuthClient();
  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: args.parametres.gmailTokenExpiry?.getTime(),
  });
  const needsRefresh = !args.parametres.gmailTokenExpiry
    || args.parametres.gmailTokenExpiry.getTime() < Date.now() + 60_000;
  if (needsRefresh) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    // refresh des tokens en base (chiffrés)
    const { encrypt } = await import('@/lib/crypto');
    await prisma.parametres.update({
      where: { userId: args.parametres.userId },
      data: {
        gmailAccessToken: credentials.access_token ? encrypt(credentials.access_token) : args.parametres.gmailAccessToken,
        gmailTokenExpiry: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
        gmailRefreshToken: credentials.refresh_token ? encrypt(credentials.refresh_token) : args.parametres.gmailRefreshToken,
      },
    });
  }
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });
  const mime = buildMimeMessage({
    fromName: args.fromName, fromEmail: args.fromEmail, to: args.to,
    subject: args.subject, textBody: args.textBody, htmlBody: args.htmlBody,
  });
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: toGmailRaw(mime) } });
}

async function sendViaSMTP(args: SimpleSendArgs) {
  const { parametres } = args;
  if (!parametres.smtpUser || !parametres.smtpPass) {
    throw new Error('SMTP non configuré.');
  }
  const transport = nodemailer.createTransport({
    host: parametres.smtpHost ?? 'smtp.gmail.com',
    port: parametres.smtpPort ?? 587,
    secure: (parametres.smtpPort ?? 587) === 465,
    auth: { user: parametres.smtpUser, pass: parametres.smtpPass },
  });
  await transport.sendMail({
    from: `"${args.fromName}" <${args.fromEmail}>`,
    to: args.to,
    subject: args.subject,
    text: args.textBody,
    html: args.htmlBody,
  });
}
