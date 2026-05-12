/**
 * Tests v3.1.0-rc5 — Phase 2 Session 4bis : connecteur Google Drive.
 *
 * T96 testConnection mock googleapis : list 1 file → ok / 403 → failedAt=auth
 * T97 uploadFile encode key avec ___ + appelle drive.files.create avec
 *     parents=[folderId] + media body
 * T98 listKeys filtre prefix correct (encoded ___) + decode keys
 * T99 deleteKey résout name → fileId via list puis delete
 * T100 storageType selector : 's3' → S3Storage, 'drive' → DriveStorage
 *
 * Pure tests — googleapis client mocké via simple test double (pas de
 * MSW / nock nécessaire).
 *
 * Pré-requis env : ENCRYPTION_SECRET (généré à la volée si absent).
 */

import { randomBytes } from 'node:crypto';

if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}
process.env.GOOGLE_DRIVE_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID ?? 'test-client-id';
process.env.GOOGLE_DRIVE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? 'test-client-secret';
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

const { encrypt } = await import('../src/lib/crypto.ts');
const { DriveStorage } = await import('../src/lib/backup/storage/drive.ts');
const { S3Storage } = await import('../src/lib/backup/storage/s3.ts');
const { loadStorageFromConfig } = await import('../src/lib/backup/storage/load.ts');

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

/**
 * Injecte un mock drive client dans une instance DriveStorage en
 * remplaçant la propriété privée `drive`. Test-only hack pour éviter
 * de mocker tout googleapis.
 */
function injectMockDrive(storage: any, mock: any) {
  storage.drive = mock;
}

async function main() {
  const folderId = 'test-folder-123';
  const refreshTokenEnc = encrypt('test-refresh-token');

  // ─── T96 testConnection ───────────────────────────────────────────────
  console.log('\n→ T96 testConnection mock googleapis');
  {
    const calls: Array<{ method: string; args: any }> = [];
    const mockDrive = {
      files: {
        list: async (args: any) => { calls.push({ method: 'list', args }); return { data: { files: [{ id: 'f1' }] } }; },
        create: async (args: any) => { calls.push({ method: 'create', args }); return { data: { id: 'test-file-id', size: '4' } }; },
        delete: async (args: any) => { calls.push({ method: 'delete', args }); return {}; },
      },
    };
    const storage = new DriveStorage({ folderId, refreshToken: refreshTokenEnc });
    injectMockDrive(storage, mockDrive);
    const r = await storage.testConnection();
    assert(
      'T96a tout OK → ok=true',
      r.ok && !r.error,
      JSON.stringify(r),
    );
    assert(
      'T96b sequence : list → create → delete',
      calls.length === 3
        && calls[0].method === 'list'
        && calls[1].method === 'create'
        && calls[2].method === 'delete',
      JSON.stringify(calls.map(c => c.method)),
    );
  }
  {
    const mockDrive = {
      files: {
        list: async () => { throw new Error('invalid_grant: refresh_token expired'); },
      },
    };
    const storage = new DriveStorage({ folderId, refreshToken: refreshTokenEnc });
    injectMockDrive(storage, mockDrive);
    const r = await storage.testConnection();
    assert(
      'T96c invalid_grant → ok=false failedAt=auth',
      !r.ok && r.failedAt === 'auth' && !!r.error?.includes('invalid_grant'),
      JSON.stringify(r),
    );
  }
  {
    const mockDrive = {
      files: {
        list: async () => ({ data: { files: [] } }),
        create: async () => { throw new Error('storageQuotaExceeded'); },
      },
    };
    const storage = new DriveStorage({ folderId, refreshToken: refreshTokenEnc });
    injectMockDrive(storage, mockDrive);
    const r = await storage.testConnection();
    assert(
      'T96d create fail → ok=false failedAt=put',
      !r.ok && r.failedAt === 'put',
      JSON.stringify(r),
    );
  }

  // ─── T97 uploadFile encode key + parents ──────────────────────────────
  console.log('\n→ T97 uploadFile encode key avec ___ + parents=[folderId]');
  {
    const calls: Array<{ method: string; args: any }> = [];
    const mockDrive = {
      files: {
        create: async (args: any) => {
          calls.push({ method: 'create', args });
          return { data: { id: 'new-id', size: '12345' } };
        },
      },
    };
    const storage = new DriveStorage({ folderId, refreshToken: refreshTokenEnc });
    injectMockDrive(storage, mockDrive);
    const result = await storage.uploadFile({
      key: 'openquittance/inst-1/2026-05-08T16-00-00-000Z/db.sql.gz',
      body: Buffer.from('test content'),
      contentType: 'application/gzip',
    });
    assert(
      'T97a uploadFile renvoie key + sizeBytes (depuis Drive size)',
      result.key === 'openquittance/inst-1/2026-05-08T16-00-00-000Z/db.sql.gz'
        && result.sizeBytes === 12345,
      JSON.stringify(result),
    );
    const createCall = calls[0];
    const expectedName = 'openquittance___inst-1___2026-05-08T16-00-00-000Z___db.sql.gz';
    assert(
      'T97b name encodé avec slashes → ___',
      createCall.args.requestBody.name === expectedName,
      `name=${createCall.args.requestBody.name}`,
    );
    assert(
      'T97c parents=[folderId]',
      Array.isArray(createCall.args.requestBody.parents)
        && createCall.args.requestBody.parents[0] === folderId,
      JSON.stringify(createCall.args.requestBody.parents),
    );
    assert(
      'T97d media.mimeType = contentType fourni',
      createCall.args.media.mimeType === 'application/gzip',
      `mimeType=${createCall.args.media.mimeType}`,
    );
    assert(
      'T97e supportsAllDrives=true',
      createCall.args.supportsAllDrives === true,
      `supportsAllDrives=${createCall.args.supportsAllDrives}`,
    );
  }

  // ─── T98 listKeys filtre prefix encoded + decode ─────────────────────
  console.log('\n→ T98 listKeys filtre prefix encoded + decode names');
  {
    const calls: Array<{ method: string; args: any }> = [];
    const mockDrive = {
      files: {
        list: async (args: any) => {
          calls.push({ method: 'list', args });
          return {
            data: {
              files: [
                { name: 'openquittance___inst-1___2026-05-08T03___db.sql.gz', size: '100', modifiedTime: '2026-05-08T03:00:00Z' },
                { name: 'openquittance___inst-1___2026-05-08T03___manifest.json', size: '50', modifiedTime: '2026-05-08T03:01:00Z' },
                // Un nom hors-prefix qui contient le keyword → doit être filtré.
                { name: 'autre-fichier-openquittance___test', size: '10' },
              ],
            },
          };
        },
      },
    };
    const storage = new DriveStorage({ folderId, refreshToken: refreshTokenEnc });
    injectMockDrive(storage, mockDrive);
    const list = await storage.listKeys('openquittance/inst-1/');
    assert(
      'T98a listKeys retourne 2 fichiers (filtre strict startsWith après contains Drive)',
      list.length === 2,
      `count=${list.length}`,
    );
    assert(
      'T98b keys décodés (___ → /)',
      list[0].key === 'openquittance/inst-1/2026-05-08T03/db.sql.gz'
        && list[1].key === 'openquittance/inst-1/2026-05-08T03/manifest.json',
      JSON.stringify(list.map(l => l.key)),
    );
    assert(
      'T98c sizeBytes parsé depuis string',
      list[0].sizeBytes === 100 && list[1].sizeBytes === 50,
      `sizes=${list.map(l => l.sizeBytes)}`,
    );
    assert(
      'T98d modifiedAt parsé depuis Drive modifiedTime',
      list[0].modifiedAt instanceof Date,
      'OK',
    );
    const q = calls[0].args.q as string;
    assert(
      'T98e query Drive contient name encoded + parents folderId + trashed=false',
      q.includes('openquittance___inst-1___')
        && q.includes(`'${folderId}' in parents`)
        && q.includes('trashed = false'),
      `q=${q}`,
    );
  }

  // ─── T99 deleteKey ────────────────────────────────────────────────────
  console.log('\n→ T99 deleteKey résout name → fileId via list puis delete');
  {
    const calls: Array<{ method: string; args: any }> = [];
    const mockDrive = {
      files: {
        list: async (args: any) => {
          calls.push({ method: 'list', args });
          return { data: { files: [{ id: 'file-abc' }] } };
        },
        delete: async (args: any) => {
          calls.push({ method: 'delete', args });
          return {};
        },
      },
    };
    const storage = new DriveStorage({ folderId, refreshToken: refreshTokenEnc });
    injectMockDrive(storage, mockDrive);
    await storage.deleteKey('openquittance/inst-1/2026-05-08T03/db.sql.gz');
    assert(
      'T99a sequence : list (résoudre fileId) → delete',
      calls.length === 2
        && calls[0].method === 'list'
        && calls[1].method === 'delete',
      JSON.stringify(calls.map(c => c.method)),
    );
    assert(
      'T99b list query : name = encoded',
      (calls[0].args.q as string).includes('openquittance___inst-1___2026-05-08T03___db.sql.gz'),
      'OK',
    );
    assert(
      'T99c delete fileId = file-abc',
      calls[1].args.fileId === 'file-abc',
      `fileId=${calls[1].args.fileId}`,
    );
  }

  // ─── T100 loadStorageFromConfig sélecteur ─────────────────────────────
  console.log('\n→ T100 loadStorageFromConfig : s3 vs drive selector');
  {
    const s3Cfg = {
      backupStorageType: 's3',
      backupS3Endpoint: 'https://s3.test',
      backupS3Region: 'eu',
      backupS3Bucket: 'b',
      backupS3ForcePathStyle: false,
      backupS3AccessKeyId: encrypt('AK'),
      backupS3SecretKey: encrypt('SK'),
      backupDriveFolderId: null,
      backupDriveRefreshToken: null,
    };
    const s = loadStorageFromConfig(s3Cfg as any);
    assert(
      'T100a backupStorageType="s3" → S3Storage instance',
      s instanceof S3Storage && s.type === 's3',
      `type=${s.type}`,
    );
  }
  {
    // v3.1.0-rc10 : credentials Drive en DB requis.
    const clientIdEncT100 = encrypt('test-client-id');
    const clientSecretEncT100 = encrypt('test-client-secret');
    const driveCfg = {
      backupStorageType: 'drive',
      backupS3Endpoint: null,
      backupS3Region: null,
      backupS3Bucket: null,
      backupS3ForcePathStyle: false,
      backupS3AccessKeyId: null,
      backupS3SecretKey: null,
      backupDriveFolderId: 'folder-xyz',
      backupDriveRefreshToken: refreshTokenEnc,
      googleDriveClientId: clientIdEncT100,
      googleDriveClientSecret: clientSecretEncT100,
    };
    const s = loadStorageFromConfig(driveCfg as any);
    assert(
      'T100b backupStorageType="drive" → DriveStorage instance',
      s instanceof DriveStorage && s.type === 'drive',
      `type=${s.type}`,
    );
  }
  {
    const incomplete = {
      backupStorageType: 's3',
      backupS3Endpoint: null,
      backupS3Bucket: null,
      backupS3AccessKeyId: null,
      backupS3SecretKey: null,
      backupDriveFolderId: null,
      backupDriveRefreshToken: null,
      googleDriveClientId: null,
      googleDriveClientSecret: null,
    } as any;
    let threw = false;
    try { loadStorageFromConfig(incomplete); } catch { threw = true; }
    assert(
      'T100c s3 incomplet → throw',
      threw,
      'OK',
    );
  }
  {
    const driveIncomplete = {
      backupStorageType: 'drive',
      backupDriveFolderId: null,
      backupDriveRefreshToken: null,
      googleDriveClientId: null,
      googleDriveClientSecret: null,
    } as any;
    let threw = false;
    try { loadStorageFromConfig(driveIncomplete); } catch { threw = true; }
    assert(
      'T100d drive incomplet → throw',
      threw,
      'OK',
    );
  }

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.1.0-rc5 backup-drive ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.1.0-rc5 backup-drive passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
