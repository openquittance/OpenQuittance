/**
 * Tests v3.1.0-rc1 — Phase 2 Session 1 : backup config schema + crypto.
 *
 * T83 backupConfigSchema accepte config valide + cron + URL + secrets chiffrés
 *     round-trip (encrypt → préfixe enc:v1: → decrypt → identité)
 * T84 logique masquage : secret présent → `***`, null → null
 * T85 cron validation : "0 3 * * *" OK, "invalid cron" rejeté, 4 champs rejeté
 * T86 backupEnabled=true sans secrets → 400
 *
 * Pure tests — Zod + crypto direct, pas de stack HTTP / DB.
 *
 * Pré-requis env : ENCRYPTION_SECRET (généré à la volée si absent).
 */

import { randomBytes } from 'node:crypto';

// Stub ENCRYPTION_SECRET avant import crypto.ts (validation lazy)
if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const { backupConfigSchema } = await import('../src/lib/validation.ts');
const { encrypt, decrypt, isEncrypted } = await import('../src/lib/crypto.ts');

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

const validConfig = {
  backupEnabled: true,
  backupS3Endpoint: 'https://s3.eu-west-1.amazonaws.com',
  backupS3Region: 'eu-west-1',
  backupS3Bucket: 'openquittance-backups',
  backupS3ForcePathStyle: false,
  backupS3AccessKeyId: 'AKIATEST123',
  backupS3SecretKey: 'secret-test-secret-test-secret-test',
  backupSchedule: '0 3 * * *',
  backupRetentionDays: 30,
  backupEnvPassphrase: 'passphrase-test-12-chars-min',
  backupNotifySuccess: false,
};

async function main() {
  // ─── T83 schema accepte valide + secrets round-trip enc:v1: ───────────
  console.log('\n→ T83 backupConfigSchema accepte config valide + chiffrement secrets');
  const t83a = backupConfigSchema.safeParse(validConfig);
  assert(
    'T83a Zod accepte config complète',
    t83a.success,
    t83a.success ? 'OK' : `error=${JSON.stringify(t83a.error.issues)}`,
  );

  // Round-trip chiffrement secret S3 (simulation route handler)
  const cipherAccessKey = encrypt(validConfig.backupS3AccessKeyId);
  const cipherSecret = encrypt(validConfig.backupS3SecretKey);
  const cipherPassphrase = encrypt(validConfig.backupEnvPassphrase);
  assert(
    'T83b encrypt préfixe enc:v1: présent (3 secrets)',
    cipherAccessKey.startsWith('enc:v1:')
      && cipherSecret.startsWith('enc:v1:')
      && cipherPassphrase.startsWith('enc:v1:'),
    `accessKey=${cipherAccessKey.slice(0, 8)}... secret=${cipherSecret.slice(0, 8)}... passphrase=${cipherPassphrase.slice(0, 8)}...`,
  );
  assert(
    'T83c isEncrypted détecte préfixe',
    isEncrypted(cipherAccessKey)
      && isEncrypted(cipherSecret)
      && isEncrypted(cipherPassphrase),
    'OK',
  );
  assert(
    'T83d decrypt round-trip identité',
    decrypt(cipherAccessKey) === validConfig.backupS3AccessKeyId
      && decrypt(cipherSecret) === validConfig.backupS3SecretKey
      && decrypt(cipherPassphrase) === validConfig.backupEnvPassphrase,
    'OK',
  );
  // 2 chiffrements successifs du même plain → cipher différents (IV aléatoire)
  const cipher1 = encrypt('same-plain');
  const cipher2 = encrypt('same-plain');
  assert(
    'T83e IV aléatoire — 2 chiffrements identiques produisent ciphers différents',
    cipher1 !== cipher2 && decrypt(cipher1) === decrypt(cipher2),
    `cipher1=${cipher1.slice(0, 16)}... cipher2=${cipher2.slice(0, 16)}...`,
  );

  // ─── T84 masquage GET ─────────────────────────────────────────────────
  console.log('\n→ T84 logique masquage GET : secret présent → ***, null → null');
  const SECRET_MASK = '***';
  function maskSecret(value: string | null): string | null {
    return value ? SECRET_MASK : null;
  }
  assert(
    'T84a secret chiffré → masqué `***`',
    maskSecret(cipherAccessKey) === SECRET_MASK,
    `result=${maskSecret(cipherAccessKey)}`,
  );
  assert(
    'T84b null → null (pas masqué)',
    maskSecret(null) === null,
    'OK',
  );
  assert(
    'T84c chaîne vide → null (pas masqué)',
    maskSecret('') === null,
    'OK',
  );

  // ─── T85 cron validation ──────────────────────────────────────────────
  console.log('\n→ T85 cron validation 5 champs');
  const t85ok = [
    '0 3 * * *',
    '*/15 * * * *',
    '0 0 1 1 *',
    '0 3 * * 0',
    '0 3,15 * * *',
    '0 3-6 * * *',
  ];
  const t85ko = [
    '0 3 * *',         // 4 champs
    '0 3 * * * *',     // 6 champs
    'invalid cron',
    '0 abc * * *',
    '',
  ];
  let allOk = true;
  for (const expr of t85ok) {
    const r = backupConfigSchema.safeParse({ ...validConfig, backupSchedule: expr });
    if (!r.success) {
      console.log(`    ✗ "${expr}" devrait passer : ${JSON.stringify(r.error.issues)}`);
      allOk = false;
    }
  }
  for (const expr of t85ko) {
    // backupEnabled=true + cron vide ou invalide → fail (refine ou cronSchema)
    const r = backupConfigSchema.safeParse({ ...validConfig, backupSchedule: expr });
    if (r.success) {
      console.log(`    ✗ "${expr}" devrait être rejeté`);
      allOk = false;
    }
  }
  assert(
    'T85 cron : 6 valides acceptés + 5 invalides rejetés',
    allOk,
    'OK',
  );

  // ─── T86 backupEnabled=true sans secrets → 400 ────────────────────────
  console.log('\n→ T86 backupEnabled=true sans secrets → erreur Zod');
  const t86a = backupConfigSchema.safeParse({
    ...validConfig,
    backupS3SecretKey: '',
  });
  const t86b = backupConfigSchema.safeParse({
    ...validConfig,
    backupS3AccessKeyId: null,
  });
  const t86c = backupConfigSchema.safeParse({
    ...validConfig,
    backupEnvPassphrase: '',
  });
  const t86d = backupConfigSchema.safeParse({
    ...validConfig,
    backupSchedule: '',
  });
  // backupEnabled=false → tous secrets vides OK
  const t86e = backupConfigSchema.safeParse({
    backupEnabled: false,
    backupRetentionDays: 30,
  });
  assert(
    'T86a secret manquant → 400',
    !t86a.success,
    t86a.success ? 'a accepté' : 'OK',
  );
  assert(
    'T86b accessKey null → 400',
    !t86b.success,
    t86b.success ? 'a accepté' : 'OK',
  );
  assert(
    'T86c passphrase manquante → 400',
    !t86c.success,
    t86c.success ? 'a accepté' : 'OK',
  );
  assert(
    'T86d schedule manquant → 400',
    !t86d.success,
    t86d.success ? 'a accepté' : 'OK',
  );
  assert(
    'T86e backupEnabled=false sans secrets → OK',
    t86e.success,
    t86e.success ? 'OK' : `error=${JSON.stringify(t86e.error?.issues)}`,
  );

  // ─── Bonus : retentionDays bornes ─────────────────────────────────────
  console.log('\n→ Bonus retentionDays bornes [7, 3650]');
  const r6 = backupConfigSchema.safeParse({ ...validConfig, backupRetentionDays: 6 });
  const r7 = backupConfigSchema.safeParse({ ...validConfig, backupRetentionDays: 7 });
  const r3650 = backupConfigSchema.safeParse({ ...validConfig, backupRetentionDays: 3650 });
  const r3651 = backupConfigSchema.safeParse({ ...validConfig, backupRetentionDays: 3651 });
  assert(
    'retentionDays bornes : 6 rejeté, 7 accepté, 3650 accepté, 3651 rejeté',
    !r6.success && r7.success && r3650.success && !r3651.success,
    `6=${r6.success ? 'BUG' : 'ok'} 7=${r7.success ? 'ok' : 'BUG'} 3650=${r3650.success ? 'ok' : 'BUG'} 3651=${r3651.success ? 'BUG' : 'ok'}`,
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.1.0-rc1 backup-config ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.1.0-rc1 backup-config passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
