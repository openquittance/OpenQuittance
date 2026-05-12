import { NextRequest, NextResponse } from 'next/server';
import { unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { ipFromRequest, logAudit } from '@/lib/audit';
import { decryptIfNeeded } from '@/lib/uploads-crypto';

export const dynamic = 'force-dynamic';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

/**
 * Lookup d'une archive avec scope multi-bailleur. Remonte au bailleur via
 * `ownerType+ownerId` (Bien direct, Locataire indirect via Bien). Retourne
 * `{ archive, bailleurId }` ou null si pas dans le scope.
 */
async function findArchiveInScope(archiveId: string, allowed: string[]) {
  const archive = await prisma.archive.findUnique({ where: { id: archiveId } });
  if (!archive) return null;
  if (archive.ownerType === 'Bien') {
    const b = await prisma.bien.findFirst({
      where: { id: archive.ownerId, bailleurId: { in: allowed } },
      select: { bailleurId: true },
    });
    if (!b) return null;
    return { archive, bailleurId: b.bailleurId };
  }
  if (archive.ownerType === 'Locataire') {
    const l = await prisma.locataire.findFirst({
      where: { id: archive.ownerId, bien: { bailleurId: { in: allowed } } },
      select: { bien: { select: { bailleurId: true } } },
    });
    if (!l) return null;
    return { archive, bailleurId: l.bien.bailleurId };
  }
  return null;
}

/** Téléchargement de l'archive (stream du fichier). */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  try {
    const allowed = allowedBailleurIds(session);
    const found = await findArchiveInScope(params.id, allowed);
    if (!found) return NextResponse.json({ error: 'Archive introuvable' }, { status: 404 });
    const { archive } = found;

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

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': archive.mimeType,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}

/**
 * PATCH : flip visibleLocataire (Phase 1 doc sharing). Seul le toggle
 * `visibleLocataire` est éditable via cette route — pas de modification
 * du fichier, du nom, du category, etc. (l'admin doit re-uploader pour ça).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.visibleLocataire !== 'boolean') {
    return NextResponse.json({ error: 'visibleLocataire (boolean) requis' }, { status: 400 });
  }
  try {
    const allowed = allowedBailleurIds(session);
    const found = await findArchiveInScope(params.id, allowed);
    if (!found) return NextResponse.json({ error: 'Archive introuvable' }, { status: 404 });
    const updated = await prisma.archive.update({
      where: { id: found.archive.id },
      data: { visibleLocataire: body.visibleLocataire },
    });
    return NextResponse.json({ archive: updated });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  try {
    const allowed = allowedBailleurIds(session);
    const found = await findArchiveInScope(params.id, allowed);
    if (!found) return NextResponse.json({ error: 'Archive introuvable' }, { status: 404 });
    const { archive, bailleurId } = found;

    await prisma.archive.delete({ where: { id: archive.id } });

    try {
      const resolved = path.resolve(UPLOADS_DIR, archive.storedPath);
      if (resolved.startsWith(path.resolve(UPLOADS_DIR))) {
        await unlink(resolved);
      }
    } catch {
      // ignore
    }

    await logAudit({
      actorId: session.user!.id,
      action: 'archive.delete',
      targetType: archive.ownerType,
      targetId: archive.ownerId,
      metadata: { archiveId: archive.id, filename: archive.filename, bailleurId },
      ip: ipFromRequest(req),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
