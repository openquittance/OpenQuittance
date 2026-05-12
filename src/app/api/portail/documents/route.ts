import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { ipFromRequest, logAudit } from '@/lib/audit';
import { LOCATAIRE_TOGGLE, normalizeCategory, isDDT } from '@/lib/archive-categories';

export const dynamic = 'force-dynamic';

/**
 * Liste les documents (Archive) accessibles au TENANT loggué.
 *
 * Règles d'exposition (Phase 1 Lot D + v2.5.0 Feature A) :
 *
 *   1. Locataire.portailActif = true (gate global)
 *   2. Locataire-archives (ownerType='Locataire', ownerId=loc.id) :
 *      - Catégorie système (BAIL/EDL_*) → toggle partage* gouverne
 *        (visibleLocataire ignoré)
 *      - Catégorie libre → visibleLocataire seul décide
 *   3. Bien-archives DDT (ownerType='Bien' + category ∈ DDT) :
 *      - Exposées si Locataire.partageDDT = true sur AU MOINS un loc actif
 *        du Bien — granularité par locataire (Q7 cadrage)
 *      - Filet serveur strict : aucune autre catégorie Bien n'est exposée
 *        même si tampering category côté client (la whitelist DDT est en dur)
 *
 * Renvoie liste filtrée + métadonnées par doc (id, filename, category,
 * createdAt, size). Le download passe par /api/portail/archives/[id].
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  // Locataires actifs du TENANT (multi-bail OK)
  const locataires = await prisma.locataire.findMany({
    where: { tenantUserId: session.user.id, portailActif: true },
    select: {
      id: true,
      bienId: true,
      partageEtatDesLieux: true,
      partageBail: true,
      partageDDT: true,
    },
  });
  if (locataires.length === 0) {
    return NextResponse.json({ documents: [] });
  }

  const locIds = locataires.map(l => l.id);
  const locById = new Map(locataires.map(l => [l.id, l]));
  // Bien-IDs dont au moins un loc actif a partageDDT=true → ces biens
  // exposent leurs DDT-archives au tenant. Granularité par locataire (Q7) :
  // si loc A a partageDDT=true et loc B sur le même bien a false, le DDT
  // est tout de même partagé via loc A (un même fichier DDT est unique
  // au niveau Bien).
  const bienIdsWithDDT = new Set(
    locataires.filter(l => l.partageDDT).map(l => l.bienId),
  );

  // Lecture combinée : Locataire-archives sur les locIds + Bien-archives
  // sur les bienIds DDT-enabled. Une seule requête.
  const archives = await prisma.archive.findMany({
    where: {
      OR: [
        { ownerType: 'Locataire', ownerId: { in: locIds } },
        ...(bienIdsWithDDT.size > 0
          ? [{ ownerType: 'Bien' as const, ownerId: { in: [...bienIdsWithDDT] } }]
          : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  const documents = archives
    .filter(a => {
      if (a.ownerType === 'Locataire') {
        const loc = locById.get(a.ownerId);
        if (!loc) return false;
        const norm = normalizeCategory(a.category);
        // Catégorie Locataire système (BAIL/EDL_*) → toggle partage* gouverne
        const toggleKey = norm && norm in LOCATAIRE_TOGGLE
          ? LOCATAIRE_TOGGLE[norm as keyof typeof LOCATAIRE_TOGGLE]
          : null;
        if (toggleKey) return loc[toggleKey];
        // Catégorie libre → visibleLocataire seul décide
        return a.visibleLocataire;
      }
      // ownerType=Bien : DDT-only filtering (filet strict server-side)
      if (!isDDT(a.category)) return false;
      // Le bien doit avoir au moins un loc avec partageDDT=true
      return bienIdsWithDDT.has(a.ownerId);
    })
    .map(a => ({
      id: a.id,
      filename: a.filename,
      category: a.category,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt,
      ownerType: a.ownerType,
    }));

  await logAudit({
    actorId: session.user.id,
    action: 'tenant.quittances_list', // event existant — sera renommé en Phase 2 si besoin
    metadata: { sub: 'documents_list', count: documents.length },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ documents });
}
