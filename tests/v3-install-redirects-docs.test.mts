/**
 * Tests v3.3.0 GA — Phase 4 Session 2 : redirects auto + docs.
 *
 * T126a `/` (Server Component) appelle hasAnyAdmin + redirect /install
 * T126b `/login` (Server Component) appelle hasAnyAdmin + redirect /install
 * T126c `/install` (Server Component) appelle hasAnyAdmin + redirect /login
 * T126d docs/INSTALL.md contient section "Première installation via wizard web"
 * T126e package.json version 3.3.0 (GA)
 *
 * Pure file checks — pas de stack HTTP / DB.
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
  // ─── T126a / Server Component redirect /install ───────────────────────
  console.log('\n→ T126a / (root page) Server Component redirect logic');
  const rootPagePath = path.resolve('src/app/page.tsx');
  const rootPageSrc = await readFile(rootPagePath, 'utf-8');
  assert(
    'T126a1 src/app/page.tsx import hasAnyAdmin + redirect',
    rootPageSrc.includes('hasAnyAdmin')
      && rootPageSrc.includes('redirect')
      && rootPageSrc.includes("redirect('/install')"),
    'OK',
  );
  assert(
    'T126a2 src/app/page.tsx render Dashboard (Client component)',
    rootPageSrc.includes('Dashboard')
      && rootPageSrc.includes("import Dashboard from './Dashboard'"),
    'OK',
  );
  // Le Dashboard.tsx existe avec 'use client'
  const dashboardSrc = await readFile(path.resolve('src/app/Dashboard.tsx'), 'utf-8');
  assert(
    'T126a3 Dashboard.tsx Client Component (use client)',
    dashboardSrc.includes("'use client'")
      && dashboardSrc.includes('export default function Dashboard'),
    'OK',
  );

  // ─── T126b /login Server Component redirect /install ──────────────────
  console.log('\n→ T126b /login Server Component redirect /install si !hasAnyAdmin');
  const loginPagePath = path.resolve('src/app/login/page.tsx');
  const loginPageSrc = await readFile(loginPagePath, 'utf-8');
  assert(
    'T126b1 /login/page.tsx import hasAnyAdmin + redirect /install',
    loginPageSrc.includes('hasAnyAdmin')
      && loginPageSrc.includes("redirect('/install')"),
    'OK',
  );
  assert(
    'T126b2 /login/LoginForm.tsx Client Component (use client)',
    (await readFile(path.resolve('src/app/login/LoginForm.tsx'), 'utf-8')).includes("'use client'"),
    'OK',
  );

  // ─── T126c /install Server Component redirect /login si hasAnyAdmin ──
  console.log('\n→ T126c /install Server Component redirect /login si hasAnyAdmin');
  const installPagePath = path.resolve('src/app/install/page.tsx');
  const installPageSrc = await readFile(installPagePath, 'utf-8');
  assert(
    'T126c1 /install/page.tsx redirect /login si hasAnyAdmin true',
    installPageSrc.includes('hasAnyAdmin')
      && installPageSrc.includes("redirect('/login')")
      && installPageSrc.includes('if (hasAdmin)'),
    'OK',
  );

  // ─── T126d docs/INSTALL.md section wizard web ─────────────────────────
  console.log('\n→ T126d docs/INSTALL.md section wizard web');
  const installDocs = await readFile(path.resolve('docs/INSTALL.md'), 'utf-8');
  assert(
    'T126d1 INSTALL.md contient "Première installation via wizard web"',
    installDocs.includes('Première installation via wizard web'),
    'OK',
  );
  assert(
    'T126d2 INSTALL.md détaille 3 étapes (Admin + Bailleur + Done)',
    installDocs.includes('Étape 1 — Compte administrateur')
      && installDocs.includes('Étape 2 — Premier bailleur')
      && installDocs.includes("Étape 3 — C'est prêt"),
    'OK',
  );
  assert(
    'T126d3 INSTALL.md mention secrets faibles + openssl rand',
    installDocs.includes('Détection des secrets faibles')
      && installDocs.includes('openssl rand'),
    'OK',
  );

  // ─── T126e CHANGELOG entrée [3.3.0] GA ────────────────────────────────
  console.log('\n→ T126e CHANGELOG entrée [3.3.0] GA');
  const changelog = await readFile(path.resolve('CHANGELOG.md'), 'utf-8');
  assert(
    'T126e CHANGELOG contient "## [3.3.0]" GA + Setup wizard',
    changelog.includes('## [3.3.0]')
      && changelog.includes('GA')
      && changelog.includes('Setup wizard'),
    'OK',
  );

  // ─── T126f package.json version >= 3.3.0 GA ───────────────────────────
  console.log('\n→ T126f package.json version >= 3.3.0 GA (pas RC)');
  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf-8'));
  assert(
    'T126f package.json version 3.3.x GA (pas suffixe -rc)',
    typeof pkg.version === 'string'
      && /^3\.[3-9]\.\d+$/.test(pkg.version),
    `version=${pkg.version}`,
  );

  // ─── T126g recovery flow wizard (signin err banner) ───────────────────
  console.log('\n→ T126g wizard recovery flow signin err banner');
  const wizardSrc = await readFile(path.resolve('src/app/install/InstallWizard.tsx'), 'utf-8');
  assert(
    'T126g wizard contient adminCreatedPendingSignin flag + banner orange',
    wizardSrc.includes('adminCreatedPendingSignin')
      && wizardSrc.includes('connexion automatique')
      && wizardSrc.includes('connectez-vous manuellement'),
    'OK',
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.3.0 GA install-redirects-docs ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.3.0 GA install-redirects-docs passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
