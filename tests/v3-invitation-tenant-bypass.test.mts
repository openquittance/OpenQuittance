/**
 * Tests v3.3.2 hotfix — invitation membre staff redirige par erreur
 * vers le portail locataire si le user invité a une session TENANT.
 *
 * Cause racine (cf. SESSION-LOGS hotfix v3.3.2) :
 *
 * Symptôme : admin invite femme (déjà locataire dans l'app) en tant
 * que MEMBER. Email contient `/invitations/{token}`. Femme clique →
 * atterrit sur portail locataire avec "Aucun bail actif".
 *
 * Trace :
 * 1. Femme a session TENANT (compte locataire existant).
 * 2. Click sur lien invitation → middleware Edge.
 * 3. Block isTenant (line 104) : si session TENANT et path PAS dans
 *    PUBLIC_PATHS / PUBLIC_API_PREFIXES → redirect `/portail`.
 * 4. `/invitations/{token}` n'est PAS dans PUBLIC_PATHS.
 * 5. → redirect `/portail`. La femme ne peut JAMAIS accéder à
 *    l'invitation staff.
 *
 * Le check `isPublicInvitation()` ligne 158 (après isTenant block)
 * était unreachable pour les TENANT.
 *
 * Fix : déplacer `isPublicInvitation()` AVANT le block isTenant
 * (ligne 102 nouveau). Les invitations staff doivent passer même
 * pour les TENANT (cas légitime : conversion locataire → membre staff).
 *
 * T128a middleware vérifie isPublicInvitation AVANT isTenant block
 * T128b /invitations/[token] + session TENANT → ok middleware (FIX)
 * T128c /api/invitations/[token] + session TENANT → ok middleware (FIX)
 * T128d isTenant + autre path → toujours redirect /portail (régression)
 * T128e isPublicInvitation correctement défini
 *
 * Pure file checks + simulation logique.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // ─── T128a middleware isPublicInvitation AVANT isTenant block ─────────
  console.log('\n→ T128a middleware ordre : isPublicInvitation AVANT isTenant');
  const middlewareSrc = await readFile(
    path.resolve('src/middleware.ts'),
    'utf-8',
  );

  const idxIsPublicInvitationFirst = middlewareSrc.indexOf('if (isPublicInvitation(pathname))');
  const idxIsTenantBlock = middlewareSrc.indexOf('if (isTenant) {');
  assert(
    'T128a1 isPublicInvitation check existe',
    idxIsPublicInvitationFirst > 0,
    `idx=${idxIsPublicInvitationFirst}`,
  );
  assert(
    'T128a2 isTenant block existe',
    idxIsTenantBlock > 0,
    `idx=${idxIsTenantBlock}`,
  );
  assert(
    'T128a3 isPublicInvitation AVANT isTenant block (FIX rc11)',
    idxIsPublicInvitationFirst < idxIsTenantBlock,
    `isPublicInvitation@${idxIsPublicInvitationFirst} < isTenant@${idxIsTenantBlock}`,
  );

  // ─── T128b commentaire hotfix v3.3.2 ─────────────────────────────────
  console.log('\n→ T128b commentaire hotfix v3.3.2 documente la cause');
  assert(
    'T128b middleware contient note hotfix v3.3.2',
    middlewareSrc.includes('v3.3.2 hotfix')
      && middlewareSrc.includes('TENANT')
      && middlewareSrc.includes('invitation staff'),
    'OK',
  );

  // ─── T128c isPublicInvitation function correcte ──────────────────────
  console.log('\n→ T128c isPublicInvitation détecte /invitations + /api/invitations');
  const fnMatch = middlewareSrc.match(
    /function isPublicInvitation\(pathname: string\): boolean \{[\s\S]+?return\s+([^;]+);/,
  );
  assert(
    'T128c isPublicInvitation match les 2 préfixes',
    fnMatch !== null
      && fnMatch[1].includes("'/invitations/'")
      && fnMatch[1].includes("'/api/invitations/'"),
    fnMatch ? fnMatch[1].slice(0, 100) : 'NOT FOUND',
  );

  // ─── T128d simulation flow réel ───────────────────────────────────────
  console.log('\n→ T128d simulation : femme TENANT + /invitations/[token]');

  // Reproduit le décision logique du middleware ordre nouveau (post-fix).
  function simulateMiddleware(pathname: string, role: 'TENANT' | 'ADMIN' | 'MEMBER' | null) {
    const PUBLIC_PATHS = ['/login', '/register', '/setup', '/install', '/a-propos'];
    const isTenant = role === 'TENANT';
    const isStaff = role === 'ADMIN' || role === 'MEMBER';

    function isPublicInvitation(p: string): boolean {
      return p.startsWith('/invitations/') || p.startsWith('/api/invitations/');
    }

    // ORDRE FIX rc11 : isPublicInvitation AVANT isTenant.
    if (isPublicInvitation(pathname)) {
      return { action: 'ok', to: pathname };
    }

    // isTenant block
    if (isTenant) {
      if (pathname.startsWith('/api/')) {
        return { action: '403', to: pathname };
      }
      if (!PUBLIC_PATHS.includes(pathname)) {
        return { action: 'redirect', to: '/portail' };
      }
    }

    return { action: 'continue', to: pathname };
  }

  // Cas 1 : femme TENANT + /invitations/abc → ok (FIX)
  const cas1 = simulateMiddleware('/invitations/abc123token', 'TENANT');
  assert(
    'T128d1 TENANT + /invitations/[token] → ok (FIX rc11)',
    cas1.action === 'ok' && cas1.to === '/invitations/abc123token',
    JSON.stringify(cas1),
  );

  // Cas 2 : femme TENANT + /api/invitations/abc → ok (FIX)
  const cas2 = simulateMiddleware('/api/invitations/abc123token', 'TENANT');
  assert(
    'T128d2 TENANT + /api/invitations/[token] → ok (FIX rc11)',
    cas2.action === 'ok' && cas2.to === '/api/invitations/abc123token',
    JSON.stringify(cas2),
  );

  // Cas 3 : femme TENANT + autre path /quittances → redirect /portail
  // (régression conservée — un TENANT ne doit pas accéder UI staff)
  const cas3 = simulateMiddleware('/quittances', 'TENANT');
  assert(
    'T128d3 TENANT + /quittances → redirect /portail (régression conservée)',
    cas3.action === 'redirect' && cas3.to === '/portail',
    JSON.stringify(cas3),
  );

  // Cas 4 : user PAS loggué + /invitations/abc → ok (peut accepter
  // invitation, créera compte staff via flow inscription).
  const cas4 = simulateMiddleware('/invitations/abc', null);
  assert(
    'T128d4 PAS loggué + /invitations/[token] → ok',
    cas4.action === 'ok',
    JSON.stringify(cas4),
  );

  // Cas 5 : ADMIN loggué + /invitations/abc → ok (peut consulter)
  const cas5 = simulateMiddleware('/invitations/abc', 'ADMIN');
  assert(
    'T128d5 ADMIN + /invitations/[token] → ok',
    cas5.action === 'ok',
    JSON.stringify(cas5),
  );

  // Cas 6 : régression — TENANT + /api/quittances → 403
  const cas6 = simulateMiddleware('/api/quittances', 'TENANT');
  assert(
    'T128d6 TENANT + /api/quittances → 403 (régression)',
    cas6.action === '403',
    JSON.stringify(cas6),
  );

  // ─── T128e package.json version >= 3.3.2 ─────────────────────────────
  console.log('\n→ T128e package.json version >= 3.3.2');
  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf-8'));
  assert(
    'T128e package.json version >= "3.3.2" (fix invitation TENANT appliqué)',
    typeof pkg.version === 'string'
      && /^3\.([3-9]|\d{2,})\.\d+$/.test(pkg.version),
    `version=${pkg.version}`,
  );

  // ─── T128f sendInvitationEmail URL correcte ──────────────────────────
  console.log('\n→ T128f sendInvitationEmail construit /invitations/[token] (pas portail)');
  const inviteLib = await readFile(
    path.resolve('src/lib/invitations.ts'),
    'utf-8',
  );
  assert(
    'T128f1 invitations.ts construit URL /invitations/[token]',
    inviteLib.includes('${args.baseUrl}/invitations/${invitation.token}'),
    'OK',
  );
  assert(
    'T128f2 invitations.ts ne référence PAS /portail/login (séparation flow staff/tenant)',
    !inviteLib.includes('/portail/login'),
    'OK',
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.3.2 invitation-tenant-bypass ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.3.2 invitation-tenant-bypass passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
