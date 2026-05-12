import type { NextRequest } from 'next/server';
import { prisma } from './prisma';

// Catalogue des actions auditables. Toute action sensible (mutation de données
// métier, action sécurité, export) doit y être déclarée explicitement pour
// éviter des chaînes magiques dispersées dans le code.
export type AuditAction =
  // Auth / membres
  | 'user.login'
  | 'user.logout'
  | 'user.register'
  | 'user.role_change'
  | 'user.invite'
  | 'user.invite_accepted'
  | 'user.delete'
  | 'user.totp_enabled'
  | 'user.totp_disabled'
  // Métier
  | 'bailleur.create'
  | 'bailleur.update'
  | 'bailleur.delete'
  | 'bien.create'
  | 'bien.update'
  | 'bien.delete'
  | 'locataire.create'
  | 'locataire.update'
  | 'locataire.delete'
  | 'quittance.create'
  | 'quittance.update'
  | 'quittance.delete'
  | 'quittance.email_sent'
  | 'quittance.email_failed'
  // IRL
  | 'irl.revision_applied'
  // Documents
  | 'document.generate'
  | 'archive.upload'
  | 'archive.delete'
  // Exports
  | 'export.pdf'
  | 'export.xml'
  | 'exports.bailleur_zip'
  // Config
  | 'config.update'
  // Portail locataire (cf. docs/PORTAIL-LOCATAIRE.md)
  | 'tenant.invited'
  | 'tenant.magic_link_requested'
  | 'tenant.login'
  | 'tenant.logout'
  | 'tenant.quittances_list'
  | 'tenant.quittance_view'
  | 'tenant.quittance_download'
  | 'tenant.portail_disabled'
  // Install wizard v3.3.0
  | 'install.admin.created'
  | 'install.bailleur.created'
  | 'install.completed';

interface LogAuditOpts {
  actorId: string;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /**
   * Métadonnées libres. **Pour toute action métier scopée bailleur**
   * (bailleur.*, bien.*, locataire.*, quittance.*, irl.*, document.*,
   * archive.*, export.*, tenant.invited, tenant.portail_disabled),
   * inclure `bailleurId: string` permet à `/api/audit` de filtrer par
   * scope (cf. docs/MULTI-BAILLEUR.md). Les actions auth/portail
   * TENANT sont globales et n'ont pas de bailleurId.
   */
  metadata?: Record<string, unknown> & { bailleurId?: string };
  ip?: string | null;
}

/**
 * Enregistre une entrée dans le journal d'activité. Ne throw jamais : un échec
 * d'audit ne doit pas casser l'opération métier sous-jacente. Les erreurs sont
 * loguées en console pour suivi.
 */
export async function logAudit(opts: LogAuditOpts): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: opts.actorId,
        action: opts.action,
        targetType: opts.targetType ?? null,
        targetId: opts.targetId ?? null,
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
        ip: opts.ip ?? null,
      },
    });
  } catch (e) {
    console.error('[audit] failed to write log entry', { action: opts.action, error: e });
  }
}

/**
 * Extrait l'IP du client depuis les headers proxy. Indispensable derrière
 * Cloudflare/Synology où req.ip est l'IP du proxy interne.
 */
export function ipFromRequest(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip');
}

/** Purge les entrées plus anciennes que `daysToKeep` jours. À appeler périodiquement. */
export async function purgeOldAuditLogs(daysToKeep: number): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  const { count } = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
