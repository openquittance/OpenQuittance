import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { decryptIfNeeded } from '@/lib/uploads-crypto';

export const dynamic = 'force-dynamic';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/**
 * Sert le logo du bailleur du TENANT loggué. Pas d'accès direct via
 * /api/uploads/[...path] (cette route exige staff). Pas de path en
 * paramètre : le logo est dérivé du bailleur du locataire actif.
 *
 * Cas : pas de logoUrl en DB → 404. Path obsolète (legacy uploads
 * layout, fichier disparu) → 404 aussi. Côté UI, ternaire fallback
 * sur icône FileText quand le fetch fail.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const loc = await prisma.locataire.findFirst({
    where: { tenantUserId: session.user.id, portailActif: true },
    select: { bien: { select: { bailleur: { select: { logoUrl: true } } } } },
  });
  const logoUrl = loc?.bien.bailleur.logoUrl;
  if (!logoUrl) {
    return NextResponse.json({ error: 'Pas de logo' }, { status: 404 });
  }

  const rel = logoUrl.replace(/^\/?(uploads\/)?/, '');
  const fullPath = path.join(UPLOADS_DIR, rel);
  const safeRoot = path.resolve(UPLOADS_DIR);
  if (!path.resolve(fullPath).startsWith(safeRoot) || !fs.existsSync(fullPath)) {
    return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 });
  }

  // v2.9.0 chiffrement uploads : decrypt si chiffré, legacy si en clair.
  const rawBuf = fs.readFileSync(fullPath);
  const buf = decryptIfNeeded(rawBuf);
  const ext = fullPath.split('.').pop()?.toLowerCase() ?? 'png';
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
