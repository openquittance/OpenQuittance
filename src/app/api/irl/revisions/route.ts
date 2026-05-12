import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { calculerRevisionIRL } from '@/lib/irl';
import { generateCourrierRevision } from '@/lib/pdf-documents';
import { ipFromRequest, logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
const ARCHIVES_DIR = path.join(UPLOADS_DIR, 'archives');

const applySchema = z.object({
  locataireId: z.string().min(1),
  irlNouveau: z.coerce.number().positive(),
  trimestre: z.coerce.number().int().min(1).max(4),
  dateEffet: z.string().min(1),
  /** Si true, applique réellement la révision (met à jour locataire.loyerNu) */
  apply: z.boolean().default(true),
});

/**
 * Crée une révision et (si apply=true) met à jour le loyer du locataire.
 * Sinon enregistre en DRAFT pour qu'on puisse générer le courrier sans
 * encore changer le loyer.
 */
export async function POST(req: NextRequest) {
  const session = await requireStaffSession('MEMBER');
  if (isError(session)) return session;
  const body = await req.json().catch(() => null);
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { locataireId, irlNouveau, trimestre, dateEffet, apply } = parsed.data;

  let loc;
  try {
    const allowed = allowedBailleurIds(session);
    loc = await prisma.locataire.findFirst({
      where: { id: locataireId, bien: { bailleurId: { in: allowed } } },
      include: { bien: { include: { bailleur: true } } },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
  if (!loc) return NextResponse.json({ error: 'Locataire introuvable' }, { status: 404 });
  if (!loc.irlValeurReference) {
    return NextResponse.json({ error: 'IRL de référence non renseigné sur ce locataire' }, { status: 400 });
  }

  const calcul = calculerRevisionIRL({
    loyerActuel: loc.loyerNu,
    irlReference: loc.irlValeurReference,
    irlNouveau,
    trimestre,
  });

  const revision = await prisma.revisionIRL.create({
    data: {
      locataireId: loc.id,
      dateEffet: new Date(dateEffet),
      ancienLoyer: calcul.ancienLoyer,
      nouveauLoyer: calcul.nouveauLoyer,
      irlReference: calcul.irlReference,
      irlNouveau: calcul.irlNouveau,
      trimestre,
      statut: apply ? 'APPLIED' : 'DRAFT',
    },
  });

  if (apply) {
    await prisma.locataire.update({
      where: { id: loc.id },
      data: { loyerNu: calcul.nouveauLoyer },
    });
  }

  // Auto-génération + persistance du courrier de révision en Archive,
  // pour avoir une trace immuable du document envoyé au locataire.
  try {
    const buf = await generateCourrierRevision({
      locataire: loc,
      bien: loc.bien,
      bailleur: loc.bien.bailleur,
      ancienLoyer: calcul.ancienLoyer,
      nouveauLoyer: calcul.nouveauLoyer,
      irlReference: calcul.irlReference,
      irlNouveau: calcul.irlNouveau,
      trimestre,
      anneeIRL: new Date(dateEffet).getFullYear(),
      dateEffet: new Date(dateEffet),
    });
    await mkdir(ARCHIVES_DIR, { recursive: true });
    const archiveId = randomBytes(12).toString('hex');
    const storedName = `${archiveId}.pdf`;
    await writeFile(path.join(ARCHIVES_DIR, storedName), buf);
    const archive = await prisma.archive.create({
      data: {
        ownerType: 'Locataire',
        ownerId: loc.id,
        category: 'courrier-revision-irl',
        filename: `revision-loyer-${loc.nom}-${new Date(dateEffet).toISOString().slice(0, 10)}.pdf`,
        storedPath: `archives/${storedName}`,
        mimeType: 'application/pdf',
        size: buf.length,
        uploadedById: session.user!.id,
      },
    });
    await prisma.revisionIRL.update({
      where: { id: revision.id },
      data: { courrierArchiveId: archive.id },
    });
    revision.courrierArchiveId = archive.id;
  } catch (e) {
    console.error('[irl] failed to auto-save courrier', e);
    // On ne bloque pas l'application : le PDF reste régénérable à la demande.
  }

  await logAudit({
    actorId: session.user!.id,
    action: 'irl.revision_applied',
    targetType: 'Locataire',
    targetId: loc.id,
    metadata: {
      revisionId: revision.id,
      ancienLoyer: calcul.ancienLoyer,
      nouveauLoyer: calcul.nouveauLoyer,
      variation: calcul.variation,
      apply,
      bailleurId: loc.bien.bailleurId,
    },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ revision, calcul });
}

export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  const locataireId = req.nextUrl.searchParams.get('locataireId');
  if (!locataireId) {
    return NextResponse.json({ error: 'locataireId requis' }, { status: 400 });
  }
  try {
    const allowed = allowedBailleurIds(session);
    // Vérifie que le locataire ciblé est dans le scope avant de lister
    // ses révisions. 404 si non (no oracle).
    const loc = await prisma.locataire.findFirst({
      where: { id: locataireId, bien: { bailleurId: { in: allowed } } },
      select: { id: true },
    });
    if (!loc) return NextResponse.json({ error: 'Locataire introuvable' }, { status: 404 });
    const revisions = await prisma.revisionIRL.findMany({
      where: { locataireId },
      orderBy: { dateEffet: 'desc' },
    });
    return NextResponse.json({ revisions });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
