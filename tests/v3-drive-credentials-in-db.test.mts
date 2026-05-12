/**
 * Tests v3.1.0-rc10 — Drive credentials migrés du .env vers la DB.
 *
 * BUG fixé : éditer le .env côté Docker n'est pas user-friendly. Les
 * credentials Drive (Client ID + Secret) sont désormais saisis via UI
 * Paramètres > Backup et stockés chiffrés enc:v1: dans AppConfig.
 *
 * T110 buildOAuthClient() accepte clientId/Secret chiffrés en params,
 *      decrypt OK + génère URL OAuth avec bons params
 * T111 backupConfigSchema refine : Drive activé sans credentials → reject
 * T112 backupConfigSchema refine : Drive activé AVEC credentials + folderId
 *      → accept
 * T113 loadStorageFromConfig : DriveStorage construit depuis cfg avec
 *      les credentials passés au DriveStorage
 *
 * Pure tests — pas de DB, mock googleapis.
 */

import { randomBytes } from 'node:crypto';

if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

const { encrypt, decrypt } = await import('../src/lib/crypto.ts');
const { backupConfigSchema } = await import('../src/lib/validation.ts');
const { buildOAuthClient } = await import('../src/lib/backup/storage/drive.ts');
const { loadStorageFromConfig } = await import('../src/lib/backup/storage/load.ts');
const { DriveStorage } = await import('../src/lib/backup/storage/drive.ts');

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  const clientId = '12345-abc.apps.googleusercontent.com';
  const clientSecret = 'GOCSPX-xxxxxYYYYYzzzzz';
  const refreshToken = 'refresh-token-test';
  const clientIdEnc = encrypt(clientId);
  const clientSecretEnc = encrypt(clientSecret);
  const refreshTokenEnc = encrypt(refreshToken);

  // ─── T110 buildOAuthClient avec credentials chiffrés ──────────────────
  console.log('\n→ T110 buildOAuthClient decrypt clientId/Secret + génère OAuth URL valide');
  {
    const oauth2 = buildOAuthClient({
      clientIdEnc,
      clientSecretEnc,
    });
    // generateAuthUrl → URL Google avec client_id + redirect_uri.
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
    });
    assert(
      'T110a URL OAuth contient client_id décrypté',
      url.includes(`client_id=${encodeURIComponent(clientId)}`),
      `url=${url.slice(0, 120)}...`,
    );
    assert(
      'T110b URL OAuth contient redirect_uri vers callback',
      url.includes('redirect_uri=')
        && url.includes('backup%2Fdrive%2Foauth%2Fcallback'),
      'OK',
    );
    assert(
      'T110c URL OAuth contient scope drive.file',
      url.includes('drive.file'),
      'OK',
    );
  }

  // ─── T111 refine reject Drive sans credentials ────────────────────────
  console.log('\n→ T111 backupConfigSchema refine Drive activé sans credentials');
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 'drive',
      backupDriveFolderId: 'folder-123',
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: 'long-passphrase-12+',
      // Pas de googleDriveClientId / Secret
    });
    assert(
      'T111a Drive activé sans clientId/Secret → reject',
      !r.success,
      r.success ? 'BUG : a accepté' : 'OK',
    );
  }
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 'drive',
      backupDriveFolderId: 'folder-123',
      googleDriveClientId: clientId,
      // Pas de Secret
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: 'long-passphrase-12+',
    });
    assert(
      'T111b Drive activé sans Secret → reject',
      !r.success,
      r.success ? 'BUG' : 'OK',
    );
  }
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 'drive',
      googleDriveClientId: clientId,
      googleDriveClientSecret: clientSecret,
      // Pas de folderId
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: 'long-passphrase-12+',
    });
    assert(
      'T111c Drive activé sans folderId → reject',
      !r.success,
      r.success ? 'BUG' : 'OK',
    );
  }
  {
    // backupEnabled=false → tous champs optionnels OK
    const r = backupConfigSchema.safeParse({
      backupEnabled: false,
      backupStorageType: 'drive',
      backupRetentionDays: 30,
    });
    assert(
      'T111d Drive disabled → tous champs optionnels OK',
      r.success,
      r.success ? 'OK' : `error=${JSON.stringify(r.error?.issues)}`,
    );
  }

  // ─── T112 refine accept Drive avec credentials + folderId ─────────────
  console.log('\n→ T112 backupConfigSchema refine Drive activé AVEC credentials');
  {
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 'drive',
      backupDriveFolderId: 'folder-123',
      googleDriveClientId: clientId,
      googleDriveClientSecret: clientSecret,
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: 'long-passphrase-12+',
    });
    assert(
      'T112a Drive activé + clientId/Secret + folderId → accept',
      r.success,
      r.success ? 'OK' : `error=${JSON.stringify(r.error?.issues)}`,
    );
  }
  {
    // S3 inchangé : credentials Drive ignorés
    const r = backupConfigSchema.safeParse({
      backupEnabled: true,
      backupStorageType: 's3',
      backupS3Endpoint: 'https://s3.test',
      backupS3Bucket: 'bucket-test',
      backupS3AccessKeyId: 'AKIA',
      backupS3SecretKey: 'secret',
      backupSchedule: '0 3 * * *',
      backupRetentionDays: 30,
      backupEnvPassphrase: 'long-passphrase-12+',
      // Pas de credentials Drive — OK car S3 storage
    });
    assert(
      'T112b S3 storage : credentials Drive optionnels',
      r.success,
      r.success ? 'OK' : `error=${JSON.stringify(r.error?.issues)}`,
    );
  }

  // ─── T113 loadStorageFromConfig DriveStorage avec credentials ─────────
  console.log('\n→ T113 loadStorageFromConfig Drive : credentials passés au DriveStorage');
  {
    const cfg = {
      backupStorageType: 'drive',
      backupS3Endpoint: null,
      backupS3Region: null,
      backupS3Bucket: null,
      backupS3ForcePathStyle: false,
      backupS3AccessKeyId: null,
      backupS3SecretKey: null,
      backupDriveFolderId: 'folder-xyz',
      backupDriveRefreshToken: refreshTokenEnc,
      googleDriveClientId: clientIdEnc,
      googleDriveClientSecret: clientSecretEnc,
    };
    const storage = loadStorageFromConfig(cfg as any);
    assert(
      'T113a loadStorageFromConfig retourne DriveStorage',
      storage instanceof DriveStorage && storage.type === 'drive',
      `type=${storage.type}`,
    );
  }
  {
    // Drive incomplet (missing clientId) → throw
    const cfg = {
      backupStorageType: 'drive',
      backupS3Endpoint: null,
      backupS3Region: null,
      backupS3Bucket: null,
      backupS3ForcePathStyle: false,
      backupS3AccessKeyId: null,
      backupS3SecretKey: null,
      backupDriveFolderId: 'folder-xyz',
      backupDriveRefreshToken: refreshTokenEnc,
      googleDriveClientId: null,
      googleDriveClientSecret: clientSecretEnc,
    };
    let threw = false;
    let errMsg = '';
    try {
      loadStorageFromConfig(cfg as any);
    } catch (e) {
      threw = true;
      errMsg = e instanceof Error ? e.message : String(e);
    }
    assert(
      'T113b Drive missing clientId → throw avec message explicite',
      threw && errMsg.includes('clientId'),
      `threw=${threw} msg=${errMsg.slice(0, 80)}`,
    );
  }

  // ─── T114 round-trip credentials chiffrés ─────────────────────────────
  console.log('\n→ T114 round-trip clientId/Secret chiffrés enc:v1:');
  {
    assert(
      'T114a encrypt clientId préfixe enc:v1:',
      clientIdEnc.startsWith('enc:v1:'),
      clientIdEnc.slice(0, 16) + '...',
    );
    assert(
      'T114b decrypt clientId → identité',
      decrypt(clientIdEnc) === clientId,
      'OK',
    );
    assert(
      'T114c decrypt clientSecret → identité',
      decrypt(clientSecretEnc) === clientSecret,
      'OK',
    );
  }

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.1.0-rc10 drive-credentials-in-db ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.1.0-rc10 drive-credentials-in-db passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
