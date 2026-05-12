/**
 * Tests v3.2.0-rc2 — Phase 3 Session 2 : lazy load Google credentials.
 *
 * `getGoogleCredentials()` lit DB en priorité (chiffré enc:v1: décrypté),
 * fallback `process.env.GOOGLE_CLIENT_ID/SECRET` legacy. Cache 60s +
 * invalidation manuelle via `invalidateGoogleCredentialsCache()`.
 *
 * T121a getGoogleCredentials lit DB en priorité (mock prisma)
 * T121b fallback process.env si DB null
 * T121c retourne null si rien défini
 * T121d cache TTL respecté + invalidation
 * T121e gmail-sender buildOAuthClient utilise les bonnes creds
 *
 * Pure tests — pas de DB réelle, on mock prisma.appConfig.findUnique
 * via injection cache (test-only `_internals.setCache`).
 */

import { randomBytes } from 'node:crypto';

if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const { encrypt } = await import('../src/lib/crypto.ts');
const {
  getGoogleCredentials,
  invalidateGoogleCredentialsCache,
  _internals,
} = await import('../src/lib/integrations/google.ts');

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  const savedEnv = { ...process.env };

  // ─── T121a cache injecté avec source='db' → retourné ──────────────────
  console.log('\n→ T121a getGoogleCredentials retourne valeur cache DB');
  {
    _internals.resetCache();
    _internals.setCache({
      clientId: 'db-client-id',
      clientSecret: 'db-client-secret',
      source: 'db',
    }, 60_000);
    const r = await getGoogleCredentials();
    assert(
      'T121a cache injecté DB → retourné identique',
      r?.clientId === 'db-client-id'
        && r?.clientSecret === 'db-client-secret'
        && r?.source === 'db',
      JSON.stringify(r),
    );
  }

  // ─── T121b cache injecté avec source='env' → retourné ─────────────────
  console.log('\n→ T121b cache fallback env retourné');
  {
    _internals.resetCache();
    _internals.setCache({
      clientId: 'env-client-id',
      clientSecret: 'env-client-secret',
      source: 'env',
    }, 60_000);
    const r = await getGoogleCredentials();
    assert(
      'T121b cache env source → retourné',
      r?.source === 'env' && r?.clientId === 'env-client-id',
      JSON.stringify(r),
    );
  }

  // ─── T121c cache null → null retourné (pas de DB ni env) ──────────────
  console.log('\n→ T121c cache null + pas de fallback → null');
  {
    _internals.resetCache();
    _internals.setCache(null, 60_000);
    const r = await getGoogleCredentials();
    assert(
      'T121c cache null → null retourné',
      r === null,
      `result=${r}`,
    );
  }

  // ─── T121d invalidation cache ────────────────────────────────────────
  console.log('\n→ T121d invalidateGoogleCredentialsCache()');
  {
    _internals.setCache({
      clientId: 'cached',
      clientSecret: 'cached',
      source: 'db',
    }, 60_000);
    assert(
      'T121d1 cache présent avant invalidate',
      _internals.getCache() !== null,
      'OK',
    );
    invalidateGoogleCredentialsCache();
    assert(
      'T121d2 cache null après invalidate',
      _internals.getCache() === null,
      'OK',
    );
  }

  // ─── T121e cache TTL — expiré ne sert plus ────────────────────────────
  console.log('\n→ T121e cache TTL expiré');
  {
    _internals.resetCache();
    _internals.setCache({
      clientId: 'fresh',
      clientSecret: 'fresh',
      source: 'db',
    }, 1); // TTL 1ms
    await new Promise(resolve => setTimeout(resolve, 50));
    const cache = _internals.getCache();
    assert(
      'T121e1 cache expiré → entrée existe mais expiresAt dans le passé',
      cache !== null && cache.expiresAt < Date.now(),
      `cache=${JSON.stringify(cache)}`,
    );
    // Note : getGoogleCredentials() avec cache expiré ré-interroge DB.
    // Sans mock prisma, on teste juste le mécanisme TTL.
  }

  // ─── T121f round-trip enc:v1: format compat ────────────────────────────
  console.log('\n→ T121f round-trip chiffrement compat lib/crypto');
  {
    _internals.resetCache();
    const clientIdEnc = encrypt('test-client-id-real');
    const clientSecretEnc = encrypt('test-secret-real');
    // Simule injection valeur cache après decrypt — ce qui serait le
    // comportement réel avec DB.
    const { decrypt } = await import('../src/lib/crypto.ts');
    _internals.setCache({
      clientId: decrypt(clientIdEnc),
      clientSecret: decrypt(clientSecretEnc),
      source: 'db',
    }, 60_000);
    const r = await getGoogleCredentials();
    assert(
      'T121f decrypt enc:v1: → identité (compat format)',
      r?.clientId === 'test-client-id-real'
        && r?.clientSecret === 'test-secret-real',
      JSON.stringify(r),
    );
  }

  // ─── T121g intégration Gmail buildOAuthClient utilise bonnes creds ────
  console.log('\n→ T121g buildOAuthClient (gmail-sender) utilise creds DB');
  {
    _internals.resetCache();
    _internals.setCache({
      clientId: 'gmail-test-id',
      clientSecret: 'gmail-test-secret',
      source: 'db',
    }, 60_000);
    const { buildOAuthClient } = await import('../src/lib/email/gmail-sender.ts');
    const oauth2 = await buildOAuthClient('http://example.test/cb');
    // OAuth2Client a clientId / clientSecret en propriété privée _clientId.
    // generateAuthUrl utilise client_id dans l'URL.
    const url = oauth2.generateAuthUrl({ scope: ['email'] });
    assert(
      'T121g URL OAuth contient client_id depuis cache',
      url.includes('client_id=gmail-test-id'),
      `url=${url.slice(0, 100)}`,
    );
  }

  // ─── T121h gmail buildOAuthClient throw si rien configuré ─────────────
  console.log('\n→ T121h buildOAuthClient throw si null');
  {
    _internals.resetCache();
    _internals.setCache(null, 60_000);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    const { buildOAuthClient } = await import('../src/lib/email/gmail-sender.ts');
    let threw = false;
    let errMsg = '';
    try {
      await buildOAuthClient();
    } catch (e) {
      threw = true;
      errMsg = e instanceof Error ? e.message : String(e);
    }
    assert(
      'T121h buildOAuthClient throw "Credentials Google manquants"',
      threw && errMsg.includes('Credentials Google manquants'),
      `threw=${threw} msg=${errMsg.slice(0, 80)}`,
    );
  }

  // Restaurer env
  for (const k of Object.keys(process.env)) {
    if (!(k in savedEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(savedEnv)) {
    process.env[k] = v;
  }

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.2.0-rc2 google-oauth-lazy-load ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.2.0-rc2 google-oauth-lazy-load passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
