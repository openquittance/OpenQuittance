import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { ipFromRequest, logAudit } from '@/lib/audit';
import { isValidCategory } from '@/lib/archive-categories';
import { encryptBuffer } from '@/lib/uploads-crypto';

export const dynamic = 'force-dynamic';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
const ARCHIVES_DIR = path.join(UPLOADS_DIR, 'archives');
const MAX_BYTES = 25 * 1024 * 1024; // 25 Mo

const ALLOWED_OWNER_TYPES = new Set(['Bien', 'Locataire']);

/**
 * Vérifie qu'une entité owner (Bien ou Locataire) appartient bien à un
 * bailleur dans le scope. Retourne le bailleurId résolu pour l'audit.
 */
async function ownerInScope(
  ownerType: string,
  ownerId: string,
  allowed: string[],
): Promise<{ bailleurId: string } | null> {
  if (ownerType === 'Bien') {
    const b = await prisma.bien.findFirst({
      where: { id: ownerId, bailleurId: { in: allowed } },
      select: { bailleurId: true },
    });
    return b ? { bailleurId: b.bailleurId } : null;
  }
  if (ownerType === 'Locataire') {
    const l = await prisma.locataire.findFirst({
      where: { id: ownerId, bien: { bailleurId: { in: allowed } } },
      select: { bien: { select: { bailleurId: true } } },
    });
    return l ? { bailleurId: l.bien.bailleurId } : null;
  }
  return null;
}

/** Liste les archives associées à une entité (Bien ou Locataire). */
export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  const { searchParams } = req.nextUrl;
  const ownerType = searchParams.get('ownerType');
  const ownerId = searchParams.get('ownerId');
  if (!ownerType || !ALLOWED_OWNER_TYPES.has(ownerType) || !ownerId) {
    return NextResponse.json({ error: 'ownerType (Bien|Locataire) + ownerId requis' }, { status: 400 });
  }
  try {
    const allowed = allowedBailleurIds(session);
    const owner = await ownerInScope(ownerType, ownerId, allowed);
    if (!owner) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
    const archives = await prisma.archive.findMany({
      where: { ownerType, ownerId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { name: true, email: true } } },
    });
    return NextResponse.json({ archives });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}

/** Upload d'un fichier — multipart/form-data avec champs ownerType, ownerId, file, category? */
export async function POST(req: NextRequest) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;

  const form = await req.formData();
  const ownerType = form.get('ownerType');
  const ownerId = form.get('ownerId');
  const category = form.get('category');
  const file = form.get('file');

  if (typeof ownerType !== 'string' || !ALLOWED_OWNER_TYPES.has(ownerType)
      || typeof ownerId !== 'string' || !(file instanceof File)) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });
  }
  // v2.5.0 Feature A : catégorie obligatoire à l'écriture, validée
  // contre la whitelist par ownerType. Lecture rétro-compat sur aliases
  // gérée séparément (cf. lib/archive-categories normalizeCategory).
  if (typeof category !== 'string' || !category) {
    return NextResponse.json({ error: 'Catégorie obligatoire (cf. liste autorisée)' }, { status: 400 });
  }
  if (!isValidCategory(ownerType as 'Bien' | 'Locataire', category)) {
    return NextResponse.json(
      { error: `Catégorie "${category}" non autorisée pour ${ownerType}` },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'Fichier vide' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Fichier trop volumineux (max ${MAX_BYTES / 1024 / 1024} Mo)` }, { status: 413 });
  }

  try {
    const allowed = allowedBailleurIds(session);
    const owner = await ownerInScope(ownerType, ownerId, allowed);
    if (!owner) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });

    await mkdir(ARCHIVES_DIR, { recursive: true });
    const id = randomBytes(12).toString('hex');
    const ext = path.extname(file.name).slice(0, 10) || '';
    const storedName = `${id}${ext}`;
    const storedPath = path.join(ARCHIVES_DIR, storedName);

    const arr = await file.arrayBuffer();
    // v2.9.0 : chiffrement AES-256-GCM avant écriture disque
    const encrypted = encryptBuffer(Buffer.from(arr));
    await writeFile(storedPath, encrypted);

    const archive = await prisma.archive.create({
      data: {
        ownerType,
        ownerId,
        category,
        filename: file.name,
        storedPath: `archives/${storedName}`,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        uploadedById: session.user!.id,
      },
    });

    await logAudit({
      actorId: session.user!.id,
      action: 'archive.upload',
      targetType: ownerType,
      targetId: ownerId,
      metadata: {
        archiveId: archive.id,
        filename: file.name,
        size: file.size,
        category: archive.category,
        bailleurId: owner.bailleurId,
      },
      ip: ipFromRequest(req),
    });

    return NextResponse.json({ archive });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
