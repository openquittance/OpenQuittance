import { prisma } from '@/lib/prisma';
import type { Bailleur, Bien, Locataire, Quittance } from '@prisma/client';
import { generateQuittancePdf } from '@/lib/pdf-generator';
import { sendViaGmailAPI, getValidGmailClient } from './gmail-sender';
import { sendViaSMTP, sendSmtpTest } from './smtp-sender';
import { buildMimeMessage, toGmailRaw } from './mime';
import { moisLabel, formatMontant } from '@/lib/utils';

function fillTemplate(tpl: string, ctx: { quittance: Quittance; locataire: Locataire; bailleur: Bailleur }): string {
  return tpl
    .replace(/\{nom\}/g, ctx.locataire.nom)
    .replace(/\{prenom\}/g, ctx.locataire.prenom)
    .replace(/\{mois\}/g, moisLabel(ctx.quittance.mois))
    .replace(/\{annee\}/g, String(ctx.quittance.annee))
    .replace(/\{montant\}/g, formatMontant(ctx.quittance.montantTotal))
    .replace(/\{bailleur\}/g, ctx.bailleur.nom);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

/**
 * Header bandeau partagé entre email léger (Phase 1) et classique (Phase 5).
 * v2.4.1 polish : bordure haute couleur charte (`bailleur.pdfCouleur`) +
 * nom bailleur en gros dans la même couleur. Donne une identité visuelle
 * cohérente aux 2 templates sans modifier le body custom user.
 */
function buildEmailHeader(bailleur: { nom: string; pdfCouleur: string | null }): string {
  const color = bailleur.pdfCouleur || '#1a3a5c';
  return `<div style="border-top:4px solid ${escapeHtml(color)};padding-top:20px;margin-bottom:24px;">
    <div style="font-size:18px;font-weight:600;color:${escapeHtml(color)};letter-spacing:0.2px;">${escapeHtml(bailleur.nom)}</div>
  </div>`;
}

function bailleurSlugForEmail(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sans-nom';
}

/**
 * Footer "Propulsé par OpenQuittance" + liens pages légales (v2.8.0 Vague 2 / v3.0 rebrand).
 * Liens absolus vers /mentions-legales/{slug} et /politique-confidentialite/{slug}
 * via NEXTAUTH_URL — utiles dans les clients email sans context relatif.
 */
function buildEmailFooter(bailleur: { nom: string }): string {
  const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '');
  const slug = bailleurSlugForEmail(bailleur.nom);
  const legalLinks = baseUrl
    ? `<p style="font-size:11px;color:#999;margin:8px 0 0;">
        <a href="${baseUrl}/mentions-legales/${slug}" style="color:#999;">Mentions légales</a>
        ·
        <a href="${baseUrl}/politique-confidentialite/${slug}" style="color:#999;">Politique de confidentialité</a>
      </p>`
    : '';
  return `<hr style="border:none;border-top:1px solid #e6e0e2;margin:24px 0;">
  <p style="font-size:11px;color:#999;margin:0;">
    Propulsé par <a href="https://github.com/grx14/quittances-app" style="color:#999;">OpenQuittance</a>, application open source de gestion locative.
  </p>${legalLinks}`;
}

/**
 * Construit le HTML body de l'email classique (avec PDF en PJ). Phase 5
 * — harmonisé avec le template email léger : même shell (max-width 560px,
 * police system-ui, padding 24px), header bandeau couleur charte (v2.4.1),
 * body custom user, hr, footer "Propulsé par OpenQuittance".
 *
 * Différence avec léger : pas de CTA bouton (le PDF est en PJ — le
 * locataire ouvre directement la PJ), et signatureHtml du user
 * (parametres.emailSignatureHtml) injecté avant la signature bailleur
 * si fourni.
 */
function buildHtmlBody(args: {
  textBody: string;
  bailleur: { nom: string; pdfCouleur: string | null };
  signatureHtml: string | null | undefined;
  hasPdfAttached: boolean;
}): string {
  const { textBody, bailleur, signatureHtml, hasPdfAttached } = args;
  // textBody peut contenir un greeting "Bonjour Prenom," et "Cordialement,
  // bailleur" issu du template parametres. On rend tout en HTML simple
  // pour garder fidélité au texte custom du user, puis on enveloppe dans
  // le shell harmonisé.
  const bodyHtml = textToHtml(textBody);
  const sigBlock = signatureHtml ? `<div style="margin:16px 0 0;">${signatureHtml}</div>` : '';
  const pdfHint = hasPdfAttached
    ? `<p style="font-size:12px;color:#666;margin:0 0 16px;font-style:italic;">📎 Quittance PDF jointe à cet email.</p>`
    : '';
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;">
  ${buildEmailHeader(bailleur)}
  ${pdfHint}
  <div style="font-size:14px;">${bodyHtml}</div>
  ${sigBlock}
  ${buildEmailFooter(bailleur)}
</body></html>`;
}

/**
 * Construit le contenu de l'email quittance (sujet + bodies + PDF si
 * applicable). Pure fonction, exportée pour tests E2E.
 *
 * Phase 1 doc sharing : si portailActif + partageQuittances → léger
 * (pas de PDF). Sinon classique (PDF en PJ).
 */
export interface EmailContent {
  subject: string;
  textBody: string;
  htmlBody: string | undefined;
  pdfBuffer: Buffer | undefined;
  pdfFilename: string | undefined;
  portailMode: boolean;
}

export async function buildQuittanceEmail(args: {
  quittance: Quittance & { locataire: Locataire & { bien: Bien & { bailleur: Bailleur } } };
  parametres: { emailObjetTemplate: string; emailCorpsTemplate: string; emailSignatureHtml: string | null };
}): Promise<EmailContent> {
  const { quittance, parametres } = args;
  const bailleur = quittance.locataire.bien.bailleur;
  const portailMode = quittance.locataire.portailActif && quittance.locataire.partageQuittances;

  if (portailMode) {
    const moisLib = moisLabel(quittance.mois);
    const portailUrl = `${(process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')}/portail`;
    const subject = `Votre quittance de ${moisLib} ${quittance.annee} est disponible — ${bailleur.nom}`;
    const textBody = `Bonjour ${quittance.locataire.prenom},\n\n`
      + `Votre quittance de ${moisLib} ${quittance.annee} (${formatMontant(quittance.montantTotal)}) `
      + `est disponible sur votre espace en ligne.\n\n`
      + `Accéder à mes documents : ${portailUrl}\n\n`
      + `Cordialement,\n${bailleur.nom}`;
    const htmlBody = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;">
  ${buildEmailHeader(bailleur)}
  <p style="font-size:16px;margin:0 0 16px;"><strong>Bonjour ${escapeHtml(quittance.locataire.prenom)},</strong></p>
  <p style="margin:0 0 24px;">
    Votre quittance de <strong>${escapeHtml(moisLib)} ${quittance.annee}</strong>
    (${escapeHtml(formatMontant(quittance.montantTotal))}) est disponible sur votre espace en ligne.
  </p>
  <p style="text-align:center;margin:24px 0;">
    <a href="${escapeHtml(portailUrl)}"
       style="display:inline-block;background:${escapeHtml(bailleur.pdfCouleur || '#1a3a5c')};color:#ffffff;text-decoration:none;
              padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">
      Accéder à mes documents →
    </a>
  </p>
  <p style="margin:24px 0 0;color:#333;">
    Cordialement,<br>
    <strong>${escapeHtml(bailleur.nom)}</strong>
  </p>
  ${buildEmailFooter(bailleur)}
</body></html>`;
    return { subject, textBody, htmlBody, pdfBuffer: undefined, pdfFilename: undefined, portailMode: true };
  }

  // Email classique avec PDF
  const olderCount = await prisma.quittance.count({
    where: {
      mois: quittance.mois,
      annee: quittance.annee,
      createdAt: { lte: quittance.createdAt },
    },
  });
  const numero = `${quittance.annee}-${String(quittance.mois).padStart(2, '0')}-${String(olderCount).padStart(3, '0')}`;
  const pdfBuffer = await generateQuittancePdf({
    quittance,
    locataire: quittance.locataire,
    bien: quittance.locataire.bien,
    bailleur,
    numero,
  });
  const pdfFilename = `Quittance_${moisLabel(quittance.mois)}_${quittance.annee}_${quittance.locataire.nom}.pdf`
    .replace(/\s+/g, '_');
  const subject = fillTemplate(parametres.emailObjetTemplate, {
    quittance, locataire: quittance.locataire, bailleur,
  });
  let textBody = fillTemplate(parametres.emailCorpsTemplate, {
    quittance, locataire: quittance.locataire, bailleur,
  });
  if (quittance.commentaire) {
    textBody = `${textBody}\n\n---\n${quittance.commentaire}`;
  }
  const htmlBody = buildHtmlBody({
    textBody,
    bailleur,
    signatureHtml: parametres.emailSignatureHtml,
    hasPdfAttached: true,
  });
  return { subject, textBody, htmlBody, pdfBuffer, pdfFilename, portailMode: false };
}

export async function envoyerQuittance(args: {
  userId: string;
  quittanceId: string;
  to?: string;
}) {
  const { requireRole } = await import('@/lib/access-control');
  if (!await requireRole(args.userId, 'MEMBER')) {
    throw new Error('Non autorisé');
  }
  const quittance = await prisma.quittance.findUnique({
    where: { id: args.quittanceId },
    include: {
      locataire: { include: { bien: { include: { bailleur: true } } } },
    },
  });
  if (!quittance) throw new Error('Quittance introuvable');
  const parametres = await prisma.parametres.findUnique({ where: { userId: args.userId } });
  if (!parametres) throw new Error('Paramètres introuvables');

  const to = args.to || quittance.locataire.email || '';
  if (!to) throw new Error('Email destinataire manquant');

  const bailleur = quittance.locataire.bien.bailleur;

  // Phase 1 doc sharing : pure fonction qui décide léger vs classique
  // selon les toggles portailActif + partageQuittances.
  const { subject, textBody, htmlBody, pdfBuffer, pdfFilename } = await buildQuittanceEmail({
    quittance,
    parametres,
  });

  if (parametres.emailMethod === 'gmail_api' && parametres.gmailRefreshToken) {
    const fromEmail = parametres.gmailEmail || '';
    if (!fromEmail) throw new Error('Email Gmail expéditeur manquant.');
    await sendViaGmailAPI({
      parametres,
      fromName: bailleur.nom,
      fromEmail,
      to,
      cc: fromEmail, // l'expéditeur en copie
      subject,
      textBody,
      htmlBody,
      pdfBuffer,
      pdfFilename,
    });
  } else if (parametres.emailMethod === 'smtp' && parametres.smtpUser) {
    await sendViaSMTP({
      parametres,
      fromName: bailleur.nom,
      fromEmail: parametres.smtpUser,
      to,
      cc: parametres.smtpUser,
      subject,
      textBody,
      htmlBody,
      pdfBuffer,
      pdfFilename,
    });
  } else {
    throw new Error('Aucune méthode d\'envoi email configurée. Allez dans Paramètres > Email.');
  }

  await prisma.quittance.update({
    where: { id: quittance.id },
    data: { emailEnvoye: true, dateEmail: new Date(), pdfGenere: true },
  });
}

export async function envoyerTestEmail(args: { userId: string; to: string }) {
  const parametres = await prisma.parametres.findUnique({ where: { userId: args.userId } });
  if (!parametres) throw new Error('Paramètres introuvables');

  const subject = 'Test email - Quittances';
  const textBody = 'Ce message confirme que votre configuration email fonctionne.';

  if (parametres.emailMethod === 'gmail_api' && parametres.gmailRefreshToken) {
    const gmail = await getValidGmailClient(parametres);
    const fromEmail = parametres.gmailEmail || '';
    const mime = buildMimeMessage({
      fromName: 'Quittances',
      fromEmail,
      to: args.to,
      subject,
      textBody,
    });
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: toGmailRaw(mime) } });
  } else if (parametres.emailMethod === 'smtp' && parametres.smtpUser) {
    await sendSmtpTest(parametres, args.to);
  } else {
    throw new Error('Aucune méthode d\'envoi email configurée');
  }
}
