import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { registerSchema } from '@/lib/validation';
import { getRegistrationMode, hasAnyAdmin, ensureAppConfig } from '@/lib/app-config';
import { ipFromRequest, logAudit } from '@/lib/audit';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    // Rate limit : 3 inscriptions / heure / IP. Protège contre les bots.
    const rl = rateLimit({
      key: `register:${clientIp(req)}`,
      limit: 3,
      windowMs: 60 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Trop de tentatives. Réessayez dans ${Math.ceil(rl.retryAfterSec / 60)} min.` },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
      );
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Données invalides' },
        { status: 400 },
      );
    }
    const { name, email, password } = parsed.data;
    const lowerEmail = email.toLowerCase();

    // Premier utilisateur de l'app: il devient automatiquement ADMIN
    // sans contrainte de mode (il N'Y A pas encore d'admin pour configurer un mode).
    const isFirstUser = !(await hasAnyAdmin());

    // v2.8.0 quick win sécu : anti-énumération — si email existe déjà,
    // retourner 200 generic SANS révéler l'existence du compte ET sans
    // appliquer la logique CLOSED/INVITATION_ONLY (qui leakerait
    // l'existence par différentiel de réponse). Cf. SECURITE-CONFORMITE.md §1.6.2.
    const exists = await prisma.user.findUnique({ where: { email: lowerEmail } });
    if (exists && !isFirstUser) {
      await logAudit({
        actorId: exists.id,
        action: 'user.register',
        targetType: 'User',
        targetId: exists.id,
        metadata: {
          email: lowerEmail,
          duplicateAttempt: true,
          note: 'Tentative d\'inscription sur email existant — réponse 200 generic envoyée',
        },
        ip: ipFromRequest(req),
      });
      return NextResponse.json({
        ok: true,
        message: 'Si cet email peut être utilisé, votre compte est prêt. Connectez-vous.',
        existing: true,
      });
    }

    if (!isFirstUser) {
      // Pour tous les utilisateurs suivants, on respecte le mode configuré
      const mode = await getRegistrationMode();
      if (mode === 'CLOSED') {
        return NextResponse.json({ error: 'Les inscriptions sont fermées.' }, { status: 403 });
      }
      // INVITATION_ONLY: une invitation pendante doit exister pour cet email
      const invitation = await prisma.invitation.findFirst({
        where: {
          email: lowerEmail,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (!invitation) {
        return NextResponse.json(
          { error: "Inscription sur invitation uniquement. Demandez une invitation à l'administrateur." },
          { status: 403 },
        );
      }
    }

    // Si on arrive ici, isFirstUser=true. Cas spécial : pas de risque
    // d'énum sur le premier user (l'app n'a pas encore d'admin).
    if (exists) {
      return NextResponse.json({ error: 'Cet email est déjà utilisé' }, { status: 409 });
    }

    const role = isFirstUser
      ? 'ADMIN'
      : (await prisma.invitation.findFirst({
          where: { email: lowerEmail, acceptedAt: null, expiresAt: { gt: new Date() } },
        }))?.role ?? 'MEMBER';

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email: lowerEmail, password: hash, role },
    });

    if (isFirstUser) {
      // Initialise AppConfig au premier user (mode CLOSED par défaut)
      await ensureAppConfig();
    } else {
      // Marque l'invitation comme acceptée
      await prisma.invitation.updateMany({
        where: { email: lowerEmail, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
    }

    await logAudit({
      actorId: user.id,
      action: isFirstUser ? 'user.register' : 'user.invite_accepted',
      targetType: 'User',
      targetId: user.id,
      metadata: { email: lowerEmail, role, isFirstUser },
      ip: ipFromRequest(req),
    });

    return NextResponse.json({ ok: true, isFirstUser, userId: user.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 500 });
  }
}
