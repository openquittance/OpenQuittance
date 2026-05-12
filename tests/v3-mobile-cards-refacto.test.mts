/**
 * Tests v3.6.2 hotfix — refacto 5 pages staff tables → cards mobile.
 *
 * User : "le trade-off scroll horizontal v3.6.0 est pas terrible UX
 * réelle". Refacto pour chaque page staff avec table : desktop
 * (≥md) table classique, mobile (<md) cards lisibles, 1 carte
 * par row, infos clés + actions touch-friendly.
 *
 * Pages refactorées :
 * - /bailleurs : carte nom + couleur PDF + Modifier/Supprimer
 * - /biens : carte nom + adresse + ville + nb locataires + actions
 * - /locataires : carte nom + bien + loyer total + email + actions
 * - /quittances : carte locataire + période + montant + statuts +
 *   6 actions (Aperçu, PDF, Édit, Email, Envoyer, Suppr)
 * - /parametres/membres : carte par membership (nom + email + rôle
 *   select) + carte par invitation pending (email + bailleur +
 *   renvoyer/annuler)
 *
 * T135a /bailleurs : hidden md:block table + md:hidden ul cards
 * T135b /biens : idem
 * T135c /locataires : idem
 * T135d /quittances : idem
 * T135e /parametres/membres : idem (memberships) + idem (invitations)
 *
 * Pure file checks.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

function hasDesktopTable(src: string): boolean {
  // Pattern : <div className="hidden md:block ..."> contenant <table ...>
  return /<div\s+className="hidden md:block[\s\S]+?<table\s+className="table-base"/.test(src);
}

function hasMobileCards(src: string): boolean {
  // Pattern : <ul className="md:hidden ..."> ou <div className="md:hidden ...">
  return /<ul\s+className="md:hidden\s+space-y-3"/.test(src);
}

async function check(file: string, page: string, prefix: string) {
  console.log(`\n→ ${prefix} ${page}`);
  const src = await readFile(path.resolve(file), 'utf-8');
  assert(
    `${prefix}1 ${page} : table desktop (hidden md:block + table.table-base)`,
    hasDesktopTable(src),
    'OK',
  );
  assert(
    `${prefix}2 ${page} : cards mobile (ul.md:hidden.space-y-3)`,
    hasMobileCards(src),
    'OK',
  );
  // Régression : .table-wrap (scroll horizontal) doit disparaître
  // de ces 5 pages (remplacé par cards mobile).
  assert(
    `${prefix}3 ${page} : plus de .table-wrap (refacto cards)`,
    !src.includes('table-wrap'),
    'OK',
  );
}

async function main() {
  await check('src/app/bailleurs/page.tsx', '/bailleurs', 'T135a');
  await check('src/app/biens/page.tsx', '/biens', 'T135b');
  await check('src/app/locataires/page.tsx', '/locataires', 'T135c');
  await check('src/app/quittances/page.tsx', '/quittances', 'T135d');
  await check('src/app/parametres/membres/page.tsx', '/parametres/membres', 'T135e');

  // /parametres/membres a 2 tables (memberships + invitations) → 2 cards lists.
  const membres = await readFile(
    path.resolve('src/app/parametres/membres/page.tsx'),
    'utf-8',
  );
  // Compte occurrences "md:hidden space-y-3" (au moins 2 — memberships + invitations).
  const matches = membres.match(/md:hidden\s+space-y-3/g) ?? [];
  assert(
    'T135e4 /parametres/membres : 2 cards lists (memberships + invitations pending)',
    matches.length >= 2,
    `count=${matches.length}`,
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.6.2 mobile-cards-refacto ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.6.2 mobile-cards-refacto passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
