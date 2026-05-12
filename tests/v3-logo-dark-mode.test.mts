/**
 * Tests v3.7.0 — fix logo invisible en dark mode.
 *
 * Cause : <img src="/logo-horizontal.svg"> chargeait le SVG comme
 * image externe (document isolé), donc fill="currentColor" dans le
 * SVG ne suivait PAS la couleur du parent React. Logo invisible
 * sur fond sombre.
 *
 * Fix : inline SVG dans React via composants <LogoHorizontal /> +
 * <LogoIcon />. currentColor résout maintenant dans le DOM React
 * → suit Tailwind text-{color} (text-foreground en light/dark).
 *
 * T136a Logo.tsx exporte LogoHorizontal + LogoIcon
 * T136b SVG inline contient currentColor (path + stroke + text)
 * T136c className passe à travers (forwarding pour size + couleur)
 * T136d aria-label sur SVG root + <title> (a11y)
 * T136e Sidebar utilise <LogoHorizontal text-foreground> (plus de <img>)
 * T136f InstallWizard utilise <LogoHorizontal text-foreground>
 * T136g LegalPageView utilise <LogoIcon text-muted-foreground> en footer
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
  // ─── T136a Logo.tsx exists + exports ──────────────────────────────────
  console.log('\n→ T136a Logo.tsx exports LogoHorizontal + LogoIcon');
  const logoPath = path.resolve('src/components/Logo.tsx');
  const logoOk = await fileExists(logoPath);
  assert('T136a1 Logo.tsx présent', logoOk, logoOk ? 'OK' : 'MANQUE');
  if (logoOk) {
    const src = await readFile(logoPath, 'utf-8');
    assert(
      'T136a2 export function LogoHorizontal',
      /export\s+function\s+LogoHorizontal/.test(src),
      'OK',
    );
    assert(
      'T136a3 export function LogoIcon',
      /export\s+function\s+LogoIcon/.test(src),
      'OK',
    );

    // ─── T136b currentColor everywhere ──────────────────────────────────
    console.log('\n→ T136b SVG inline utilise currentColor (fill + stroke + text)');
    const currentColorCount = (src.match(/currentColor/g) ?? []).length;
    assert(
      'T136b1 au moins 8 occurrences de currentColor (2 logos × 4 paths)',
      currentColorCount >= 8,
      `count=${currentColorCount}`,
    );
    assert(
      'T136b2 pas de fill="#" hardcoded (couleur fixe)',
      !/fill="#[0-9a-fA-F]/.test(src),
      'OK',
    );

    // ─── T136c className forwarding ────────────────────────────────────
    console.log('\n→ T136c className forwarding (props → svg)');
    assert(
      'T136c1 LogoHorizontal accepte prop className',
      /LogoHorizontal\([^)]*className/s.test(src),
      'OK',
    );
    assert(
      'T136c2 SVG root reçoit className={className}',
      /className=\{className\}/.test(src),
      'OK',
    );

    // ─── T136d a11y (aria-label + <title>) ─────────────────────────────
    console.log('\n→ T136d a11y aria-label + <title>');
    assert(
      'T136d1 SVG role="img" + aria-label',
      src.includes('role="img"')
        && src.includes('aria-label'),
      'OK',
    );
    assert(
      'T136d2 <title> tag présent (screen readers fallback)',
      /<title>/.test(src),
      'OK',
    );
  }

  // ─── T136e Sidebar utilise LogoHorizontal ────────────────────────────
  console.log('\n→ T136e Sidebar utilise <LogoHorizontal text-foreground>');
  const sidebar = await readFile(
    path.resolve('src/components/layout/Sidebar.tsx'),
    'utf-8',
  );
  assert(
    'T136e1 import LogoHorizontal',
    sidebar.includes("from '@/components/Logo'")
      && sidebar.includes('LogoHorizontal'),
    'OK',
  );
  assert(
    'T136e2 <LogoHorizontal className=...text-foreground />',
    /<LogoHorizontal[^/]*text-foreground/.test(sidebar),
    'OK',
  );
  assert(
    'T136e3 plus de <img src="/logo-horizontal.svg" /> dans Sidebar',
    !sidebar.includes('logo-horizontal.svg'),
    'OK',
  );

  // ─── T136f InstallWizard utilise LogoHorizontal ──────────────────────
  console.log('\n→ T136f InstallWizard utilise <LogoHorizontal>');
  const wizard = await readFile(
    path.resolve('src/app/install/InstallWizard.tsx'),
    'utf-8',
  );
  assert(
    'T136f1 import LogoHorizontal',
    wizard.includes("from '@/components/Logo'"),
    'OK',
  );
  assert(
    'T136f2 <LogoHorizontal className=...text-foreground />',
    /<LogoHorizontal[^/]*text-foreground/.test(wizard),
    'OK',
  );
  assert(
    'T136f3 plus de <img src="/logo-horizontal.svg" /> dans wizard',
    !wizard.includes('logo-horizontal.svg'),
    'OK',
  );

  // ─── T136g LegalPageView utilise LogoIcon ────────────────────────────
  console.log('\n→ T136g LegalPageView footer <LogoIcon text-muted-foreground>');
  const legal = await readFile(
    path.resolve('src/components/LegalPageView.tsx'),
    'utf-8',
  );
  assert(
    'T136g1 import LogoIcon',
    legal.includes("from '@/components/Logo'")
      && legal.includes('LogoIcon'),
    'OK',
  );
  assert(
    'T136g2 <LogoIcon className=...text-muted-foreground />',
    /<LogoIcon[^/]*text-muted-foreground/.test(legal),
    'OK',
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.7.0 logo-dark-mode ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.7.0 logo-dark-mode passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
