import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs/promises';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { withBailleurScope, handleScopeError } from '@/lib/multi-bailleur';
import { encryptBuffer } from '@/lib/uploads-crypto';

export const dynamic = 'force-dynamic';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * Upload du logo ou de la signature pour un bailleur. Le bailleur cible
 * doit être dans le scope du user (cf. docs/MULTI-BAILLEUR.md).
 *
 * Structure de stockage : `bailleurs/<bailleurId>/<kind>-<timestamp>.<ext>`.
 * Migration depuis l'ancien layout `<userId>/...` : cf.
 * scripts/migrate-uploads.mts. Ancien layout reste compatible en lecture
 * sur /api/uploads/[...path] tant que la migration n'a pas tourné.
 */
export async function POST(req: NextRequest) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;

  const form = await req.formData();
  const file = form.get('file') as File | null;
  const kind = form.get('kind') as string | null;
  const bailleurIdRaw = form.get('bailleurId') as string | null;

  if (!file || !kind || !bailleurIdRaw) {
    return NextResponse.json({ error: 'file, kind, bailleurId requis' }, { status: 400 });
  }
  if (!['logo', 'signature'].includes(kind)) {
    return NextResponse.json({ error: 'kind invalide' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Format non supporté (PNG/JPG/WEBP)' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Fichier > 2MB' }, { status: 400 });
  }

  try {
    const { bailleurId } = withBailleurScope(session, bailleurIdRaw);
    const bailleur = await prisma.bailleur.findUnique({ where: { id: bailleurId } });
    if (!bailleur) return NextResponse.json({ error: 'Bailleur introuvable' }, { status: 404 });

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const bailleurDir = path.join(UPLOADS_DIR, 'bailleurs', bailleurId);
    await fs.mkdir(bailleurDir, { recursive: true });
    const filename = `${kind}-${Date.now()}.${ext}`;
    const fullPath = path.join(bailleurDir, filename);
    const arrayBuffer = await file.arrayBuffer();
    // v2.9.0 chiffrement applicatif AES-256-GCM avant écriture disque
    const encrypted = encryptBuffer(Buffer.from(arrayBuffer));
    await fs.writeFile(fullPath, encrypted);

    const relPath = `bailleurs/${bailleurId}/${filename}`;

    // Remove previous file for the same kind on this bailleur
    const previous = kind === 'logo' ? bailleur.logoUrl : bailleur.signatureUrl;
    if (previous) {
      const prevAbs = path.join(UPLOADS_DIR, previous.replace(/^\/?(uploads\/)?/, ''));
      fs.unlink(prevAbs).catch(() => {});
    }

    await prisma.bailleur.update({
      where: { id: bailleurId },
      data: kind === 'logo' ? { logoUrl: relPath } : { signatureUrl: relPath },
    });

    return NextResponse.json({ ok: true, path: relPath });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
