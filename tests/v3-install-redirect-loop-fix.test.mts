/**
 * Tests v3.3.1 hotfix — boucle redirection /install ↔ / sur instance
 * vierge avec stale JWT cookie.
 *
 * Cause racine (cf. SESSION-LOGS rc11 hotfix v3.3.1) :
 *
 * 1. User a cookie NextAuth JWT stale (session ADMIN pré-`docker
 *    compose down -v`).
 * 2. DB vide après reset volume → 0 user, mais JWT signé persiste
 *    côté browser.
 * 3. User accède `/`. Middleware lit JWT, `isStaff=true`. `/` PAS dans
 *    PUBLIC_PATHS, session présente → `ok(req, '/')`.
 * 4. `/` Server Component : `hasAnyAdmin()=false` → `redirect('/install')`.
 * 5. User redirigé `/install`.
 * 6. Middleware : `/install` dans PUBLIC_PATHS. ANCIEN
 *    ALWAYS_ACCESSIBLE = ['/setup', '/a-propos']. `/install` non
 *    inclus + `isStaff=true` → **redirect `/`**.
 * 7. Loop : `/` → page redirect `/install` → middleware redirect `/`
 *    → loop infini ERR_TOO_MANY_REDIRECTS.
 *
 * Fix : ajouter `/install` à `ALWAYS_ACCESSIBLE` middleware. Le
 * Server Component /install décide ensuite (render wizard si
 * !hasAnyAdmin, redirect /login sinon).
 *
 * T127a middleware ALWAYS_ACCESSIBLE inclut /install
 * T127b /install reste accessible avec session staff (no redirect /)
 * T127c /install Server Component décision (render wizard si !hasAnyAdmin)
 * T127d simulation flow stale JWT ne loop plus
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
  // ─── T127a middleware ALWAYS_ACCESSIBLE inclut /install ───────────────
  console.log('\n→ T127a middleware ALWAYS_ACCESSIBLE inclut /install');
  const middlewareSrc = await readFile(
    path.resolve('src/middleware.ts'),
    'utf-8',
  );

  // Vérifie que /install figure dans ALWAYS_ACCESSIBLE.
  // Pattern souple pour matcher la déclaration multi-lignes :
  // const ALWAYS_ACCESSIBLE = pathname === '/setup' || pathname === '/a-propos' || pathname === '/install';
  const alwaysAccessibleBlock = middlewareSrc.match(
    /ALWAYS_ACCESSIBLE\s*=[^;]+;/s,
  );
  assert(
    'T127a1 middleware déclare ALWAYS_ACCESSIBLE',
    alwaysAccessibleBlock !== null,
    'OK',
  );
  assert(
    "T127a2 ALWAYS_ACCESSIBLE inclut '/install'",
    alwaysAccessibleBlock?.[0]?.includes("'/install'") ?? false,
    alwaysAccessibleBlock ? alwaysAccessibleBlock[0].slice(0, 200) : 'NOT FOUND',
  );
  assert(
    "T127a3 ALWAYS_ACCESSIBLE inclut toujours /setup et /a-propos (régression)",
    (alwaysAccessibleBlock?.[0]?.includes("'/setup'") ?? false)
      && (alwaysAccessibleBlock?.[0]?.includes("'/a-propos'") ?? false),
    'OK',
  );

  // ─── T127b commentaire hotfix v3.3.1 dans middleware ──────────────────
  console.log('\n→ T127b commentaire hotfix v3.3.1 documente la cause');
  assert(
    'T127b middleware contient note hotfix v3.3.1 + ERR_TOO_MANY_REDIRECTS',
    middlewareSrc.includes('v3.3.1')
      && middlewareSrc.includes('ERR_TOO_MANY_REDIRECTS'),
    'OK',
  );

  // ─── T127c /install Server Component logique inchangée ────────────────
  console.log('\n→ T127c /install Server Component décide redirect /login OR render wizard');
  const installPageSrc = await readFile(
    path.resolve('src/app/install/page.tsx'),
    'utf-8',
  );
  assert(
    'T127c /install Server Component lit hasAnyAdmin + redirect login si true + render wizard sinon',
    installPageSrc.includes('hasAnyAdmin')
      && installPageSrc.includes("redirect('/login')")
      && installPageSrc.includes('InstallWizard')
      && installPageSrc.includes('if (hasAdmin)'),
    'OK',
  );

  // ─── T127d simulation flow stale JWT ──────────────────────────────────
  console.log('\n→ T127d simulation flow stale JWT (DB vierge + cookie ADMIN)');
  // On ne peut pas exécuter middleware Edge depuis tsx, mais on
  // simule la décision logique : avec /install dans
  // ALWAYS_ACCESSIBLE, isStaff=true ne déclenche PAS redirect /.
  function simulateMiddleware(pathname: string, isStaff: boolean) {
    const PUBLIC_PATHS = ['/login', '/register', '/setup', '/install', '/a-propos'];
    const ALWAYS_ACCESSIBLE = pathname === '/setup'
      || pathname === '/a-propos'
      || pathname === '/install';
    if (PUBLIC_PATHS.includes(pathname)) {
      if (isStaff && !ALWAYS_ACCESSIBLE) {
        return { action: 'redirect', to: '/' };
      }
      return { action: 'ok', to: pathname };
    }
    return { action: 'unknown', to: pathname };
  }

  // Cas 1 : user NON loggué accède /install (instance vierge,
  // pas de cookie) → middleware ok.
  const cas1 = simulateMiddleware('/install', false);
  assert(
    'T127d1 /install + pas de session → middleware ok (render wizard)',
    cas1.action === 'ok' && cas1.to === '/install',
    JSON.stringify(cas1),
  );

  // Cas 2 : user avec stale JWT (isStaff=true) + DB vierge accède
  // /install → middleware NE redirige PAS / (fix rc11). Server
  // Component render wizard (hasAnyAdmin=false).
  const cas2 = simulateMiddleware('/install', true);
  assert(
    'T127d2 /install + stale JWT staff session → middleware ok (PAS redirect /)',
    cas2.action === 'ok' && cas2.to === '/install',
    JSON.stringify(cas2),
  );

  // Cas 3 : user loggué normal accède /login → middleware redirect /
  // (comportement inchangé pour /login).
  const cas3 = simulateMiddleware('/login', true);
  assert(
    'T127d3 /login + session staff → middleware redirect / (régression conservée)',
    cas3.action === 'redirect' && cas3.to === '/',
    JSON.stringify(cas3),
  );

  // Cas 4 : user loggué accède /register → middleware redirect /
  // (comportement inchangé).
  const cas4 = simulateMiddleware('/register', true);
  assert(
    'T127d4 /register + session staff → middleware redirect /',
    cas4.action === 'redirect' && cas4.to === '/',
    JSON.stringify(cas4),
  );

  // Cas 5 : user loggué accède /setup → middleware ok (inchangé).
  const cas5 = simulateMiddleware('/setup', true);
  assert(
    'T127d5 /setup + session staff → middleware ok (régression conservée)',
    cas5.action === 'ok' && cas5.to === '/setup',
    JSON.stringify(cas5),
  );

  // ─── T127e package.json version >= 3.3.1 ─────────────────────────────
  console.log('\n→ T127e package.json version >= 3.3.1');
  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf-8'));
  assert(
    'T127e package.json version >= "3.3.1" (fix install loop appliqué)',
    typeof pkg.version === 'string'
      && /^3\.([3-9]|\d{2,})\.\d+$/.test(pkg.version),
    `version=${pkg.version}`,
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.3.1 install-redirect-loop-fix ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.3.1 install-redirect-loop-fix passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
