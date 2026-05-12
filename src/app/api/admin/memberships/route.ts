import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds } from '@/lib/multi-bailleur';
import { createInvitation, sendInvitationEmail } from '@/lib/invitations';

export const dynamic = 'force-dynamic';

/**
 * Liste les memberships d'un bailleur (Phase 2 Lot D).
 *
 * Retourne 1 ligne par membership (User + role spécifique au bailleur).
 * Le caller doit avoir une membership ADMIN sur ce bailleur (validation
 * via withBailleurScope-like).
 *
 * GET ?bailleurId=<id> → [{ userId, email, name, role, createdAt }]
 */
export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  const bailleurId = req.nextUrl.searchParams.get('bailleurId');
  if (!bailleurId) {
    return NextResponse.json({ error: 'bailleurId requis' }, { status: 400 });
  }
  const allowed = allowedBailleurIds(session);
  if (!allowed.includes(bailleurId)) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }
  const memberships = await prisma.bailleurMembership.findMany({
    where: { bailleurId },
    include: { user: { select: { id: true, name: true, email: true, totpEnabled: true, disabledAt: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({
    memberships: memberships.map(m => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      totpEnabled: m.user.totpEnabled,
      disabled: !!m.user.disabledAt,
      createdAt: m.createdAt,
    })),
  });
}

const postSchema = z.object({
  email: z.string().email(),
  name: z.string().optional().nullable(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
  bailleurIds: z.array(z.string().min(1)).min(1),
});

/**
 * Crée des memberships pour un user sur N bailleurs (Phase 2 Lot D).
 *
 * Cas :
 *   - email inconnu → flow Invitation (token + email "Bienvenue")
 *   - email existant SANS membership sur bailleur cible → ajoute
 *     membership(s) directement + email "Vous avez été ajouté à [bailleur]"
 *   - email existant AVEC membership sur AU MOINS UN bailleur cible → 409
 *
 * Validation cross-tenant : caller doit avoir membership ADMIN sur
 * CHAQUE bailleur dans bailleurIds (403 sinon).
 */
export async function POST(req: NextRequest) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { email, name, role, bailleurIds } = parsed.data;
  const lowerEmail = email.toLowerCase();

  // Validation cross-tenant : ADMIN requis sur chaque bailleurIds[]
  const callerMembs = (session.user as { memberships?: { bailleurId: string; role: string }[] }).memberships ?? [];
  for (const bid of bailleurIds) {
    const m = callerMembs.find(x => x.bailleurId === bid);
    if (!m || m.role !== 'ADMIN') {
      return NextResponse.json(
        { error: `Vous devez être ADMIN sur tous les bailleurs ciblés (manquant : ${bid})` },
        { status: 403 },
      );
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: lowerEmail } });

  // Cas TENANT : refus (un locataire ne se gère pas via cette route)
  if (existing && existing.role === 'TENANT') {
    return NextResponse.json(
      { error: 'Cette adresse appartient à un locataire. Géré via la fiche locataire.' },
      { status: 409 },
    );
  }

  // Cas user existant déjà membre d'un bailleur ciblé → 409
  if (existing) {
    const conflict = await prisma.bailleurMembership.findFirst({
      where: { userId: existing.id, bailleurId: { in: bailleurIds } },
      include: { bailleur: { select: { nom: true } } },
    });
    if (conflict) {
      return NextResponse.json(
        { error: `${existing.email} est déjà membre de ${conflict.bailleur.nom}` },
        { status: 409 },
      );
    }
    // Crée les memberships directement, pas d'invitation token
    await prisma.bailleurMembership.createMany({
      data: bailleurIds.map(bid => ({ userId: existing.id, bailleurId: bid, role })),
    });
    // TODO Phase 3 : email "Vous avez été ajouté à [bailleurs]" (notification).
    // Pas bloquant ; on retourne ok et l'admin peut prévenir manuellement.
    return NextResponse.json({
      ok: true,
      mode: 'membership_added',
      userId: existing.id,
      bailleurIds,
    });
  }

  // Cas email inconnu → flow Invitation (créer User à l'acceptation).
  //
  // Adaptatif (Phase 3) : selon que le caller a configuré son email
  // (Gmail OAuth ou SMTP) ou non, on envoie l'invitation par email
  // OU on retourne juste le lien d'activation à copier-coller. L'envoi
  // email n'est PAS un pré-requis pour Quittances.
  try {
    const invitation = await createInvitation({
      invitedById: session.user!.id,
      email: lowerEmail,
      role,
      bailleurIds,
    });
    const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;
    const invitationLink = `${baseUrl.replace(/\/$/, '')}/invitations/${invitation.token}`;

    const senderParams = await prisma.parametres.findUnique({ where: { userId: session.user!.id } });
    const canSendEmail =
      (senderParams?.emailMethod === 'gmail_api' && !!senderParams.gmailRefreshToken)
      || (senderParams?.emailMethod === 'smtp' && !!senderParams.smtpUser && !!senderParams.smtpPass);

    if (canSendEmail) {
      try {
        await sendInvitationEmail({ invitationId: invitation.id, baseUrl });
        return NextResponse.json({
          ok: true,
          mode: 'invitation_sent',
          invitationId: invitation.id,
          // Lien retourné comme fallback (admin peut copier en plus)
          invitationLink,
        });
      } catch (e) {
        // Email config présent mais send a fail (creds invalides, etc.).
        // L'invitation est en DB → on retourne le lien à copier-coller.
        return NextResponse.json({
          ok: true,
          mode: 'invitation_link',
          invitationId: invitation.id,
          invitationLink,
          warning: `Email non envoyé (${e instanceof Error ? e.message : 'erreur'}). Communiquez le lien manuellement.`,
        });
      }
    }

    // Pas de config email → mode link direct (admin transmet manuellement)
    return NextResponse.json({
      ok: true,
      mode: 'invitation_link',
      invitationId: invitation.id,
      invitationLink,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
