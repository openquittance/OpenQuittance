/**
 * Tests v3.2.0 GA — Phase 3 Session 4 : régression docs.
 *
 * Vérifie que les docs sont cohérentes avec la migration v3.2.0
 * (Google OAuth credentials du .env vers DB/UI).
 *
 * T123a .env.example marque GOOGLE_CLIENT_ID/SECRET deprecated
 * T123b CHANGELOG.md contient entrée [3.2.0]
 * T123c docs/UPGRADE.md contient section "v3.1.0 → v3.2.0"
 * T123d docs/INSTALL.md mentionne "Paramètres > Intégrations"
 * T123e package.json version 3.2.0 (GA, pas RC)
 *
 * Pure file checks, pas besoin de stack HTTP.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // ─── T123a .env.example deprecation ───────────────────────────────────
  console.log('\n→ T123a .env.example marque GOOGLE_CLIENT_ID/SECRET deprecated');
  const envExample = await readFile(path.resolve('.env.example'), 'utf-8');
  assert(
    'T123a .env.example contient "DEPRECATED v3.2.0" + référence UI Intégrations',
    envExample.includes('DEPRECATED v3.2.0')
      && envExample.toLowerCase().includes('intégrations')
      && envExample.includes('GOOGLE_CLIENT_ID=')
      && envExample.includes('déprécié'),
    'OK',
  );

  // ─── T123b CHANGELOG entrée [3.2.0] GA ────────────────────────────────
  console.log('\n→ T123b CHANGELOG.md contient entrée [3.2.0]');
  const changelog = await readFile(path.resolve('CHANGELOG.md'), 'utf-8');
  assert(
    'T123b1 CHANGELOG contient "## [3.2.0]" GA + date 2026-05-10',
    changelog.includes('## [3.2.0]')
      && changelog.includes('2026-05-10')
      && changelog.includes('GA'),
    'OK',
  );
  assert(
    'T123b2 CHANGELOG mentionne migration .env → DB + restart container trade-off',
    changelog.includes('.env`')
      && changelog.includes('DB')
      && changelog.includes('restart container'),
    'OK',
  );

  // ─── T123c UPGRADE.md section v3.1.0 → v3.2.0 ────────────────────────
  console.log('\n→ T123c docs/UPGRADE.md contient section v3.1.0 → v3.2.0');
  const upgrade = await readFile(path.resolve('docs/UPGRADE.md'), 'utf-8');
  assert(
    'T123c1 UPGRADE.md contient "v3.1.0 → v3.2.0"',
    upgrade.includes('v3.1.0 → v3.2.0'),
    'OK',
  );
  assert(
    'T123c2 UPGRADE.md détaille migration auto bootstrap + cleanup .env + restart',
    upgrade.includes('bootstrap')
      && upgrade.includes('Intégrations')
      && upgrade.includes('Cleanup')
      && upgrade.includes('Restart'),
    'OK',
  );

  // ─── T123d INSTALL.md mention UI Intégrations ─────────────────────────
  console.log('\n→ T123d docs/INSTALL.md mentionne UI Intégrations');
  const install = await readFile(path.resolve('docs/INSTALL.md'), 'utf-8');
  assert(
    'T123d1 INSTALL.md section "Configurer Google OAuth" + Paramètres > Intégrations',
    install.includes('Configurer Google OAuth')
      && install.includes('Paramètres > Intégrations'),
    'OK',
  );
  assert(
    'T123d2 INSTALL.md procédure GCP step-by-step + redirect URIs',
    install.includes('Google Cloud')
      && install.includes('OAuth consent screen')
      && install.includes('redirect URI')
      && install.includes('/api/auth/callback/google'),
    'OK',
  );

  // ─── T123e package.json version >= 3.2.0 + GA (pas RC) ───────────────
  console.log('\n→ T123e package.json version >= 3.2.0 GA (pas RC)');
  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf-8'));
  assert(
    'T123e package.json version GA (pas suffixe -rc)',
    typeof pkg.version === 'string'
      && /^3\.[2-9]\.\d+$/.test(pkg.version),
    `version=${pkg.version}`,
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.2.0 GA integrations-docs ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.2.0 GA integrations-docs passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
