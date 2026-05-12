/**
 * Sanitize : restore la cohérence User.role + BailleurMembership pour les
 * users qui sont liés à un Locataire (`Locataire.tenantUserId` = id user).
 *
 * Source of truth : la relation Locataire → User. Si un User est lié à un
 * Locataire, il EST TENANT par construction. Si son `role` en DB n'est pas
 * 'TENANT' OU s'il a des memberships, c'est une corruption héritée
 * (faille rc1/rc2 corrigée en rc3 mais l'état corrompu pré-rc3 reste en DB).
 *
 * Idempotent : un re-run sur DB déjà clean = no-op.
 *
 * Lancé au démarrage container via `scripts/bootstrap.mjs` AVANT le seed
 * memberships pour garantir l'ordre : sanitize → seed.
 *
 * Usage standalone : npx tsx scripts/sanitize-tenant-users.mts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('→ Sanitize : restore User.role=TENANT + purge memberships pour users liés à Locataire');

  const corrupted = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'MEMBER', 'VIEWER'] },
      locatairesAccessibles: { some: {} },
    },
    select: { id: true, email: true, role: true },
  });

  if (corrupted.length === 0) {
    console.log('  ✓ aucun user corrompu trouvé (clean)');
    await prisma.$disconnect();
    return;
  }

  for (const u of corrupted) {
    console.log(`  • ${u.email} (id=${u.id}) role=${u.role} → restore TENANT + purge memberships`);
  }

  const ids = corrupted.map(u => u.id);
  const purged = await prisma.bailleurMembership.deleteMany({
    where: { userId: { in: ids } },
  });
  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { role: 'TENANT' },
  });

  console.log(`  ✓ ${corrupted.length} user(s) corrompu(s) restaurés en TENANT, ${purged.count} membership(s) purgée(s)`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('[sanitize] erreur :', e);
  await prisma.$disconnect();
  process.exit(1);
});
