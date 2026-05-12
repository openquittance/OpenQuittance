/**
 * Seed initial des BailleurMembership (cf. docs/MULTI-BAILLEUR.md).
 *
 * Heuristique : pour chaque User staff (role ∈ {ADMIN, MEMBER, VIEWER})
 * existant, on crée 1 membership par Bailleur existant, avec
 * `membership.role = user.role`.
 *
 * Justification : avant Lot C bis, l'isolation server-side n'existe pas.
 * Tout staff a accès à tout. La migration acte cet état de fait sans
 * élargir les droits. L'admin app peut ensuite trier dans Paramètres >
 * Membres (UI Lot D ou rc4 ultérieur).
 *
 * Idempotent : on `upsert` les memberships, donc on peut relancer sans
 * danger. Le compteur final indique combien de memberships existent
 * après run.
 *
 * Usage :
 *   npx tsx scripts/seed-memberships.mts
 *   DRY_RUN=1 npx tsx scripts/seed-memberships.mts   (n'écrit rien, log seulement)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === '1';

async function main() {
  const staff = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'MEMBER', 'VIEWER'] },
      disabledAt: null,
      // Defense in depth : exclure tout user lié à un Locataire via
      // tenantUserId. Si un TENANT est promu staff par accident, le seed
      // ne lui crée PAS de memberships (cf. rc3 fix).
      locatairesAccessibles: { none: {} },
    },
    select: { id: true, email: true, role: true },
  });
  const bailleurs = await prisma.bailleur.findMany({ select: { id: true, nom: true } });

  console.log(`→ ${staff.length} user(s) staff actifs`);
  console.log(`→ ${bailleurs.length} bailleur(s) existant(s)`);
  console.log(`→ ${staff.length * bailleurs.length} membership(s) potentiel(s)`);

  if (DRY_RUN) {
    console.log('\n[DRY_RUN] aucun écrit en DB. Aperçu :');
    for (const u of staff) {
      for (const b of bailleurs) {
        console.log(`  - ${u.email} → ${b.nom} (role=${u.role})`);
      }
    }
    return;
  }

  let created = 0;
  let existed = 0;
  for (const u of staff) {
    for (const b of bailleurs) {
      try {
        await prisma.bailleurMembership.create({
          data: { userId: u.id, bailleurId: b.id, role: u.role },
        });
        created++;
      } catch (e) {
        const err = e as { code?: string };
        if (err.code === 'P2002') existed++;
        else throw e;
      }
    }
  }

  const total = await prisma.bailleurMembership.count();
  console.log(`\n✓ ${created} membership(s) créé(s), ${existed} déjà présent(s)`);
  console.log(`→ ${total} membership(s) en DB au total`);

  // Sanity check : aucun staff sans membership (sauf 0 bailleur)
  if (bailleurs.length > 0) {
    const orphans = await prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'MEMBER', 'VIEWER'] },
        disabledAt: null,
        memberships: { none: {} },
      },
      select: { email: true, role: true },
    });
    if (orphans.length > 0) {
      console.error(`\n✗ ${orphans.length} staff sans membership (anomalie) :`);
      for (const o of orphans) console.error(`  - ${o.email} (${o.role})`);
      process.exit(1);
    }
    console.log('✓ Tous les staff ont au moins 1 membership');
  }
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
}).then(async () => {
  await prisma.$disconnect();
});
