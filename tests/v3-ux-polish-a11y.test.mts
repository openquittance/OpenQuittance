/**
 * Tests v3.7.0 — UX polish + A11y (Vague C originalement skippée).
 *
 * T137a Spinner.tsx existe + animate-spin + currentColor + aria-label
 * T137b BailleurForm utilise Spinner (showcase pattern loading)
 * T137c Sidebar burger button : aria-label + aria-expanded
 * T137d Modal X close button : aria-label="Fermer"
 * T137e Boutons icon-only staff CRUD : aria-label (Pencil + Trash2)
 *       - /bailleurs Pencil + Trash2
 *       - /biens Pencil + Trash2
 *       - /locataires Pencil + Trash2
 *       - /quittances Eye + Download + Pencil + Send + Mail + Trash2
 * T137f Wizards install + biens : animate-in fade-in slide-in transitions
 * T137g Toast convention : utilise sonner partout (pas custom)
 * T137h EmptyState component dispo (déjà existant)
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
  // ─── T137a Spinner.tsx ────────────────────────────────────────────────
  console.log('\n→ T137a Spinner.tsx présent + animate-spin + currentColor + aria-label');
  const spinnerPath = path.resolve('src/components/Spinner.tsx');
  const spinnerOk = await fileExists(spinnerPath);
  assert('T137a1 Spinner.tsx présent', spinnerOk, 'OK');
  if (spinnerOk) {
    const src = await readFile(spinnerPath, 'utf-8');
    assert(
      'T137a2 export function Spinner + animate-spin + currentColor',
      /export\s+function\s+Spinner/.test(src)
        && src.includes('animate-spin')
        && src.includes('currentColor'),
      'OK',
    );
    assert(
      'T137a3 role="status" + aria-label (a11y)',
      src.includes('role="status"')
        && src.includes('aria-label'),
      'OK',
    );
  }

  // ─── T137b BailleurForm utilise Spinner (showcase pattern) ────────────
  console.log('\n→ T137b BailleurForm utilise Spinner');
  const bailleurs = await readFile(
    path.resolve('src/app/bailleurs/page.tsx'),
    'utf-8',
  );
  assert(
    'T137b1 import Spinner depuis @/components/Spinner',
    bailleurs.includes("from '@/components/Spinner'"),
    'OK',
  );
  assert(
    'T137b2 <Spinner /> rendu conditionnel sur saving',
    /\{saving\s*&&\s*<Spinner/.test(bailleurs),
    'OK',
  );

  // ─── T137c Sidebar burger button aria ────────────────────────────────
  console.log('\n→ T137c Sidebar burger button aria-label + aria-expanded');
  const sidebar = await readFile(
    path.resolve('src/components/layout/Sidebar.tsx'),
    'utf-8',
  );
  // Burger ouvre menu
  assert(
    'T137c1 burger (Menu icon) aria-label + aria-expanded',
    /aria-label="Ouvrir le menu"[\s\S]+?aria-expanded/.test(sidebar),
    'OK',
  );
  assert(
    'T137c2 bouton fermer drawer mobile aria-label',
    /onClick=\{[^}]*setOpen\(false\)\}[\s\S]{0,200}aria-label="Fermer le menu"/.test(sidebar),
    'OK',
  );

  // ─── T137d Modal close button aria-label ─────────────────────────────
  console.log('\n→ T137d Modal close button aria-label="Fermer"');
  const modal = await readFile(
    path.resolve('src/components/Modal.tsx'),
    'utf-8',
  );
  assert(
    'T137d Modal X close aria-label="Fermer"',
    modal.includes('aria-label="Fermer"'),
    'OK',
  );

  // ─── T137e Icon-only staff CRUD aria-label ───────────────────────────
  console.log('\n→ T137e Boutons icon-only staff CRUD : aria-label');
  const pages: Array<[string, string[]]> = [
    ['src/app/bailleurs/page.tsx', ['Modifier le bailleur', 'Supprimer le bailleur']],
    ['src/app/biens/page.tsx', ['Modifier le bien', 'Supprimer le bien']],
    ['src/app/locataires/page.tsx', ['Modifier le locataire', 'Supprimer le locataire']],
    ['src/app/quittances/page.tsx', ['Aperçu PDF', 'Télécharger PDF', 'Modifier la quittance', 'Aperçu email', 'Envoyer email', 'Supprimer la quittance']],
  ];
  for (const [file, labels] of pages) {
    const src = await readFile(path.resolve(file), 'utf-8');
    for (const label of labels) {
      assert(
        `T137e ${file.replace('src/app/', '').replace('/page.tsx', '')} aria-label="${label}"`,
        src.includes(`aria-label="${label}"`),
        'OK',
      );
    }
  }

  // ─── T137f Wizard transitions ─────────────────────────────────────────
  console.log('\n→ T137f Wizards install + biens animate-in transitions');
  const installW = await readFile(
    path.resolve('src/app/install/InstallWizard.tsx'),
    'utf-8',
  );
  const installSteps = (installW.match(/animate-in\s+fade-in\s+slide-in/g) ?? []).length;
  assert(
    'T137f1 InstallWizard : 3 steps animate-in',
    installSteps >= 3,
    `count=${installSteps}`,
  );
  const bienW = await readFile(
    path.resolve('src/app/biens/wizard/page.tsx'),
    'utf-8',
  );
  const bienSteps = (bienW.match(/animate-in\s+fade-in\s+slide-in/g) ?? []).length;
  assert(
    'T137f2 BienWizard : 4 steps animate-in',
    bienSteps >= 4,
    `count=${bienSteps}`,
  );

  // ─── T137g Toast convention sonner ────────────────────────────────────
  console.log('\n→ T137g Toast convention : sonner partout');
  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf-8'));
  assert(
    'T137g1 sonner dans dependencies',
    typeof pkg.dependencies?.sonner === 'string',
    `version=${pkg.dependencies?.sonner}`,
  );
  // Vérifie qu'on n'utilise pas react-hot-toast OU toast custom
  // (regression cosmétique).
  assert(
    "T137g2 pas de react-hot-toast (concurrent)",
    !pkg.dependencies?.['react-hot-toast'],
    'OK',
  );

  // ─── T137h EmptyState dispo ───────────────────────────────────────────
  console.log('\n→ T137h EmptyState component dispo');
  const emptyPath = path.resolve('src/components/EmptyState.tsx');
  const emptyOk = await fileExists(emptyPath);
  assert('T137h1 EmptyState.tsx présent', emptyOk, 'OK');
  if (emptyOk) {
    const src = await readFile(emptyPath, 'utf-8');
    assert(
      'T137h2 EmptyState export default + props { icon, title, description, action }',
      src.includes('export default function EmptyState')
        && src.includes('icon: Icon')
        && src.includes('title')
        && src.includes('action'),
      'OK',
    );
  }

  // ─── T137i package.json version >= 3.7.0 ─────────────────────────────
  console.log('\n→ T137i package.json version >= 3.7.0');
  assert(
    'T137i package.json version >= "3.7.0"',
    typeof pkg.version === 'string' && /^3\.(7|[89]|\d{2,})\.\d+$/.test(pkg.version),
    `version=${pkg.version}`,
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.7.0 ux-polish-a11y ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.7.0 ux-polish-a11y passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
