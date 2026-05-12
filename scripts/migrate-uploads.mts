/**
 * Migration uploads logo/signature : `<userId>/<filename>` →
 * `bailleurs/<bailleurId>/<kind>-<timestamp>.<ext>`.
 *
 * Avant Lot C bis, les logos/signatures étaient stockés sous `<userId>/...`.
 * Ce layout ne permet pas de scope multi-bailleur cleanly. On déplace
 * vers `bailleurs/<bailleurId>/...` et on update Bailleur.{logoUrl,signatureUrl}.
 *
 * Idempotent : si un Bailleur a déjà un path `bailleurs/...`, on skip.
 *
 * Usage :
 *   UPLOADS_DIR=/path/to/uploads npx tsx scripts/migrate-uploads.mts
 *   DRY_RUN=1 ... pour preview sans toucher.
 */

import { PrismaClient } from '@prisma/client';
import { rename, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === '1';
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function migrateOne(
  bailleurId: string,
  oldRel: string | null,
  kind: 'logo' | 'signature',
): Promise<string | null> {
  if (!oldRel) return null;
  if (oldRel.startsWith('bailleurs/')) {
    console.log(`  [skip] ${kind} déjà migré (${oldRel})`);
    return oldRel;
  }
  const oldAbs = path.join(UPLOADS_DIR, oldRel.replace(/^\/?(uploads\/)?/, ''));
  if (!(await fileExists(oldAbs))) {
    console.log(`  [warn] ${kind} fichier physique manquant (${oldAbs}), update DB seulement`);
    return null;
  }
  const ext = path.extname(oldRel) || '.png';
  const newRel = `bailleurs/${bailleurId}/${kind}-${Date.now()}${ext}`;
  const newAbs = path.join(UPLOADS_DIR, newRel);
  if (DRY_RUN) {
    console.log(`  [dry] ${oldRel} → ${newRel}`);
    return newRel;
  }
  await mkdir(path.dirname(newAbs), { recursive: true });
  await rename(oldAbs, newAbs);
  console.log(`  ✓ ${oldRel} → ${newRel}`);
  return newRel;
}

async function main() {
  const bailleurs = await prisma.bailleur.findMany({
    where: { OR: [{ logoUrl: { not: null } }, { signatureUrl: { not: null } }] },
    select: { id: true, nom: true, logoUrl: true, signatureUrl: true },
  });

  console.log(`→ ${bailleurs.length} bailleur(s) avec assets uploadés`);

  for (const b of bailleurs) {
    console.log(`\n• ${b.nom} (${b.id})`);
    const newLogo = await migrateOne(b.id, b.logoUrl, 'logo');
    const newSig = await migrateOne(b.id, b.signatureUrl, 'signature');
    if (DRY_RUN) continue;
    if (newLogo !== b.logoUrl || newSig !== b.signatureUrl) {
      await prisma.bailleur.update({
        where: { id: b.id },
        data: { logoUrl: newLogo, signatureUrl: newSig },
      });
    }
  }

  console.log(DRY_RUN ? '\n[DRY_RUN] aucun changement écrit.' : '\n✓ Migration terminée.');
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
}).then(async () => {
  await prisma.$disconnect();
});
