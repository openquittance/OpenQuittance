import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { generateMagicLink } from '@/lib/portail-magic';
import { sendPortailInviteEmail } from '@/lib/email/portail';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.string().email().max(200),
});

/**
 * Demande de magic link pour le portail locataire.
 *
 * Anti-énumération : on retourne TOUJOURS HTTP 200 avec un message neutre,
 * que l'email existe ou non, qu'il soit TENANT actif ou non, qu'il soit
 * désactivé ou non. Le seul cas qui retourne 429 est le rate limiting.
 *
 * Rate limit : 3 demandes / heure / email (clé portal-magic:<email>).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    // 400 ici car la requête est mal formée (pas un email valide), pas
    // une tentative d'énumération.
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  const rl = rateLimit({
    key: `portal-magic:${email}`,
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Trop de demandes pour cet email. Réessayez dans ${Math.ceil(rl.retryAfterSec / 60)} min.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  // Réponse uniforme pour toutes les issues (anti-énumération)
  const SILENT_OK = NextResponse.json({ ok: true });

  // Cherche un user TENANT actif lié à au moins un locataire avec portail activé
  const user = await prisma.user.findFirst({
    where: {
      email,
      role: 'TENANT',
      disabledAt: null,
      locatairesAccessibles: {
        some: { portailActif: true },
      },
    },
    include: {
      locatairesAccessibles: {
        where: { portailActif: true },
        include: { bien: { include: { bailleur: true } } },
        take: 1, // 1 suffit pour l'expéditeur (bailleur du 1er locataire)
      },
    },
  });

  if (!user || !user.locatairesAccessibles.length) {
    // Email inconnu ou non lié à un portail actif : silent OK + log discret
    await logAudit({
      actorId: user?.id ?? 'anonymous',
      action: 'tenant.magic_link_requested',
      metadata: { email, status: 'not_eligible' },
      ip: ipFromRequest(req),
    });
    return SILENT_OK;
  }

  const locataire = user.locatairesAccessibles[0]!;
  const bailleur = locataire.bien.bailleur;

  // Trouve les paramètres email du bailleur. On utilise les paramètres du
  // 1er ADMIN ayant configuré son email (heuristique simple : l'app est
  // mono-bailleur dans la pratique, donc en général un seul jeu de paramètres).
  const sender = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    include: { parametres: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!sender?.parametres) {
    console.error('[portail/login] aucun ADMIN avec paramètres email — magic link non envoyé');
    return SILENT_OK; // silent OK quand même, on n'expose rien
  }

  const ip = ipFromRequest(req);
  const { token } = await generateMagicLink({ tenantUserId: user.id, ip });
  const publicBaseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;

  try {
    await sendPortailInviteEmail({
      parametres: sender.parametres,
      bailleur,
      locataire,
      magicToken: token,
      publicBaseUrl,
    });
  } catch (e) {
    console.error('[portail/login] envoi email échoué', e);
    // On retourne quand même OK pour ne pas révéler l'état de l'envoi
  }

  await logAudit({
    actorId: user.id,
    action: 'tenant.magic_link_requested',
    targetType: 'User',
    targetId: user.id,
    metadata: { email, status: 'sent' },
    ip,
  });

  return SILENT_OK;
}
