import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import archiver from 'archiver';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { rateLimit } from '@/lib/rate-limit';
import { ipFromRequest, logAudit } from '@/lib/audit';
import { generateQuittancePdf } from '@/lib/pdf-generator';
import { slugify } from '@/lib/zip-export';
import { CATEGORY_LABELS, normalizeCategory } from '@/lib/archive-categories';
import { decryptIfNeeded } from '@/lib/uploads-crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

/**
 * Export RGPD individuel d'un locataire (v2.8.0 Vague 3).
 * Droit à la portabilité art. 20 RGPD + droit d'accès art. 15.
 *
 * GET /api/locataires/[id]/export-rgpd
 *
 *   - Auth staff session ; ADMIN role sur le bailleur du locataire.
 *   - Scope : 404 oracle-free.
 *   - Rate-limit 1/5min/user.
 *   - ZIP contenu :
 *     * data.json : toutes données perso (nom, email, dates, loyer, etc.)
 *     * quittances/{YYYY}/*.pdf régénérés
 *     * documents/*.pdf : Archives ownerType=Locataire ownerId=loc.id
 *     * audit-log.json : events liés au locataire (autres actorIds anonymisés)
 *     * README.txt : explication
 *   - Filename : rgpd-export-{loc-slug}-{YYYY-MM-DD}.zip
 *
 * Cf. docs/RGPD.md procédure droit d'accès / portabilité.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;

  const rl = rateLimit({
    key: `exports.locataire_rgpd:${session.user!.id}`,
    limit: 1,
    windowMs: 5 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Trop d'exports récents. Réessayez dans ${rl.retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  // Scope check : le locataire doit appartenir à un bailleur dont le caller
  // est ADMIN (cohérent DELETE locataire qui exige ADMIN bailleur).
  const allowed = allowedBailleurIds(session);
  const locataire = await prisma.locataire.findFirst({
    where: { id: params.id, bien: { bailleurId: { in: allowed } } },
    include: {
      bien: { include: { bailleur: true } },
      quittances: { orderBy: [{ annee: 'asc' }, { mois: 'asc' }] },
      revisionsIRL: { orderBy: { dateEffet: 'asc' } },
    },
  });
  if (!locataire) {
    return NextResponse.json({ error: 'Locataire introuvable' }, { status: 404 });
  }

  const memberships = (session.user as { memberships?: Array<{ bailleurId: string; role: string }> }).memberships ?? [];
  const m = memberships.find(x => x.bailleurId === locataire.bien.bailleurId);
  if (!m || m.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Locataire introuvable' }, { status: 404 });
  }

  try {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
    });

    const locSlug = slugify(`${locataire.nom}-${locataire.prenom}`);
    const root = locSlug;

    // 1. data.json — toutes données perso structurées
    const dataExport = {
      version: 1,
      exportedAt: new Date().toISOString(),
      droits: {
        access: 'RGPD article 15',
        portability: 'RGPD article 20',
      },
      locataire: {
        id: locataire.id,
        nom: locataire.nom,
        prenom: locataire.prenom,
        email: locataire.email,
        telephone: locataire.telephone,
        loyerNu: locataire.loyerNu,
        charges: locataire.charges,
        montantDepotGarantie: locataire.montantDepotGarantie,
        irlTrimestre: locataire.irlTrimestre,
        irlValeurReference: locataire.irlValeurReference,
        dateEntree: locataire.dateEntree,
        dateSortie: locataire.dateSortie,
        actif: locataire.actif,
        portailActif: locataire.portailActif,
        partageQuittances: locataire.partageQuittances,
        partageEtatDesLieux: locataire.partageEtatDesLieux,
        partageBail: locataire.partageBail,
        partageDDT: locataire.partageDDT,
        createdAt: locataire.createdAt,
        updatedAt: locataire.updatedAt,
      },
      bien: {
        nom: locataire.bien.nom,
        adresse: locataire.bien.adresse,
        codePostal: locataire.bien.codePostal,
        ville: locataire.bien.ville,
        complement: locataire.bien.complement,
        surface: locataire.bien.surface,
        typeBien: locataire.bien.typeBien,
      },
      bailleur: {
        nom: locataire.bien.bailleur.nom,
        emailRgpd: locataire.bien.bailleur.emailRgpd,
      },
      quittances: locataire.quittances.map(q => ({
        id: q.id, mois: q.mois, annee: q.annee,
        loyerNu: q.loyerNu, charges: q.charges, montantTotal: q.montantTotal,
        datePaiement: q.datePaiement, dateEmission: q.dateEmission,
        emailEnvoye: q.emailEnvoye, dateEmail: q.dateEmail,
      })),
      revisionsIRL: locataire.revisionsIRL.map(r => ({
        id: r.id, dateEffet: r.dateEffet,
        ancienLoyer: r.ancienLoyer, nouveauLoyer: r.nouveauLoyer,
        irlReference: r.irlReference, irlNouveau: r.irlNouveau,
        trimestre: r.trimestre, statut: r.statut,
      })),
    };
    archive.append(JSON.stringify(dataExport, null, 2), { name: `${root}/data.json` });

    // 2. Quittances PDF régénérées
    let qCount = 0;
    for (const q of locataire.quittances) {
      try {
        const buf = await generateQuittancePdf({
          quittance: q, locataire, bien: locataire.bien, bailleur: locataire.bien.bailleur,
        });
        const annee = String(q.annee);
        const filename = `${q.annee}-${String(q.mois).padStart(2, '0')}_quittance.pdf`;
        archive.append(buf, { name: `${root}/quittances/${annee}/${filename}` });
        qCount++;
      } catch { /* skip */ }
    }

    // 3. Archives Locataire
    const locArchives = await prisma.archive.findMany({
      where: { ownerType: 'Locataire', ownerId: locataire.id },
    });
    let aCount = 0;
    for (const a of locArchives) {
      const norm = normalizeCategory(a.category);
      const catLabel = norm ? CATEGORY_LABELS[norm] : (a.category ?? 'AUTRE');
      try {
        const resolved = path.resolve(UPLOADS_DIR, a.storedPath);
        if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) continue;
        const raw = await readFile(resolved);
        const buf = decryptIfNeeded(raw);
        archive.append(buf, { name: `${root}/documents/${catLabel} - ${a.filename}` });
        aCount++;
      } catch { /* skip */ }
    }

    // 4. Audit log filtré sur ce locataire — anonymisation autres actorIds
    //    pour ne pas leaker l'identité du staff (sauf nb événements).
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { targetType: 'Locataire', targetId: locataire.id },
          locataire.tenantUserId
            ? { targetType: 'User', targetId: locataire.tenantUserId }
            : { targetType: '__never__' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const auditExport = auditLogs.map(log => ({
      action: log.action,
      createdAt: log.createdAt,
      // actorId masqué (autres acteurs anonymisés — seul l'event est exposé).
      actor: '[masked]',
      targetType: log.targetType,
      // targetId conservé seulement pour les events sur ce locataire.
      targetId: log.targetType === 'Locataire' ? log.targetId : '[masked]',
      ip: '[masked]',
    }));
    archive.append(JSON.stringify(auditExport, null, 2), { name: `${root}/audit-log.json` });

    // 5. README explicatif
    const readme = [
      `Export RGPD — ${locataire.nom} ${locataire.prenom}`,
      `Date export : ${new Date().toLocaleString('fr-FR')}`,
      '',
      'Cet export contient toutes les données personnelles que nous',
      'détenons sur vous, conformément aux articles 15 (droit d\'accès)',
      'et 20 (droit à la portabilité) du RGPD.',
      '',
      'Contenu :',
      '  data.json         — toutes données structurées (perso, bail, quittances, IRL)',
      '  quittances/       — PDF de toutes vos quittances',
      '  documents/        — vos documents archivés (bail, EDL, etc.)',
      '  audit-log.json    — événements horodatés vous concernant (acteurs masqués)',
      '',
      `Comptes : ${qCount} quittances · ${aCount} documents · ${auditLogs.length} événements audit`,
      '',
      'Pour toute question ou pour exercer vos autres droits',
      '(rectification, effacement, opposition), contactez le bailleur',
      'aux coordonnées indiquées sur votre bail.',
    ].join('\n');
    archive.append(readme, { name: `${root}/README.txt` });

    await archive.finalize();
    const buf = await done;

    const dateIso = new Date().toISOString().slice(0, 10);
    const filename = `rgpd-export-${locSlug}-${dateIso}.zip`;

    await logAudit({
      actorId: session.user!.id,
      action: 'exports.bailleur_zip', // event existant, sub précis dans metadata
      targetType: 'Locataire',
      targetId: locataire.id,
      metadata: {
        sub: 'rgpd_export',
        bailleurId: locataire.bien.bailleurId,
        sizeBytes: buf.length,
        quittances: qCount,
        archives: aCount,
        auditEntries: auditLogs.length,
      },
      ip: ipFromRequest(req),
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
