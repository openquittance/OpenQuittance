/**
 * Tests v3.6.2 hotfix — overflow horizontal mobile.
 *
 * Symptôme user iOS : dashboard décalé droite, titres coupés gauche
 * ("ableau de bord" T coupé, "I GPGA — Mai 2026" SC coupé, footer
 * "ntions légales" M coupé). Cause : tables w-full (sans
 * .table-wrap) avec contenu intrinsèquement large forçaient main
 * width > viewport → body scroll horizontal.
 *
 * Fix multi-couches :
 * 1. globals.css : html/body overflow-x: hidden + max-width: 100vw
 *    (safety net global).
 * 2. AppShell : min-w-0 sur main flex-1 + sur div enfant (permet
 *    shrink en dessous largeur intrinsèque enfants).
 * 3. Dashboard : table wrappée hidden md:block + cards md:hidden.
 *
 * T134a globals.css overflow-x: hidden + max-width: 100vw
 * T134b AppShell main flex-1 min-w-0
 * T134c Dashboard table : hidden md:block + cards md:hidden
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

async function main() {
  // ─── T134a globals.css overflow-x: hidden ─────────────────────────────
  console.log('\n→ T134a globals.css html/body overflow-x: hidden + max-width: 100vw');
  const css = await readFile(path.resolve('src/app/globals.css'), 'utf-8');
  assert(
    'T134a1 html, body overflow-x: hidden',
    /html,\s*body\s*\{[^}]*overflow-x:\s*hidden/.test(css),
    'OK',
  );
  assert(
    'T134a2 html, body max-width: 100vw',
    /html,\s*body\s*\{[^}]*max-width:\s*100vw/.test(css),
    'OK',
  );
  assert(
    'T134a3 commentaire v3.6.2 documente cause',
    css.includes('v3.6.2')
      && /scroll[\s\S]+?horizontal/.test(css),
    'OK',
  );

  // ─── T134b AppShell min-w-0 ───────────────────────────────────────────
  console.log('\n→ T134b AppShell main flex-1 min-w-0');
  const shell = await readFile(
    path.resolve('src/components/layout/AppShell.tsx'),
    'utf-8',
  );
  assert(
    'T134b1 <main> a flex-1 + min-w-0',
    /<main[^>]*className="[^"]*flex-1[^"]*min-w-0/.test(shell),
    'OK',
  );
  assert(
    'T134b2 div enfant a min-w-0 (children wrapper)',
    /<div[^>]*className="[^"]*flex-1[^"]*min-w-0/.test(shell),
    'OK',
  );

  // ─── T134c Dashboard table responsive ────────────────────────────────
  console.log('\n→ T134c Dashboard table : hidden md:block + cards md:hidden');
  const dash = await readFile(path.resolve('src/app/Dashboard.tsx'), 'utf-8');
  // Recherche bloc table : <div className="hidden md:block"><table className="table-base">
  assert(
    'T134c1 Dashboard table wrappée hidden md:block',
    /<div\s+className="hidden md:block"[\s\S]+?<table\s+className="table-base"/.test(dash),
    'OK',
  );
  assert(
    'T134c2 Dashboard cards mobile md:hidden',
    /<ul\s+className="md:hidden\s+space-y-2"/.test(dash),
    'OK',
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.6.2 mobile-overflow-fix ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.6.2 mobile-overflow-fix passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
