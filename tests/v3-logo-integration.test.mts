/**
 * Tests v3.4.0-rc1 — intégration logo officiel OpenQuittance.
 *
 * 3 fichiers SVG dans public/ :
 * - favicon.svg (32×32 bleu fixe pour onglet navigateur)
 * - logo.svg (icône monochrome currentColor)
 * - logo-horizontal.svg (icône + texte 280×64)
 *
 * Référencés dans :
 * - src/app/layout.tsx : metadata.icons (favicon + logo)
 * - src/components/layout/Sidebar.tsx : header brand
 * - src/app/install/InstallWizard.tsx : header wizard
 *
 * T130a fichiers SVG présents dans public/
 * T130b layout.tsx référence /favicon.svg + /logo.svg dans metadata
 * T130c Sidebar.tsx référence /logo-horizontal.svg
 * T130d InstallWizard.tsx référence /logo-horizontal.svg
 * T130e Sidebar conserve sr-only fallback texte "OpenQuittance"
 *
 * Pure file checks.
 */

import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  // ─── T130a fichiers SVG présents dans public/ ─────────────────────────
  console.log('\n→ T130a fichiers SVG logo présents dans public/');
  for (const f of ['favicon.svg', 'logo.svg', 'logo-horizontal.svg']) {
    const ok = await fileExists(path.resolve('public', f));
    assert(`T130a public/${f} présent`, ok, ok ? 'OK' : 'MANQUE');
  }

  // ─── T130b layout.tsx référence icons ─────────────────────────────────
  console.log('\n→ T130b layout.tsx metadata.icons référence /favicon.svg + /logo.svg');
  const layoutSrc = await readFile(path.resolve('src/app/layout.tsx'), 'utf-8');
  assert(
    'T130b1 layout.tsx metadata.icons.icon contient /favicon.svg',
    layoutSrc.includes("'/favicon.svg'")
      && layoutSrc.includes('image/svg+xml'),
    'OK',
  );
  assert(
    'T130b2 layout.tsx metadata.icons.apple référencé',
    layoutSrc.includes('apple:')
      && layoutSrc.includes("'/logo.svg'"),
    'OK',
  );

  // ─── T130c Sidebar référence /logo-horizontal.svg ─────────────────────
  console.log('\n→ T130c Sidebar.tsx référence /logo-horizontal.svg');
  const sidebarSrc = await readFile(
    path.resolve('src/components/layout/Sidebar.tsx'),
    'utf-8',
  );
  assert(
    'T130c1 Sidebar.tsx contient img /logo-horizontal.svg',
    sidebarSrc.includes('src="/logo-horizontal.svg"')
      && sidebarSrc.includes('alt="OpenQuittance"'),
    'OK',
  );
  assert(
    'T130c2 Sidebar conserve fallback sr-only "OpenQuittance"',
    sidebarSrc.includes('sr-only')
      && sidebarSrc.match(/sr-only[^"]*">OpenQuittance/) !== null,
    'OK',
  );

  // ─── T130d InstallWizard référence /logo-horizontal.svg ──────────────
  console.log('\n→ T130d InstallWizard.tsx référence /logo-horizontal.svg');
  const wizardSrc = await readFile(
    path.resolve('src/app/install/InstallWizard.tsx'),
    'utf-8',
  );
  assert(
    'T130d InstallWizard contient img /logo-horizontal.svg en header',
    wizardSrc.includes('src="/logo-horizontal.svg"')
      && wizardSrc.includes('alt="OpenQuittance"'),
    'OK',
  );

  // ─── T130e portail UI inchangée (pas de logo OpenQuittance) ──────────
  console.log('\n→ T130e portail locataire INCHANGÉ (logo bailleur prio)');
  // Les pages /portail ne doivent PAS référencer logo-horizontal.svg
  // (logo bailleur en priorité, fallback FileText icon).
  const portailFiles = [
    'src/app/portail/page.tsx',
    'src/app/portail/quittances/page.tsx',
    'src/app/portail/documents/page.tsx',
  ];
  for (const f of portailFiles) {
    if (!(await fileExists(path.resolve(f)))) continue;
    const src = await readFile(path.resolve(f), 'utf-8');
    assert(
      `T130e ${path.basename(path.dirname(f))} pas de référence /logo-horizontal.svg (régression)`,
      !src.includes('/logo-horizontal.svg'),
      src.includes('/logo-horizontal.svg') ? 'INDÉSIRABLE' : 'OK',
    );
  }

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.4.0-rc1 logo-integration ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.4.0-rc1 logo-integration passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
