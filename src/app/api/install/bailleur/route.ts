import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';
import { logAudit, ipFromRequest } from '@/lib/audit';
import { hasAnyAdmin } from '@/lib/app-config';

export const dynamic = 'force-dynamic';

const installBailleurSchema = z.object({
  nom: z.string().min(1, 'Nom commercial requis'),
  adresseLigne1: z.string().min(1, 'Adresse requise'),
  adresseLigne2: z.string().min(1, 'Code postal + ville requis'),
  villeSignature: z.string().min(1, 'Ville signature requise'),
});

/**
 * POST /api/install/bailleur
 *
 * v3.3.0-rc1 — création du premier bailleur lors de l'install
 * initiale. Requiert :
 *   - un ADMIN existe en DB (via `hasAnyAdmin()`)
 *   - une session ADMIN valide (auto-signin post-create-admin
 *     dans wizard)
 *
 * Crée Bailleur + BailleurMembership ADMIN pour l'admin connecté.
 */
export async function POST(req: NextRequest) {
  try {
    // Gating 1 : un admin doit exister (créé via /api/install/admin
    // précédemment).
    if (!(await hasAnyAdmin())) {
      return NextResponse.json(
        { error: "Aucun administrateur. Créez d'abord le compte admin via /install." },
        { status: 403 },
      );
    }

    // Gating 2 : session ADMIN active (auto-signin a réussi).
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Non authentifié — signin requis post création admin' },
        { status: 401 },
      );
    }
    const role = (session.user as { role?: string }).role;
    if (role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Réservé aux administrateurs' },
        { status: 403 },
      );
    }

    const body = await req.json();
    const parsed = installBailleurSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? 'Données invalides' },
        { status: 400 },
      );
    }
    const data = parsed.data;

    const bailleur = await prisma.bailleur.create({
      data: {
        nom: data.nom,
        adresseLigne1: data.adresseLigne1,
        adresseLigne2: data.adresseLigne2,
        villeSignature: data.villeSignature,
        // Membership ADMIN pour l'admin créé étape 1
        memberships: {
          create: {
            userId: session.user.id,
            role: 'ADMIN',
          },
        },
      },
    });

    await logAudit({
      actorId: session.user.id,
      action: 'install.bailleur.created',
      targetType: 'Bailleur',
      targetId: bailleur.id,
      metadata: { nom: bailleur.nom, viaWizard: true },
      ip: ipFromRequest(req),
    });

    return NextResponse.json({ ok: true, bailleurId: bailleur.id });
  } catch (e) {
    console.error('[install/bailleur] erreur :', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur interne' },
      { status: 500 },
    );
  }
}
