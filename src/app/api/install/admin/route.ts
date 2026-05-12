import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { hasAnyAdmin, ensureAppConfig } from '@/lib/app-config';
import { logAudit, ipFromRequest } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const installAdminSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  email: z.string().email('Email invalide'),
  password: z.string().min(8, '8 caractères minimum'),
});

/**
 * POST /api/install/admin
 *
 * v3.3.0-rc1 — création du premier administrateur lors de l'install
 * initiale. Auth-less (instance vierge), gated par `!hasAnyAdmin()`.
 *
 * Si un admin existe déjà → 403 (race condition ou tentative
 * malveillante post-install).
 */
export async function POST(req: NextRequest) {
  try {
    // Gating : refus si un admin existe déjà (instance déjà installée).
    if (await hasAnyAdmin()) {
      return NextResponse.json(
        { error: "Instance déjà installée. Utilisez la page de connexion." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const parsed = installAdminSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Données invalides' },
        { status: 400 },
      );
    }
    const { name, email, password } = parsed.data;

    await ensureAppConfig();

    const password_hash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: password_hash,
        role: 'ADMIN',
      },
    });

    await logAudit({
      actorId: user.id,
      action: 'install.admin.created',
      targetType: 'User',
      targetId: user.id,
      metadata: { email: user.email, viaWizard: true },
      ip: ipFromRequest(req),
    });

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (e) {
    console.error('[install/admin] erreur :', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur interne' },
      { status: 500 },
    );
  }
}
