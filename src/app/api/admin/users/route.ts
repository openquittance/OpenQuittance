import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireUserId, isError } from '@/lib/auth-helpers';
import { requireRole } from '@/lib/access-control';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function GET() {
  const userId = await requireUserId();
  if (isError(userId)) return userId;
  if (!await requireRole(userId, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }
  // Filtre double :
  //   1. role IN [staff] (filtre primaire, bloque les TENANT cleans)
  //   2. PAS de Locataire lié via tenantUserId (source of truth — bloque les
  //      users corrompus dont le role en DB ne correspond plus à la réalité,
  //      par exemple un TENANT promu MEMBER avant rc3 qui aurait survécu au
  //      sanitize boot)
  // Cf. tests 12 (role filter) + 19 (Locataire filter) + 20 (PUT guard).
  const users = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'MEMBER', 'VIEWER'] },
      locatairesAccessibles: { none: {} },
    },
    select: { id: true, name: true, email: true, role: true, totpEnabled: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(users);
}

const createSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email(),
  // password optionnel : si absent, on en génère un temporaire que l'admin
  // doit communiquer hors-bande à l'utilisateur.
  password: z.string().min(8).optional(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

/**
 * Création directe d'un compte utilisateur sans passer par le flow d'invitation
 * email. Utile quand SMTP/Gmail n'est pas encore configuré, ou pour des
 * comptes de service.
 *
 * Si `password` est fourni : on l'utilise tel quel (l'admin a déjà choisi).
 * Sinon : on génère un mot de passe temporaire, retourné UNE SEULE FOIS dans
 * la réponse pour que l'admin le transmette à l'utilisateur.
 */
export async function POST(req: NextRequest) {
  const adminId = await requireUserId();
  if (isError(adminId)) return adminId;
  if (!await requireRole(adminId, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { name, email, password, role } = parsed.data;
  const lowerEmail = email.toLowerCase();

  const exists = await prisma.user.findUnique({ where: { email: lowerEmail } });
  if (exists) {
    return NextResponse.json({ error: 'Email déjà utilisé' }, { status: 409 });
  }

  // Génère un mot de passe temporaire si absent.
  const generated = !password ? randomBytes(9).toString('base64url') : null;
  const finalPassword = password ?? generated!;
  const hash = await bcrypt.hash(finalPassword, 10);

  const user = await prisma.user.create({
    data: {
      name: name ?? null,
      email: lowerEmail,
      password: hash,
      role,
    },
  });

  await logAudit({
    actorId: adminId,
    action: 'user.invite_accepted', // création directe par admin = équivalent
    targetType: 'User',
    targetId: user.id,
    metadata: { email: lowerEmail, role, createdBy: 'admin_direct', tempPasswordGenerated: !!generated },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    // Mot de passe temporaire — l'admin DOIT le communiquer hors-bande.
    // Non re-stocké, non re-affiché.
    tempPassword: generated,
  });
}
