import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
const ARCHIVES_DIR = path.join(UPLOADS_DIR, 'archives');
const MAX_BYTES = 10 * 1024 * 1024; // 10 Mo pour la preuve de dépôt

const updateSchema = z.object({
  // Date d'envoi du recommandé (ISO)
  recommandeEnvoyeLe: z.string().min(1),
  // Numéro de suivi La Poste
  recommandeNumero: z.string().optional().nullable(),
});

/**
 * Marque la révision comme envoyée par recommandé + (optionnel) attache une
 * preuve de dépôt scannée. Deux modes :
 *
 * Content-Type JSON : { recommandeEnvoyeLe, recommandeNumero? } — pas de preuve
 * Content-Type multipart : champs ci-dessus + 'file' (récépissé scanné)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  let revision;
  let bailleurId: string;
  try {
    const allowed = allowedBailleurIds(session);
    const found = await prisma.revisionIRL.findFirst({
      where: { id: params.id, locataire: { bien: { bailleurId: { in: allowed } } } },
      include: { locataire: { select: { bien: { select: { bailleurId: true } } } } },
    });
    if (!found) return NextResponse.json({ error: 'Révision introuvable' }, { status: 404 });
    revision = found;
    bailleurId = found.locataire.bien.bailleurId;
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }

  const ct = req.headers.get('content-type') ?? '';
  let recommandeEnvoyeLe: string;
  let recommandeNumero: string | null = null;
  let preuveFile: File | null = null;

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData();
    const dateRaw = form.get('recommandeEnvoyeLe');
    const numRaw = form.get('recommandeNumero');
    const fileRaw = form.get('file');
    if (typeof dateRaw !== 'string') {
      return NextResponse.json({ error: 'recommandeEnvoyeLe requis' }, { status: 400 });
    }
    recommandeEnvoyeLe = dateRaw;
    if (typeof numRaw === 'string' && numRaw) recommandeNumero = numRaw;
    if (fileRaw instanceof File && fileRaw.size > 0) {
      if (fileRaw.size > MAX_BYTES) {
        return NextResponse.json({ error: `Preuve trop volumineuse (max ${MAX_BYTES / 1024 / 1024} Mo)` }, { status: 413 });
      }
      preuveFile = fileRaw;
    }
  } else {
    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }
    recommandeEnvoyeLe = parsed.data.recommandeEnvoyeLe;
    recommandeNumero = parsed.data.recommandeNumero ?? null;
  }

  let preuveDepotArchiveId: string | null = revision.preuveDepotArchiveId;

  if (preuveFile) {
    await mkdir(ARCHIVES_DIR, { recursive: true });
    const archiveId = randomBytes(12).toString('hex');
    const ext = path.extname(preuveFile.name).slice(0, 10) || '';
    const storedName = `${archiveId}${ext}`;
    const arr = await preuveFile.arrayBuffer();
    await writeFile(path.join(ARCHIVES_DIR, storedName), Buffer.from(arr));
    const archive = await prisma.archive.create({
      data: {
        ownerType: 'Locataire',
        ownerId: revision.locataireId,
        category: 'preuve-depot-recommande',
        filename: preuveFile.name,
        storedPath: `archives/${storedName}`,
        mimeType: preuveFile.type || 'application/octet-stream',
        size: preuveFile.size,
        uploadedById: session.user!.id,
      },
    });
    preuveDepotArchiveId = archive.id;
  }

  const updated = await prisma.revisionIRL.update({
    where: { id: revision.id },
    data: {
      recommandeEnvoyeLe: new Date(recommandeEnvoyeLe),
      recommandeNumero,
      preuveDepotArchiveId,
    },
  });

  await logAudit({
    actorId: session.user!.id,
    action: 'irl.revision_applied', // event existant
    targetType: 'RevisionIRL',
    targetId: revision.id,
    metadata: {
      sub: 'recommande_marked',
      recommandeEnvoyeLe,
      recommandeNumero,
      hasPreuve: !!preuveFile,
      bailleurId,
    },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ revision: updated });
}
