/**
 * Tests v3.0.0-rc2 — open source readiness GitHub.
 *
 * T75 .github/SECURITY.md existe + contient "responsible disclosure"
 * T76 CHANGELOG.md existe + contient "v3.0.0-rc1"
 * T77 CONTRIBUTING.md existe + sections requises (install, tests, PR)
 *
 * Pure file checks, pas besoin de stack HTTP.
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
  // T75 SECURITY.md
  console.log('\n→ T75 .github/SECURITY.md');
  const secPath = path.resolve('.github/SECURITY.md');
  const t75exists = await fileExists(secPath);
  let t75content = '';
  if (t75exists) t75content = await readFile(secPath, 'utf-8');
  // Texte FR : "divulgation responsable" est l'équivalent
  const t75ok = t75exists
    && (t75content.toLowerCase().includes('responsible disclosure')
        || t75content.toLowerCase().includes('divulgation responsable'))
    && t75content.includes('48 h') // délai accusé de réception
    && t75content.includes('Versions supportées');
  assert(
    'T75 SECURITY.md existe + divulgation responsable + délai 48h + versions supportées',
    t75ok,
    `exists=${t75exists} len=${t75content.length}`,
  );

  // T76 CHANGELOG.md
  console.log('\n→ T76 CHANGELOG.md');
  const clPath = path.resolve('CHANGELOG.md');
  const t76exists = await fileExists(clPath);
  let t76content = '';
  if (t76exists) t76content = await readFile(clPath, 'utf-8');
  const t76ok = t76exists
    && t76content.includes('v3.0.0-rc1')
    && t76content.includes('v3.0.0-rc2')
    && t76content.includes('Keep a Changelog')
    && t76content.includes('## [2.4.0]');
  assert(
    'T76 CHANGELOG.md existe + format Keep a Changelog + entrées v2.4 → v3.0',
    t76ok,
    `exists=${t76exists} len=${t76content.length}`,
  );

  // T77 CONTRIBUTING.md
  console.log('\n→ T77 CONTRIBUTING.md');
  const contribPath = path.resolve('CONTRIBUTING.md');
  const t77exists = await fileExists(contribPath);
  let t77content = '';
  if (t77exists) t77content = await readFile(contribPath, 'utf-8');
  const t77ok = t77exists
    && t77content.includes('## Setup dev')
    && t77content.includes('## Lancer les tests')
    && t77content.includes('## Process PR')
    && t77content.includes('Conventional Commits')
    && t77content.includes('CODE_OF_CONDUCT');
  assert(
    'T77 CONTRIBUTING.md existe + sections Setup dev + Tests + Process PR + Conventional Commits',
    t77ok,
    `exists=${t77exists} len=${t77content.length}`,
  );

  // Bonus : vérif présence templates
  console.log('\n→ Bonus : présence templates GitHub');
  const templates = [
    '.github/ISSUE_TEMPLATE/bug_report.md',
    '.github/ISSUE_TEMPLATE/feature_request.md',
    '.github/ISSUE_TEMPLATE/config.yml',
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.github/CODE_OF_CONDUCT.md',
    '.github/workflows/ci.yml',
    'docs/INSTALL.md',
    'docs/UPGRADE.md',
    'docs/BACKUP.md',
  ];
  let allOk = true;
  for (const t of templates) {
    const ok = await fileExists(path.resolve(t));
    if (!ok) allOk = false;
    console.log(`  ${ok ? '✓' : '✗'} ${t}`);
  }
  assert(`Templates GitHub + docs INSTALL/UPGRADE/BACKUP présents`, allOk);

  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.0.0-rc2 GitHub readiness ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.0.0-rc2 GitHub readiness passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
