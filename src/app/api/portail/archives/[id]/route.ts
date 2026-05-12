import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ipFromRequest, logAudit } from '@/lib/audit';
import { LOCATAIRE_TOGGLE, normalizeCategory, isDDT } from '@/lib/archive-categories';
import { decryptIfNeeded } from '@/lib/uploads-crypto';

export const dynamic = 'force-dynamic';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

/**
 * Download / view d'une Archive par le locataire propriétaire.
 *
 * Sécurité (Phase 1 + v2.5.0 Feature A) :
 *   - session TENANT
 *   - Locataire-archive : ownerId ∈ locataires du tenant + portailActif=true
 *     + toggle/visibleLocataire conforme
 *   - Bien-archive : category ∈ DDT (filet strict) + au moins un loc du
 *     tenant sur le Bien avec partageDDT=true et portailActif=true
 *
 * 404 sur tout cas non autorisé (pas d'oracle, cohérent
 * /api/portail/quittances/[id]/pdf).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const archive = await prisma.archive.findUnique({ where: { id: params.id } });
  if (!archive) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
  }

  let allowed = false;
  let bailleurId: string | null = null;

  if (archive.ownerType === 'Locataire') {
    const locataire = await prisma.locataire.findFirst({
      where: {
        id: archive.ownerId,
        tenantUserId: session.user.id,
        portailActif: true,
      },
      select: {
        partageEtatDesLieux: true,
        partageBail: true,
        bien: { select: { bailleurId: true } },
      },
    });
    if (locataire) {
      const norm = normalizeCategory(archive.category);
      const toggleKey = norm && norm in LOCATAIRE_TOGGLE
        ? LOCATAIRE_TOGGLE[norm as keyof typeof LOCATAIRE_TOGGLE]
        : null;
      allowed = toggleKey ? locataire[toggleKey] : archive.visibleLocataire;
      if (allowed) bailleurId = locataire.bien.bailleurId;
    }
  } else if (archive.ownerType === 'Bien') {
    // DDT-only filet strict — quelle que soit la catégorie en DB, si elle
    // n'est pas dans le sous-ensemble DDT, on refuse.
    if (isDDT(archive.category)) {
      const loc = await prisma.locataire.findFirst({
        where: {
          bienId: archive.ownerId,
          tenantUserId: session.user.id,
          portailActif: true,
          partageDDT: true,
        },
        select: { bien: { select: { bailleurId: true } } },
      });
      if (loc) {
        allowed = true;
        bailleurId = loc.bien.bailleurId;
      }
    }
  }

  if (!allowed) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
  }

  const resolved = path.resolve(UPLOADS_DIR, archive.storedPath);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
    return NextResponse.json({ error: 'Chemin invalide' }, { status: 400 });
  }

  let buf: Buffer;
  try {
    const raw = await readFile(resolved);
    buf = decryptIfNeeded(raw);
  } catch {
    return NextResponse.json({ error: 'Fichier physique introuvable' }, { status: 410 });
  }

  const view = req.nextUrl.searchParams.get('view') === '1';
  const disposition = view ? 'inline' : 'attachment';

  await logAudit({
    actorId: session.user.id,
    action: 'tenant.quittance_download', // event existant — Phase 2 renommer en tenant.archive_download
    targetType: 'Archive',
    targetId: archive.id,
    metadata: {
      sub: 'portail_archive_download',
      filename: archive.filename,
      bailleurId: bailleurId ?? undefined,
      ownerType: archive.ownerType,
      category: archive.category ?? undefined,
    },
    ip: ipFromRequest(req),
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': archive.mimeType,
      'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
