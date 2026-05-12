import crypto from 'node:crypto';
import { prisma } from './prisma';
import { AppRole } from '@prisma/client';
import { buildMimeMessage, toGmailRaw } from './email/mime';
import { getValidGmailClient } from './email/gmail-sender';

const INVITATION_TTL_DAYS = 14;

export function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export async function createInvitation(args: {
  invitedById: string;
  email: string;
  role: AppRole;
  bailleurIds?: string[];
}) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000);
  const bailleurIds = (args.bailleurIds ?? []).filter(Boolean);
  return prisma.invitation.create({
    data: {
      invitedById: args.invitedById,
      email: args.email.toLowerCase().trim(),
      role: args.role,
      token,
      expiresAt,
      bailleurIds,
      // Legacy bailleurId : on remplit avec le 1er pour rétro-compat lecture.
      bailleurId: bailleurIds[0] ?? null,
    },
  });
}

export async function sendInvitationEmail(args: {
  invitationId: string;
  baseUrl: string;
}) {
  const invitation = await prisma.invitation.findUnique({
    where: { id: args.invitationId },
    include: { invitedBy: { include: { parametres: true } } },
  });
  if (!invitation) throw new Error('Invitation introuvable');
  const params = invitation.invitedBy.parametres;
  if (!params) throw new Error("Email de l'invitant non configuré.");

  const cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
  const appName = cfg?.appName ?? 'OpenQuittance';

  const link = `${args.baseUrl}/invitations/${invitation.token}`;
  const inviterName = invitation.invitedBy.name || invitation.invitedBy.email;
  const subject = `Invitation à rejoindre ${appName}`;

  const textBody = `Bonjour,

${inviterName} vous invite à rejoindre ${appName}.

Cliquez sur ce lien pour accepter l'invitation et créer votre compte :
${link}

Le lien est valide ${INVITATION_TTL_DAYS} jours.

Si vous n'attendiez pas cette invitation, ignorez ce message.`;

  const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
  <h2 style="color:#28213a;margin:0 0 16px">Invitation à rejoindre ${escapeHtml(appName)}</h2>
  <p>Bonjour,</p>
  <p><strong>${escapeHtml(inviterName)}</strong> vous invite à rejoindre <strong>${escapeHtml(appName)}</strong>.</p>
  <p style="margin:32px 0;text-align:center">
    <a href="${link}" style="display:inline-block;padding:12px 28px;background:#28213a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">
      Accepter l'invitation
    </a>
  </p>
  <p style="font-size:12px;color:#888">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
    <a href="${link}" style="color:#28213a;word-break:break-all">${escapeHtml(link)}</a>
  </p>
  <p style="font-size:12px;color:#888">Le lien est valide ${INVITATION_TTL_DAYS} jours.</p>
</body></html>`;

  if (params.emailMethod === 'gmail_api' && params.gmailRefreshToken) {
    const gmail = await getValidGmailClient(params);
    const fromEmail = params.gmailEmail || '';
    const mime = buildMimeMessage({
      fromName: appName,
      fromEmail,
      to: invitation.email,
      subject,
      textBody,
      htmlBody,
    });
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: toGmailRaw(mime) } });
  } else if (params.emailMethod === 'smtp' && params.smtpUser) {
    const smtp = await import('nodemailer').then(m => m.default.createTransport({
      host: params.smtpHost!,
      port: params.smtpPort ?? 587,
      secure: (params.smtpPort ?? 587) === 465,
      auth: { user: params.smtpUser!, pass: params.smtpPass! },
    }));
    await smtp.sendMail({
      from: `"${appName}" <${params.smtpUser}>`,
      to: invitation.email,
      subject, text: textBody, html: htmlBody,
    });
  } else {
    throw new Error("Configurez votre email (Paramètres > Email) avant d'envoyer une invitation.");
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Accepte une invitation : met à jour le rôle app-level du user + crée
 * une BailleurMembership pour chaque bailleurIds[] de l'invitation
 * (Phase 2 Lot D — invitation multi-bailleur).
 *
 * Pré-rc7, l'invitation acceptée laissait le user staff app-level mais
 * sans aucune membership → bloqué partout par les filtres rc3/rc4
 * (cf. coverage gap analysis Phase 2). Cette refacto colmate la
 * cascade : tout user accepté reçoit ses memberships en transaction.
 *
 * Idempotent sur memberships : `upsert` (si déjà présente, no-op).
 */
export async function acceptInvitation(token: string, userId: string) {
  const invitation = await prisma.invitation.findUnique({ where: { token } });
  if (!invitation) throw new Error('Invitation introuvable');
  if (invitation.acceptedAt) throw new Error('Invitation déjà acceptée');
  if (invitation.expiresAt < new Date()) throw new Error('Invitation expirée');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Utilisateur introuvable');
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    throw new Error(`Cette invitation est destinée à ${invitation.email}.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { role: invitation.role },
    });
    for (const bailleurId of invitation.bailleurIds) {
      await tx.bailleurMembership.upsert({
        where: { userId_bailleurId: { userId, bailleurId } },
        create: { userId, bailleurId, role: invitation.role },
        update: {},
      });
    }
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });
  });

  return invitation;
}
