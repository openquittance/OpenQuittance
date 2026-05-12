/**
 * Tests v3.1.0-rc11 — régression toggle activation backup.
 *
 * BUG rc1-rc10 : payload UI envoyé avec sentinelles `***` pour secrets
 * non-touchés. Zod rejetait `backupEnvPassphrase: '***'` à cause du
 * `.min(12)`. Route retournait 400 → DB jamais mise à jour → reload
 * page restituait l'ancienne valeur (toggle "remis à ON").
 *
 * FIX rc11 : Zod accepte la sentinelle `'***'` (en plus de '', null,
 * undefined, ou string >= 12 chars). Route handler la remplace par
 * valeur DB existante avant `prisma.upsert`.
 *
 * T115 backupConfigSchema accepte `'***'` pour backupEnvPassphrase
 *      (les 4 cas : enabled true/false × creds present/absent)
 * T116 backupConfigSchema accepte `'***'` pour S3 secrets + Drive
 *      credentials (déjà OK car pas de min, mais on confirme)
 * T117 vraies passphrases (>=12 chars) toujours acceptées
 * T118 passphrase trop courte (<12, pas '***') toujours rejetée
 * T119 simulation flow toggle off : payload réel UI → Zod success
 *
 * Pure tests — pas de DB, pas de HTTP.
 */

import { randomBytes } from 'node:crypto';

if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const { backupConfigSchema } = await import('../src/lib/validation.ts');

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // ─── T115 sentinelle '***' acceptée pour passphrase ───────────────────
  console.log('\n→ T115 backupConfigSchema accepte sentinelle *** pour backupEnvPassphrase');

  // T115a : enabled=false, secrets en sentinelle (cas user toggle off)
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: false,
      backupStorageType: 's3',
      backupS3Endpoint: 'https://s3.test',
      backupS3Region: 'eu',
      backupS3Bucket: 'mybucket',
      backupS3ForcePathStyle: false,
      backupS3AccessKeyId: '***',
      backupS3SecretKey: '***',
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: '***',
      backupNotifySuccess: false,
    });
    assert(
      'T115a enabled=false + secrets *** → accept (cas toggle off réel)',
      r.success,
      r.success ? 'OK' : `FAIL : ${JSON.stringify(r.error?.issues)}`,
    );
  }

  // T115b : enabled=true, secrets en sentinelle (cas user save sans toucher passphrase)
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 's3',
      backupS3Endpoint: 'https://s3.test',
      backupS3Region: 'eu',
      backupS3Bucket: 'mybucket',
      backupS3ForcePathStyle: false,
      backupS3AccessKeyId: '***',
      backupS3SecretKey: '***',
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: '***',
      backupNotifySuccess: false,
    });
    assert(
      'T115b enabled=true + tous secrets *** → accept (route handler préserve DB)',
      r.success,
      r.success ? 'OK' : `FAIL : ${JSON.stringify(r.error?.issues)}`,
    );
  }

  // T115c : enabled=true, passphrase nouvelle (>= 12) — flow normal save
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 's3',
      backupS3Endpoint: 'https://s3.test',
      backupS3Bucket: 'mybucket',
      backupS3AccessKeyId: 'AKIA',
      backupS3SecretKey: 'secret-real',
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: 'nouvelle-passphrase-12+',
      backupNotifySuccess: false,
    });
    assert(
      'T115c enabled=true + passphrase nouvelle (>=12) → accept',
      r.success,
      r.success ? 'OK' : `FAIL : ${JSON.stringify(r.error?.issues)}`,
    );
  }

  // T115d : enabled=false, passphrase null (jamais configurée)
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: false,
      backupStorageType: 's3',
      backupRetentionDays: 30,
      backupEnvPassphrase: null,
    });
    assert(
      'T115d enabled=false + passphrase null → accept',
      r.success,
      r.success ? 'OK' : `FAIL : ${JSON.stringify(r.error?.issues)}`,
    );
  }

  // ─── T116 sentinelle pour autres secrets ──────────────────────────────
  console.log('\n→ T116 sentinelle *** pour S3 + Drive credentials');
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 'drive',
      backupDriveFolderId: 'folder-1',
      googleDriveClientId: '***',
      googleDriveClientSecret: '***',
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: '***',
    });
    assert(
      'T116 Drive secrets en *** → accept',
      r.success,
      r.success ? 'OK' : `FAIL : ${JSON.stringify(r.error?.issues)}`,
    );
  }

  // ─── T117 passphrase réelle (>=12) toujours OK ────────────────────────
  console.log('\n→ T117 passphrase réelle (>=12 chars)');
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 's3',
      backupS3Endpoint: 'https://s3.test',
      backupS3Bucket: 'bucket-real',
      backupS3AccessKeyId: 'AK',
      backupS3SecretKey: 'SK',
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: 'real-pass-12-chars',
    });
    assert(
      'T117 passphrase 18 chars → accept',
      r.success,
      'OK',
    );
  }

  // ─── T118 passphrase trop courte (pas ***) toujours rejetée ───────────
  console.log('\n→ T118 passphrase < 12 (pas sentinelle ***) → reject');
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 's3',
      backupS3Endpoint: 'https://s3.test',
      backupS3Bucket: 'bucket-real',
      backupS3AccessKeyId: 'AK',
      backupS3SecretKey: 'SK',
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: 'short',  // 5 chars, ni *** ni '' ni null
    });
    assert(
      'T118a passphrase "short" → reject',
      !r.success,
      r.success ? 'BUG : a accepté' : 'OK',
    );
  }
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 's3',
      backupS3Endpoint: 'https://s3.test',
      backupS3Bucket: 'bucket-real',
      backupS3AccessKeyId: 'AK',
      backupS3SecretKey: 'SK',
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: '**',  // 2 chars, pas exactement '***'
    });
    assert(
      'T118b passphrase "**" (pas ***) → reject',
      !r.success,
      r.success ? 'BUG' : 'OK',
    );
  }

  // ─── T119 reproduit le bug user — flow toggle off réel ────────────────
  console.log('\n→ T119 simulation flow réel : payload UI sur toggle off');
  // Reproduit exactement le payload envoyé par BackupForm.save() quand
  // user a déjà tout configuré et clique simplement le toggle off.
  {
    const userPayload = {
      backupEnabled: false,             // ← toggle off
      backupStorageType: 's3',
      backupS3Endpoint: 'https://s3.eu-central-003.backblazeb2.com',
      backupS3Region: 'eu-central-003',
      backupS3Bucket: 'openquittance-backups',
      backupS3ForcePathStyle: false,
      backupS3AccessKeyId: '***',       // pas dirty
      backupS3SecretKey: '***',         // pas dirty
      backupDriveFolderId: null,
      googleDriveClientId: null,
      googleDriveClientSecret: null,
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: '***',       // pas dirty — LE bug rc1-rc10
      backupNotifySuccess: false,
    };
    const r = backupConfigSchema.safeParse(userPayload);
    assert(
      'T119 payload toggle off avec *** sentinelles → accept (régression rc11)',
      r.success,
      r.success ? `data.backupEnabled=${r.data.backupEnabled}` : `FAIL : ${JSON.stringify(r.error?.issues)}`,
    );
    if (r.success) {
      assert(
        'T119b r.data.backupEnabled === false (préservé après parse)',
        r.data.backupEnabled === false,
        `value=${r.data.backupEnabled}`,
      );
    }
  }

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.1.0-rc11 backup-toggle-persist ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.1.0-rc11 backup-toggle-persist passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
