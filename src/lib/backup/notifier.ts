import type { BackupRun, AppConfig } from '@prisma/client';
import { prisma } from '../prisma';
import { sendViaSMTP } from '../email/smtp-sender';
import { sendViaGmailAPI } from '../email/gmail-sender';

/**
 * v3.1.0 — notification email à la fin d'un backup.
 *
 * Politique :
 *   - run.status === 'failed' → toujours notifier
 *   - run.status === 'success' && config.backupNotifySuccess → notifier
 *   - sinon → silence
 *
 * Destinataires (priorité) :
 *   1. env `BACKUP_NOTIFY_EMAIL` si définie (override)
 *   2. emails des Users ADMIN actifs en DB
 *
 * Expéditeur : Parametres du premier User ADMIN avec config email valide
 * (gmail_api OU SMTP). Si aucun admin n'a configuré l'email, on log un
 * warning et on retourne sans throw (la notif n'est pas critique).
 */

interface BackupNotificationArgs {
  run: BackupRun;
  config: Pick<AppConfig, 'backupNotifySuccess' | 'backupS3Bucket' | 'backupS3Endpoint'>;
}

function shouldNotify(args: BackupNotificationArgs): boolean {
  if (args.run.status === 'failed') return true;
  if (args.run.status === 'success' && args.config.backupNotifySuccess) return true;
  return false;
}

function formatBytes(bytes: bigint | null): string {
  if (bytes == null) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return '—';
  const ms = finishedAt.getTime() - startedAt.getTime();
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function buildSubject(run: BackupRun): string {
  const status = run.status === 'failed' ? '❌ ÉCHEC' : '✅ Succès';
  return `[OpenQuittance Backup] ${status} — ${run.startedAt.toISOString().slice(0, 16).replace('T', ' ')}`;
}

function buildBody(args: BackupNotificationArgs): { text: string; html: string } {
  const { run, config } = args;
  const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '');
  const settingsUrl = `${baseUrl}/parametres/backup`;
  const lines = [
    `Statut : ${run.status === 'failed' ? 'ÉCHEC' : 'Succès'}`,
    `Démarré : ${run.startedAt.toISOString()}`,
    `Terminé : ${run.finishedAt ? run.finishedAt.toISOString() : '—'}`,
    `Durée : ${formatDuration(run.startedAt, run.finishedAt)}`,
    `Taille : ${formatBytes(run.sizeBytes)}`,
    `Bailleurs : ${run.bailleursCount ?? 0}`,
    `ZIPs uploadés : ${run.zipsCount ?? 0}`,
  ];
  if (run.manifestS3Key) {
    lines.push(`Manifest : ${run.manifestS3Key}`);
  }
  if (run.errorMessage) {
    lines.push('', '— Erreur —', run.errorMessage);
  }
  if (config.backupS3Bucket && config.backupS3Endpoint) {
    lines.push('', `Bucket : ${config.backupS3Bucket} (${config.backupS3Endpoint})`);
  }
  lines.push('', `Détails et historique : ${settingsUrl}`);

  const text = lines.join('\n');
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 16px;color:${run.status === 'failed' ? '#a3527a' : '#1a7a3b'};">
    ${run.status === 'failed' ? '❌ Échec backup' : '✅ Backup réussi'}
  </h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    ${lines.slice(0, 7).map(l => {
      const [k, ...vparts] = l.split(' : ');
      const v = vparts.join(' : ');
      return `<tr><td style="padding:4px 8px;color:#6e6a73;">${k}</td><td style="padding:4px 8px;font-family:ui-monospace,monospace;">${v}</td></tr>`;
    }).join('')}
  </table>
  ${run.errorMessage ? `<div style="margin-top:16px;padding:12px;background:#fdf3f4;border-left:3px solid #a3527a;font-family:ui-monospace,monospace;font-size:12px;white-space:pre-wrap;">${escape(run.errorMessage)}</div>` : ''}
  <p style="margin-top:24px;font-size:13px;color:#6e6a73;">
    <a href="${escape(settingsUrl)}" style="color:#1a3a5c;">Voir l'historique des backups</a>
  </p>
</body></html>`;
  return { text, html };
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * Récupère les destinataires : env `BACKUP_NOTIFY_EMAIL` (priorité) ou
 * emails des Users ADMIN actifs.
 */
async function resolveRecipients(): Promise<string[]> {
  const envOverride = process.env.BACKUP_NOTIFY_EMAIL;
  if (envOverride) {
    return envOverride.split(',').map(s => s.trim()).filter(Boolean);
  }
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { email: true },
  });
  return admins.map(a => a.email).filter((e): e is string => !!e);
}

/**
 * Cherche un Parametres avec config email valide (gmail_api ou SMTP) parmi
 * les Users ADMIN. Retourne null si aucun admin n'a configuré l'email.
 */
async function findSenderParametres(): Promise<{
  parametres: NonNullable<Awaited<ReturnType<typeof prisma.parametres.findFirst>>>;
  fromEmail: string;
  fromName: string;
} | null> {
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, name: true },
  });
  for (const admin of admins) {
    const p = await prisma.parametres.findUnique({ where: { userId: admin.id } });
    if (!p) continue;
    if (p.emailMethod === 'gmail_api' && p.gmailRefreshToken && p.gmailEmail) {
      return { parametres: p, fromEmail: p.gmailEmail, fromName: admin.name ?? 'OpenQuittance' };
    }
    if (p.emailMethod === 'smtp' && p.smtpHost && p.smtpUser && p.smtpPass) {
      return { parametres: p, fromEmail: p.smtpUser, fromName: admin.name ?? 'OpenQuittance' };
    }
  }
  return null;
}

export async function sendBackupNotification(args: BackupNotificationArgs): Promise<{ sent: boolean; reason?: string }> {
  if (!shouldNotify(args)) {
    return { sent: false, reason: 'policy: skip success notification' };
  }

  const recipients = await resolveRecipients();
  if (recipients.length === 0) {
    return { sent: false, reason: 'no recipients (no ADMIN with email + no BACKUP_NOTIFY_EMAIL)' };
  }

  const sender = await findSenderParametres();
  if (!sender) {
    return { sent: false, reason: 'no admin Parametres with valid email config (gmail_api or smtp)' };
  }

  const { text, html } = buildBody(args);
  const subject = buildSubject(args.run);

  for (const to of recipients) {
    try {
      if (sender.parametres.emailMethod === 'gmail_api') {
        await sendViaGmailAPI({
          parametres: sender.parametres,
          fromName: sender.fromName,
          fromEmail: sender.fromEmail,
          to,
          subject,
          textBody: text,
          htmlBody: html,
        });
      } else {
        await sendViaSMTP({
          parametres: sender.parametres,
          fromName: sender.fromName,
          fromEmail: sender.fromEmail,
          to,
          subject,
          textBody: text,
          htmlBody: html,
        });
      }
    } catch (e) {
      console.error(`[backup/notifier] Échec envoi à ${to} :`, e);
    }
  }

  return { sent: true, reason: `sent to ${recipients.length} recipient(s)` };
}

// Export interne pour tests
export const _internals = {
  shouldNotify,
  buildBody,
  buildSubject,
  formatBytes,
  formatDuration,
};
