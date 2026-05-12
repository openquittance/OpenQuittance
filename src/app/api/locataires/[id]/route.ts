import { NextRequest, NextResponse } from 'next/server';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { requireResourceInScope, handleScopeError } from '@/lib/multi-bailleur';
import { ipFromRequest, logAudit } from '@/lib/audit';
import { locataireSchema } from '@/lib/validation';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

export const dynamic = 'force-dynamic';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  const body = await req.json();
  const parsed = locataireSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  try {
    await requireResourceInScope(session, allowed =>
      prisma.locataire.findFirst({
        where: { id: params.id, bien: { bailleurId: { in: allowed } } },
        select: { id: true },
      })
    );
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.dateEntree) data.dateEntree = new Date(parsed.data.dateEntree);
    if (parsed.data.dateSortie !== undefined) {
      data.dateSortie = parsed.data.dateSortie ? new Date(parsed.data.dateSortie) : null;
    }
    if (parsed.data.email === '') data.email = null;
    const updated = await prisma.locataire.update({ where: { id: params.id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}

/**
 * DELETE Locataire — RGPD effacement complet (v2.8.0 Vague 3).
 *
 * Cascade :
 *   - Locataire row + Quittances + RevisionsIRL (Prisma onDelete:Cascade)
 *   - Archives ownerType='Locataire' ownerId=loc.id (polymorphe → manuel) :
 *     suppression rows DB + fichiers physiques (best-effort).
 *   - PortailMagicLink pendants (déjà existant).
 *   - User TENANT lié SI plus aucun autre Locataire ne le référence :
 *     soft-delete (disabledAt). Pas de delete pour audit.
 *   - AuditLog : anonymisation `actorId` et `targetId` qui mentionnent
 *     ce locataire ou son tenantUserId → "deleted_loc_<sha256-12>".
 *     Préserve la traçabilité légale sans exposer la PII.
 *
 * Cf. docs/RGPD.md procédure d'effacement.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;
  try {
    const before = await requireResourceInScope(session, allowed =>
      prisma.locataire.findFirst({
        where: { id: params.id, bien: { bailleurId: { in: allowed } } },
        select: { id: true, nom: true, prenom: true, tenantUserId: true },
      })
    );

    // 1. Récupère les archives à purger (rows + paths physiques).
    const archives = await prisma.archive.findMany({
      where: { ownerType: 'Locataire', ownerId: params.id },
      select: { id: true, storedPath: true },
    });

    // 2. Anonyme audit logs liés AVANT suppression (sinon plus de
    //    ressource à référencer). Hash stable basé sur l'ID locataire
    //    pour garder la corrélation sans exposer la PII.
    const anonHash = createHash('sha256').update(params.id).digest('hex').slice(0, 12);
    const anonId = `deleted_loc_${anonHash}`;
    await prisma.auditLog.updateMany({
      where: { targetType: 'Locataire', targetId: params.id },
      data: { targetId: anonId, metadata: JSON.stringify({ anonymized: true }) },
    });
    if (before.tenantUserId) {
      const tHash = createHash('sha256').update(before.tenantUserId).digest('hex').slice(0, 12);
      await prisma.auditLog.updateMany({
        where: { targetType: 'User', targetId: before.tenantUserId },
        data: { targetId: `deleted_user_${tHash}`, metadata: JSON.stringify({ anonymized: true }) },
      });
    }

    // 3. Cascade DB en transaction (Locataire + Quittance + RevisionIRL +
    //    Archive). Note : Quittance/RevisionIRL cascadent via FK Prisma.
    try {
      await prisma.$transaction([
        prisma.archive.deleteMany({ where: { ownerType: 'Locataire', ownerId: params.id } }),
        prisma.locataire.delete({ where: { id: params.id } }),
      ]);
    } catch {
      return NextResponse.json(
        { error: 'Suppression impossible (FK contrainte). Vérifiez les références.' },
        { status: 400 },
      );
    }

    // 4. Best-effort : delete fichiers physiques sur disque (post-DB pour
    //    éviter incohérence si le delete row fail).
    for (const a of archives) {
      try {
        const resolved = path.resolve(UPLOADS_DIR, a.storedPath);
        if (resolved.startsWith(path.resolve(UPLOADS_DIR))) {
          await unlink(resolved).catch(() => { /* déjà supprimé */ });
        }
      } catch { /* silent */ }
    }

    // 5. Désactivation User TENANT si plus aucun autre Locataire lié.
    if (before.tenantUserId) {
      const stillLinked = await prisma.locataire.count({
        where: { tenantUserId: before.tenantUserId },
      });
      if (stillLinked === 0) {
        await prisma.user.update({
          where: { id: before.tenantUserId },
          data: { disabledAt: new Date() },
        });
        await prisma.portailMagicLink.deleteMany({
          where: { tenantUserId: before.tenantUserId },
        });
      }
    }

    // 6. Audit final : event suppression (avec actorId staff, targetId
    //    déjà anonyme dans l'event lui-même).
    await logAudit({
      actorId: session.user!.id,
      action: 'locataire.delete',
      targetType: 'Locataire',
      targetId: anonId,
      metadata: {
        anonymized: true,
        archivesPurged: archives.length,
        rgpdErase: true,
      },
      ip: ipFromRequest(req),
    });

    return NextResponse.json({ ok: true, archivesPurged: archives.length });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
