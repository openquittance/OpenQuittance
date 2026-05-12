import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { generateMagicLink } from '@/lib/portail-magic';
import { sendPortailInviteEmail } from '@/lib/email/portail';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Active le portail locataire pour un locataire donné.
 * Réservé MEMBER+ (un staff peut donner accès aux locataires qu'il gère).
 *
 * Étapes :
 *   1. Vérifie que le locataire a un email
 *   2. **Refus si collision avec un user staff** (ADMIN/MEMBER/VIEWER) — anti-fusion
 *   3. Crée (ou réutilise) un User TENANT avec cet email
 *   4. Lie Locataire.tenantUserId + portailActiveLe = now
 *   5. Génère un magic link et l'envoie par email
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;

  let locataire;
  try {
    const allowed = allowedBailleurIds(session);
    locataire = await prisma.locataire.findFirst({
      where: { id: params.id, bien: { bailleurId: { in: allowed } } },
      include: { bien: { include: { bailleur: true } } },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
  if (!locataire) {
    return NextResponse.json({ error: 'Locataire introuvable' }, { status: 404 });
  }
  if (!locataire.email) {
    return NextResponse.json(
      { error: 'Renseignez l\'email du locataire avant d\'activer le portail.' },
      { status: 400 },
    );
  }
  const lowerEmail = locataire.email.toLowerCase();

  // ─── Collision email staff ────────────────────────────────────────────
  // Si un user existe déjà avec cet email ET un rôle STAFF (ADMIN/MEMBER/VIEWER),
  // on refuse explicitement. Pas de fusion automatique : un staff ne doit
  // pas être malencontreusement convertir en TENANT (perte d'accès).
  const existing = await prisma.user.findUnique({ where: { email: lowerEmail } });
  if (existing && existing.role !== 'TENANT') {
    return NextResponse.json(
      {
        error: 'Cette adresse appartient déjà à un membre du staff. '
             + 'Choisissez un autre email côté locataire ou contactez l\'admin pour fusionner les comptes.',
      },
      { status: 409 },
    );
  }

  // Crée ou réutilise le user TENANT
  let tenantUser = existing;
  if (!tenantUser) {
    tenantUser = await prisma.user.create({
      data: {
        email: lowerEmail,
        name: `${locataire.prenom} ${locataire.nom}`.trim(),
        role: 'TENANT',
        // Pas de password : les TENANT s'authentifient uniquement via magic link
      },
    });
  } else if (tenantUser.disabledAt) {
    // Réactivation d'un compte précédemment désactivé
    tenantUser = await prisma.user.update({
      where: { id: tenantUser.id },
      data: { disabledAt: null },
    });
  }

  // Lie le locataire à ce user + active le portail (Phase 1 doc sharing :
  // portailActif est la source of truth ; portailActiveLe garde le timestamp
  // de première activation pour l'audit).
  await prisma.locataire.update({
    where: { id: locataire.id },
    data: {
      tenantUserId: tenantUser.id,
      portailActiveLe: new Date(),
      portailActif: true,
    },
  });

  // Cherche les paramètres email du staff actuel (celui qui invite)
  const senderParams = await prisma.parametres.findUnique({
    where: { userId: session.user!.id },
  });
  if (!senderParams) {
    return NextResponse.json(
      { error: 'Configurez votre email (Paramètres → Email) avant d\'envoyer une invitation.' },
      { status: 400 },
    );
  }

  const ip = ipFromRequest(req);
  const { token } = await generateMagicLink({ tenantUserId: tenantUser.id, ip });
  const publicBaseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;

  try {
    await sendPortailInviteEmail({
      parametres: senderParams,
      bailleur: locataire.bien.bailleur,
      locataire: { ...locataire, bien: locataire.bien },
      magicToken: token,
      publicBaseUrl,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur envoi email' },
      { status: 502 },
    );
  }

  await logAudit({
    actorId: session.user!.id,
    action: 'tenant.invited',
    targetType: 'Locataire',
    targetId: locataire.id,
    metadata: {
      tenantEmail: lowerEmail,
      tenantUserId: tenantUser.id,
      bailleurId: locataire.bien.bailleurId,
    },
    ip,
  });

  return NextResponse.json({
    ok: true,
    tenantUserId: tenantUser.id,
    portailActiveLe: new Date(),
  });
}

/** Désactive le portail pour ce locataire : unlink + purge des magic links pendants. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;

  let locataire;
  try {
    const allowed = allowedBailleurIds(session);
    locataire = await prisma.locataire.findFirst({
      where: { id: params.id, bien: { bailleurId: { in: allowed } } },
      include: { bien: { select: { bailleurId: true } } },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
  if (!locataire) return NextResponse.json({ error: 'Locataire introuvable' }, { status: 404 });
  if (!locataire.tenantUserId) {
    return NextResponse.json({ ok: true, alreadyDisabled: true });
  }

  const tenantUserId = locataire.tenantUserId;

  await prisma.locataire.update({
    where: { id: locataire.id },
    data: { tenantUserId: null, portailActiveLe: null, portailActif: false },
  });

  // Purge des magic links pendants (invalidation immédiate)
  await prisma.portailMagicLink.deleteMany({ where: { tenantUserId } });

  // Si le user n'a plus aucun lien actif, on le désactive (orphan)
  const stillLinked = await prisma.locataire.count({ where: { tenantUserId } });
  if (stillLinked === 0) {
    await prisma.user.update({
      where: { id: tenantUserId },
      data: { disabledAt: new Date() },
    });
  }

  await logAudit({
    actorId: session.user!.id,
    action: 'tenant.portail_disabled',
    targetType: 'Locataire',
    targetId: locataire.id,
    metadata: {
      tenantUserId,
      orphaned: stillLinked === 0,
      bailleurId: locataire.bien.bailleurId,
    },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ ok: true, orphaned: stillLinked === 0 });
}
