/**
 * Export ZIP organisé d'un bailleur (v2.7.0 Feature C).
 *
 * Itère Bailleur → Biens → (archives Bien + locataires) → (archives
 * Locataire + quittances PDF régénérées + révisions IRL) et append
 * dans une instance `archiver` fournie par le caller (qui pipe le
 * stream vers la Response Next).
 *
 * Décisions cadrage Session 0 (cf. SESSION-LOGS 2026-05-06) :
 *   Q1 archiver streaming, Q2 régénération Quittances, Q3 audit-log.json
 *   filtré bailleur, Q4 révisions IRL régénérer si pas archivé,
 *   Q5 manifest.json + README.txt, Q7 locataires inactifs même arbre +
 *   marker, Q9 nom ISO préfixé, Q10 annonce.txt si présent, Q13 stream.
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Archiver } from 'archiver';
import { prisma } from './prisma';
import { generateQuittancePdf } from './pdf-generator';
import { generateCourrierRevision } from './pdf-documents';
import { CATEGORY_LABELS, normalizeCategory } from './archive-categories';
import { decryptIfNeeded } from './uploads-crypto';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

/**
 * Slugify pour noms de dossiers/fichiers ZIP. NFD + remove diacritics +
 * lowercase + non-alnum → dash + collapse + trim. Cap 60 chars (POSIX
 * filesystems gèrent 255 mais certains ZIP viewers tronquent ; 60 reste
 * lisible et large pour la plupart des noms).
 */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sans-nom';
}

/** Format ISO préfixé pour tri alphabétique = chronologique. */
function moisIsoPrefix(mois: number, annee: number): string {
  return `${annee}-${String(mois).padStart(2, '0')}`;
}

/** Helper append safe : skip si fichier physique manquant (no crash). */
async function appendArchiveFile(
  archive: Archiver,
  storedPath: string,
  zipPath: string,
): Promise<boolean> {
  const resolved = path.resolve(UPLOADS_DIR, storedPath);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) return false;
  try {
    const raw = await readFile(resolved);
    const buf = decryptIfNeeded(raw);
    archive.append(buf, { name: zipPath });
    return true;
  } catch {
    return false;
  }
}

export interface ZipExportCounts {
  biens: number;
  locataires: number;
  quittances: number;
  archives: number;
  revisions: number;
  archivesMissing: number;
}

/**
 * Génère le contenu ZIP (manifest + arbre) pour un bailleur. Le caller
 * doit avoir déjà validé le scope. Retourne les counts pour audit.
 */
export async function generateBailleurZip(
  bailleurId: string,
  archive: Archiver,
): Promise<ZipExportCounts> {
  const bailleur = await prisma.bailleur.findUnique({
    where: { id: bailleurId },
    include: {
      biens: {
        include: {
          locataires: {
            include: {
              quittances: { orderBy: [{ annee: 'asc' }, { mois: 'asc' }] },
              revisionsIRL: { orderBy: { dateEffet: 'asc' } },
            },
            orderBy: { dateEntree: 'asc' },
          },
        },
        orderBy: { nom: 'asc' },
      },
    },
  });
  if (!bailleur) throw new Error('Bailleur introuvable');

  const bailleurSlug = slugify(bailleur.nom);
  const root = bailleurSlug;

  // Pré-charge toutes les archives du bailleur (Bien + Locataire) en 1 query
  const bienIds = bailleur.biens.map(b => b.id);
  const locIds = bailleur.biens.flatMap(b => b.locataires.map(l => l.id));
  const allArchives = await prisma.archive.findMany({
    where: {
      OR: [
        { ownerType: 'Bien', ownerId: { in: bienIds } },
        { ownerType: 'Locataire', ownerId: { in: locIds } },
      ],
    },
  });
  const archivesByOwner = new Map<string, typeof allArchives>();
  for (const a of allArchives) {
    const key = `${a.ownerType}:${a.ownerId}`;
    const list = archivesByOwner.get(key) ?? [];
    list.push(a);
    archivesByOwner.set(key, list);
  }

  // Audit log filtré bailleur (Q3) — events liés à des resources de ce bailleur
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { targetType: 'Bailleur', targetId: bailleurId },
        { targetType: 'Bien', targetId: { in: bienIds } },
        { targetType: 'Locataire', targetId: { in: locIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  });

  const counts: ZipExportCounts = {
    biens: 0, locataires: 0, quittances: 0, archives: 0,
    revisions: 0, archivesMissing: 0,
  };
  const manifestBiens: Array<Record<string, unknown>> = [];

  for (const bien of bailleur.biens) {
    counts.biens++;
    const bienSlug = slugify(bien.nom);
    const bienRoot = `${root}/biens/${bienSlug}`;

    // Annonce locative (Q10)
    if (bien.annonceTexte && bien.annonceTexte.trim()) {
      archive.append(bien.annonceTexte, { name: `${bienRoot}/annonce.txt` });
    }

    // Documents Bien
    const bienArchives = archivesByOwner.get(`Bien:${bien.id}`) ?? [];
    for (const a of bienArchives) {
      const norm = normalizeCategory(a.category);
      const catLabel = norm ? CATEGORY_LABELS[norm] : (a.category ?? 'AUTRE');
      const zipName = `${bienRoot}/documents/${catLabel} - ${a.filename}`;
      const ok = await appendArchiveFile(archive, a.storedPath, zipName);
      if (ok) counts.archives++;
      else counts.archivesMissing++;
    }

    const manifestLocs: Array<Record<string, unknown>> = [];

    for (const loc of bien.locataires) {
      counts.locataires++;
      const locSlug = slugify(`${loc.nom}-${loc.prenom}`);
      const locRoot = `${bienRoot}/locataires/${locSlug}`;

      // Documents Locataire
      const locArchives = archivesByOwner.get(`Locataire:${loc.id}`) ?? [];
      for (const a of locArchives) {
        const norm = normalizeCategory(a.category);
        const catLabel = norm ? CATEGORY_LABELS[norm] : (a.category ?? 'AUTRE');
        const zipName = `${locRoot}/documents/${catLabel} - ${a.filename}`;
        const ok = await appendArchiveFile(archive, a.storedPath, zipName);
        if (ok) counts.archives++;
        else counts.archivesMissing++;
      }

      // Quittances PDF régénérées (Q2)
      for (const q of loc.quittances) {
        try {
          const buf = await generateQuittancePdf({
            quittance: q, locataire: loc, bien, bailleur,
          });
          const filename = `${moisIsoPrefix(q.mois, q.annee)}_quittance.pdf`;
          const annee = String(q.annee);
          archive.append(buf, { name: `${locRoot}/quittances/${annee}/${filename}` });
          counts.quittances++;
        } catch {
          counts.archivesMissing++;
        }
      }

      // Révisions IRL — courriers déjà archivés OU régénérés (Q4)
      for (const r of loc.revisionsIRL) {
        let buf: Buffer | null = null;
        let filenameBase = `${slugify(r.dateEffet.toISOString().slice(0, 7))}_revision_${locSlug}`;
        if (r.courrierArchiveId) {
          const arch = allArchives.find(a => a.id === r.courrierArchiveId);
          if (arch) {
            try {
              const raw = await readFile(path.resolve(UPLOADS_DIR, arch.storedPath));
              buf = decryptIfNeeded(raw);
              filenameBase = arch.filename.replace(/\.pdf$/i, '');
            } catch {
              buf = null;
            }
          }
        }
        if (!buf) {
          try {
            const dateEffet = new Date(r.dateEffet);
            buf = await generateCourrierRevision({
              locataire: loc, bien, bailleur,
              ancienLoyer: r.ancienLoyer, nouveauLoyer: r.nouveauLoyer,
              irlReference: r.irlReference, irlNouveau: r.irlNouveau,
              trimestre: r.trimestre, anneeIRL: dateEffet.getFullYear(),
              dateEffet,
            });
          } catch {
            buf = null;
          }
        }
        if (buf) {
          archive.append(buf, { name: `${root}/revisions-irl/${filenameBase}.pdf` });
          counts.revisions++;
        } else {
          counts.archivesMissing++;
        }
      }

      manifestLocs.push({
        id: loc.id, nom: loc.nom, prenom: loc.prenom,
        slug: locSlug,
        dateEntree: loc.dateEntree, dateSortie: loc.dateSortie,
        actif: loc.actif,
        // Q7 marker locataires inactifs (sortis)
        statut: loc.dateSortie ? 'inactif' : 'actif',
        nbQuittances: loc.quittances.length,
        nbRevisions: loc.revisionsIRL.length,
        nbDocuments: locArchives.length,
      });
    }

    manifestBiens.push({
      id: bien.id, nom: bien.nom, slug: bienSlug,
      adresse: bien.adresse, codePostal: bien.codePostal, ville: bien.ville,
      surface: bien.surface, typeBien: bien.typeBien,
      nbDocuments: bienArchives.length,
      locataires: manifestLocs,
    });
  }

  // Audit log JSON (Q3)
  archive.append(JSON.stringify(auditLogs, null, 2), { name: `${root}/audit-log.json` });

  // Manifest (Q5)
  const manifest = {
    version: 1,
    generator: 'openquittance v3.0',
    exportedAt: new Date().toISOString(),
    bailleur: {
      id: bailleur.id,
      nom: bailleur.nom,
      slug: bailleurSlug,
    },
    counts,
    biens: manifestBiens,
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: `${root}/manifest.json` });

  // README arborescence en clair (Q5)
  const readme = [
    `Export OpenQuittance — ${bailleur.nom}`,
    `Date export : ${new Date().toLocaleString('fr-FR')}`,
    '',
    'Arborescence :',
    `  ${bailleurSlug}/`,
    '  ├── manifest.json                metadata machine-readable',
    '  ├── audit-log.json               events horodatés liés au bailleur',
    '  ├── biens/',
    '  │   └── {bien-slug}/',
    '  │       ├── annonce.txt          (si annonce locative générée)',
    '  │       ├── documents/           archives propriétaire (DPE, acte vente, etc.)',
    '  │       └── locataires/',
    '  │           └── {locataire-slug}/',
    '  │               ├── documents/   archives locataire (bail, EDL, etc.)',
    '  │               └── quittances/',
    '  │                   └── {YYYY}/',
    '  │                       └── {YYYY-MM}_quittance.pdf',
    '  └── revisions-irl/               courriers de révision IRL',
    '',
    `Comptes : ${counts.biens} biens · ${counts.locataires} locataires · `
      + `${counts.quittances} quittances · ${counts.archives} documents · `
      + `${counts.revisions} révisions IRL`,
    counts.archivesMissing > 0
      ? `Avertissement : ${counts.archivesMissing} fichier(s) physique(s) manquant(s) (skipés).`
      : '',
    '',
    'Quittances PDF régénérées à l\'export (cohérent avec ce qui est envoyé par email).',
    'Catégories de documents : cf. https://github.com/grx14/quittances-app',
  ].filter(Boolean).join('\n');
  archive.append(readme, { name: `${root}/README.txt` });

  return counts;
}
