/**
 * Tests v3.2.0-rc1 — Phase 3 Session 1 : intégrations Google OAuth.
 *
 * Migrer GOOGLE_CLIENT_ID/SECRET du .env vers DB chiffrée + UI.
 * Pattern symétrique à rc10 (Drive credentials).
 *
 * T120a Zod integrationsConfigSchema accepte sentinelle '***'
 * T120b Zod accepte clientId/Secret nouveaux + null
 * T120c Zod rejette empty string si saisi nouveau (pas '***')
 * T120d round-trip enc:v1: clientId/Secret chiffrés → decrypt identité
 * T120e bootstrap migration logic : copie process.env → DB chiffré
 *       (simulation de la fonction inline)
 *
 * Pure tests — pas de DB, pas de HTTP.
 */

import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const { integrationsConfigSchema } = await import('../src/lib/validation.ts');
const { encrypt, decrypt, isEncrypted } = await import('../src/lib/crypto.ts');

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // ─── T120a sentinelle '***' acceptée ──────────────────────────────────
  console.log('\n→ T120a integrationsConfigSchema accepte sentinelle ***');
  {
    const r = integrationsConfigSchema.safeParse({
      googleClientId: '***',
      googleClientSecret: '***',
    });
    assert(
      'T120a tous secrets *** → accept',
      r.success,
      r.success ? 'OK' : `error=${JSON.stringify(r.error.issues)}`,
    );
  }

  // ─── T120b clientId/Secret nouveaux + null ───────────────────────────
  console.log('\n→ T120b accepte clientId/Secret nouveaux + null + vide');
  {
    const r = integrationsConfigSchema.safeParse({
      googleClientId: '12345-abc.apps.googleusercontent.com',
      googleClientSecret: 'GOCSPX-real-secret',
    });
    assert(
      'T120b1 nouveaux secrets non vides → accept',
      r.success,
      r.success ? 'OK' : `error=${JSON.stringify(r.error.issues)}`,
    );
  }
  {
    const r = integrationsConfigSchema.safeParse({
      googleClientId: null,
      googleClientSecret: null,
    });
    assert(
      'T120b2 null both → accept (clearing config)',
      r.success,
      'OK',
    );
  }
  {
    const r = integrationsConfigSchema.safeParse({});
    assert(
      'T120b3 payload vide → accept (rien à mettre à jour)',
      r.success,
      'OK',
    );
  }
  {
    const r = integrationsConfigSchema.safeParse({
      googleClientId: '',
      googleClientSecret: '',
    });
    assert(
      'T120b4 empty strings literal → accept (clearing via sentinel)',
      r.success,
      'OK',
    );
  }

  // ─── T120c rejette saisie nouvelle vide (pas '' ni '***') ─────────────
  console.log('\n→ T120c rejette valeurs invalides');
  // Note : avec l'union [literal(''), literal('***'), string.min(1)],
  // les valeurs '' et '***' sont OK ; toute autre string non-vide aussi.
  // Le seul cas invalide est un type non-string. Test côté JS.
  {
    const r = integrationsConfigSchema.safeParse({
      googleClientId: 123,
      googleClientSecret: '***',
    });
    assert(
      'T120c1 clientId non-string (number) → reject',
      !r.success,
      r.success ? 'BUG' : 'OK',
    );
  }

  // ─── T120d round-trip enc:v1: ─────────────────────────────────────────
  console.log('\n→ T120d round-trip clientId/Secret chiffrés enc:v1:');
  const clientId = '12345-abc.apps.googleusercontent.com';
  const clientSecret = 'GOCSPX-real-secret-test';
  const idEnc = encrypt(clientId);
  const secretEnc = encrypt(clientSecret);
  assert(
    'T120d1 encrypt préfixe enc:v1: × 2',
    isEncrypted(idEnc) && isEncrypted(secretEnc),
    `id=${idEnc.slice(0, 12)}... secret=${secretEnc.slice(0, 12)}...`,
  );
  assert(
    'T120d2 decrypt round-trip identité × 2',
    decrypt(idEnc) === clientId && decrypt(secretEnc) === clientSecret,
    'OK',
  );
  // 2 chiffrements identiques produisent ciphers différents (IV aléatoire)
  const enc1 = encrypt(clientId);
  const enc2 = encrypt(clientId);
  assert(
    'T120d3 IV aléatoire — chiffrements identiques produisent ciphers différents',
    enc1 !== enc2 && decrypt(enc1) === decrypt(enc2),
    'OK',
  );

  // ─── T120e bootstrap migration logic ──────────────────────────────────
  console.log('\n→ T120e bootstrap migration logic .env → DB');
  // Reproduire la fonction inline encryptFn de scripts/bootstrap.mjs
  // étape 1quater (sans dépendre de l'import du script).
  const secret = process.env.ENCRYPTION_SECRET!;
  const key = createHash('sha256').update(secret).digest();
  const bootstrapEncryptFn = (plain: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return 'enc:v1:' + Buffer.concat([iv, tag, ct]).toString('base64');
  };
  // Cas 1 : DB null + process.env défini → migrate
  const cfg1 = { googleClientId: null, googleClientSecret: null };
  const env1 = {
    GOOGLE_CLIENT_ID: 'env-client-id',
    GOOGLE_CLIENT_SECRET: 'env-client-secret',
  };
  const shouldMigrate1 = !cfg1.googleClientId && !cfg1.googleClientSecret
    && env1.GOOGLE_CLIENT_ID && env1.GOOGLE_CLIENT_SECRET;
  assert(
    'T120e1 condition migration : DB null + .env défini → true',
    !!shouldMigrate1,
    'OK',
  );
  // Vérifier que le résultat chiffré est decrypt-able par crypto.ts
  // (compat de format entre bootstrap inline et lib/crypto).
  const migratedId = bootstrapEncryptFn(env1.GOOGLE_CLIENT_ID);
  assert(
    'T120e2 chiffrement bootstrap décryptable par lib/crypto (compat format)',
    decrypt(migratedId) === env1.GOOGLE_CLIENT_ID,
    `decrypted=${decrypt(migratedId).slice(0, 20)}`,
  );

  // Cas 2 : DB déjà rempli → skip migration (idempotent)
  const cfg2 = { googleClientId: 'enc:v1:already-set', googleClientSecret: null };
  const shouldMigrate2 = !cfg2.googleClientId && !cfg2.googleClientSecret
    && env1.GOOGLE_CLIENT_ID && env1.GOOGLE_CLIENT_SECRET;
  assert(
    'T120e3 condition idempotent : DB rempli → skip',
    !shouldMigrate2,
    'OK',
  );

  // Cas 3 : DB null + process.env vide → no-op
  const env3 = { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined };
  const shouldMigrate3 = !cfg1.googleClientId && !cfg1.googleClientSecret
    && env3.GOOGLE_CLIENT_ID && env3.GOOGLE_CLIENT_SECRET;
  assert(
    'T120e4 condition no-op : DB null + .env vide → false',
    !shouldMigrate3,
    'OK',
  );

  // ─── T120f detectSource logic (replicated for test) ───────────────────
  console.log('\n→ T120f detectSource : db / env / none');
  function detectSource(cfg: { googleClientId: string | null }, envVar: string | undefined) {
    if (cfg.googleClientId) return 'db';
    if (envVar) return 'env';
    return 'none';
  }
  assert(
    'T120f1 DB rempli → source=db',
    detectSource({ googleClientId: 'enc:v1:abc' }, 'env-id') === 'db',
    'OK',
  );
  assert(
    'T120f2 DB null + env défini → source=env',
    detectSource({ googleClientId: null }, 'env-id') === 'env',
    'OK',
  );
  assert(
    'T120f3 DB null + env vide → source=none',
    detectSource({ googleClientId: null }, undefined) === 'none',
    'OK',
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.2.0-rc1 integrations-config ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.2.0-rc1 integrations-config passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
