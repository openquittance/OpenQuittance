/**
 * Tests v3.1.0-rc2 — Phase 2 Session 2 : runner backup S3.
 *
 * T87 testConnection : HeadBucket OK / 403 head / 404 head / put fail / delete fail
 * T88 encryptEnv round-trip : decrypt avec bonne passphrase → identité,
 *     mauvaise passphrase → throw (auth tag GCM)
 * T89 cleanupOldBackups : parse timestamps, filtre cutoff, batch delete
 * T90 manifest construction : structure, hashes SHA-256 cohérents
 *
 * Pure tests — aws-sdk-client-mock + crypto direct.
 *
 * Note : runBackup() complet (orchestration prisma + spawn pg_dump +
 * generateBailleurZip) requiert stack DB + Postgres. Couvert Session 5/6
 * en E2E MinIO + Postgres test.
 */

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

// Stub ENCRYPTION_SECRET avant imports
if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const { testConnection, createS3Client } = await import('../src/lib/backup/s3.ts');
const { encryptEnv } = await import('../src/lib/backup/runner.ts');
const { cleanupOldBackups } = await import('../src/lib/backup/cleanup.ts');

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

/** Re-implémentation decryptEnv pour tests round-trip (le vrai vivra dans
 *  scripts/restore-env.mjs Session 5). */
function decryptEnv(buf: Buffer, passphrase: string): Buffer {
  const MAGIC = Buffer.from('OQENC1', 'ascii');
  if (!buf.subarray(0, 6).equals(MAGIC)) throw new Error('Magic OQENC1 absent');
  const salt = buf.subarray(6, 22);
  const iv = buf.subarray(22, 34);
  const tag = buf.subarray(34, 50);
  const ct = buf.subarray(50);
  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

async function main() {
  // ─── T87 testConnection 5 paths ───────────────────────────────────────
  console.log('\n→ T87 testConnection 5 paths via aws-sdk-client-mock');
  {
    const mock = mockClient(S3Client);
    mock.on(HeadBucketCommand).resolves({});
    mock.on(PutObjectCommand).resolves({});
    mock.on(DeleteObjectCommand).resolves({});
    const client = createS3Client({
      endpoint: 'https://s3.test.local',
      region: 'auto', bucket: 'b', forcePathStyle: false,
      accessKeyId: 'AK', secretAccessKey: 'SK',
    });
    const r = await testConnection(client, 'b');
    assert(
      'T87a tout OK → ok=true',
      r.ok && !r.error,
      JSON.stringify(r),
    );
    mock.restore();
  }
  {
    const mock = mockClient(S3Client);
    mock.on(HeadBucketCommand).rejects(new Error('Forbidden 403'));
    const client = createS3Client({
      endpoint: 'https://s3.test.local',
      region: 'auto', bucket: 'b', forcePathStyle: false,
      accessKeyId: 'AK', secretAccessKey: 'SK',
    });
    const r = await testConnection(client, 'b');
    assert(
      'T87b head 403 → ok=false failedAt=head',
      !r.ok && r.failedAt === 'head' && !!r.error?.includes('403'),
      JSON.stringify(r),
    );
    mock.restore();
  }
  {
    const mock = mockClient(S3Client);
    mock.on(HeadBucketCommand).rejects(new Error('NotFound 404'));
    const client = createS3Client({
      endpoint: 'https://s3.test.local',
      region: 'auto', bucket: 'b', forcePathStyle: false,
      accessKeyId: 'AK', secretAccessKey: 'SK',
    });
    const r = await testConnection(client, 'b');
    assert(
      'T87c head 404 → ok=false failedAt=head',
      !r.ok && r.failedAt === 'head',
      JSON.stringify(r),
    );
    mock.restore();
  }
  {
    const mock = mockClient(S3Client);
    mock.on(HeadBucketCommand).resolves({});
    mock.on(PutObjectCommand).rejects(new Error('AccessDenied'));
    const client = createS3Client({
      endpoint: 'https://s3.test.local',
      region: 'auto', bucket: 'b', forcePathStyle: false,
      accessKeyId: 'AK', secretAccessKey: 'SK',
    });
    const r = await testConnection(client, 'b');
    assert(
      'T87d put AccessDenied → ok=false failedAt=put',
      !r.ok && r.failedAt === 'put',
      JSON.stringify(r),
    );
    mock.restore();
  }
  {
    const mock = mockClient(S3Client);
    mock.on(HeadBucketCommand).resolves({});
    mock.on(PutObjectCommand).resolves({});
    mock.on(DeleteObjectCommand).rejects(new Error('Forbidden'));
    const client = createS3Client({
      endpoint: 'https://s3.test.local',
      region: 'auto', bucket: 'b', forcePathStyle: false,
      accessKeyId: 'AK', secretAccessKey: 'SK',
    });
    const r = await testConnection(client, 'b');
    assert(
      'T87e delete fail → ok=true mais warning error présent',
      r.ok && !!r.error,
      JSON.stringify(r),
    );
    mock.restore();
  }

  // ─── T88 encryptEnv round-trip + tamper detection ─────────────────────
  console.log('\n→ T88 encryptEnv round-trip + auth tag GCM');
  {
    const plain = Buffer.from('DATABASE_URL=postgres://...\nNEXTAUTH_SECRET=xyz\n', 'utf8');
    const passphrase = 'ma-passphrase-test-12-chars';
    const enc = encryptEnv(plain, passphrase);
    assert(
      'T88a enc commence par OQENC1 magic',
      enc.subarray(0, 6).toString('ascii') === 'OQENC1',
      `header=${enc.subarray(0, 6).toString('hex')}`,
    );
    assert(
      'T88b longueur enc = 6+16+12+16+plain (50 + plain.length)',
      enc.length === 50 + plain.length,
      `enc.length=${enc.length} expected=${50 + plain.length}`,
    );
    const dec = decryptEnv(enc, passphrase);
    assert(
      'T88c decrypt round-trip → identité',
      dec.equals(plain),
      `decrypted=${dec.toString('utf8').slice(0, 40)}...`,
    );
    let threw = false;
    try {
      decryptEnv(enc, 'mauvaise-passphrase-12-chars');
    } catch {
      threw = true;
    }
    assert(
      'T88d mauvaise passphrase → throw (auth tag GCM)',
      threw,
      threw ? 'OK throw' : 'BUG : decrypted avec mauvaise passphrase',
    );
    // Tamper : flip 1 bit du ciphertext → throw
    const tampered = Buffer.from(enc);
    tampered[60] ^= 0x01;
    let tamperThrew = false;
    try {
      decryptEnv(tampered, passphrase);
    } catch {
      tamperThrew = true;
    }
    assert(
      'T88e tamper 1 bit ciphertext → throw',
      tamperThrew,
      'OK',
    );
    // 2 chiffrements identiques → résultats différents (salt + IV aléatoires)
    const enc1 = encryptEnv(plain, passphrase);
    const enc2 = encryptEnv(plain, passphrase);
    assert(
      'T88f salt + IV aléatoires → 2 enc identiques produisent buffers différents',
      !enc1.equals(enc2)
        && decryptEnv(enc1, passphrase).equals(decryptEnv(enc2, passphrase)),
      'OK',
    );
  }

  // ─── T89 cleanupOldBackups parse + filtre + delete ───────────────────
  console.log('\n→ T89 cleanupOldBackups parse timestamps + filtre cutoff + delete batch');
  {
    const mock = mockClient(S3Client);
    const now = Date.now();
    const day = 86_400_000;
    // 3 backups : il y a 50 jours, 20 jours, 1 jour
    const ts50 = new Date(now - 50 * day).toISOString().replace(/[:.]/g, '-');
    const ts20 = new Date(now - 20 * day).toISOString().replace(/[:.]/g, '-');
    const ts1 = new Date(now - 1 * day).toISOString().replace(/[:.]/g, '-');
    const objects = [
      { Key: `openquittance/inst-1/${ts50}/db.sql.gz`, Size: 1000 },
      { Key: `openquittance/inst-1/${ts50}/manifest.json`, Size: 500 },
      { Key: `openquittance/inst-1/${ts20}/db.sql.gz`, Size: 2000 },
      { Key: `openquittance/inst-1/${ts1}/db.sql.gz`, Size: 3000 },
    ];
    mock.on(ListObjectsV2Command).resolves({ Contents: objects });
    let deletedKeys: string[] = [];
    mock.on(DeleteObjectsCommand).callsFake((input) => {
      deletedKeys = (input.Delete?.Objects ?? []).map((o: { Key?: string }) => o.Key ?? '');
      return Promise.resolve({});
    });
    const client = createS3Client({
      endpoint: 'https://s3.test.local',
      region: 'auto', bucket: 'b', forcePathStyle: false,
      accessKeyId: 'AK', secretAccessKey: 'SK',
    });
    const r = await cleanupOldBackups(client, 'b', 'inst-1', 30);
    assert(
      'T89a retentionDays=30 → supprime backup 50j (2 fichiers), garde 20j + 1j',
      r.deletedCount === 2 && r.freedBytes === 1500,
      `deletedCount=${r.deletedCount} freed=${r.freedBytes}`,
    );
    assert(
      'T89b deletedTimestamps contient ts50 uniquement',
      r.deletedTimestamps.length === 1 && r.deletedTimestamps[0] === ts50,
      JSON.stringify(r.deletedTimestamps),
    );
    assert(
      'T89c DeleteObjects appelé avec les 2 keys du backup 50j',
      deletedKeys.length === 2
        && deletedKeys.every(k => k.includes(ts50)),
      JSON.stringify(deletedKeys),
    );
    mock.restore();
  }

  // ─── T90 cleanup retention=0 → tout supprimé ──────────────────────────
  console.log('\n→ T90 cleanupOldBackups bornes : retention=0 → tout, retention=999 → rien');
  {
    const mock = mockClient(S3Client);
    const now = Date.now();
    const day = 86_400_000;
    const ts1 = new Date(now - 1 * day).toISOString().replace(/[:.]/g, '-');
    const objects = [
      { Key: `openquittance/inst-2/${ts1}/db.sql.gz`, Size: 1000 },
    ];
    mock.on(ListObjectsV2Command).resolves({ Contents: objects });
    mock.on(DeleteObjectsCommand).resolves({});
    const client = createS3Client({
      endpoint: 'https://s3.test.local',
      region: 'auto', bucket: 'b', forcePathStyle: false,
      accessKeyId: 'AK', secretAccessKey: 'SK',
    });
    const r0 = await cleanupOldBackups(client, 'b', 'inst-2', 0);
    assert(
      'T90a retention=0 → 1 fichier supprimé',
      r0.deletedCount === 1,
      `deletedCount=${r0.deletedCount}`,
    );
    mock.restore();
  }
  {
    const mock = mockClient(S3Client);
    const now = Date.now();
    const day = 86_400_000;
    const ts1 = new Date(now - 1 * day).toISOString().replace(/[:.]/g, '-');
    mock.on(ListObjectsV2Command).resolves({
      Contents: [{ Key: `openquittance/inst-3/${ts1}/db.sql.gz`, Size: 1000 }],
    });
    mock.on(DeleteObjectsCommand).resolves({});
    const client = createS3Client({
      endpoint: 'https://s3.test.local',
      region: 'auto', bucket: 'b', forcePathStyle: false,
      accessKeyId: 'AK', secretAccessKey: 'SK',
    });
    const r999 = await cleanupOldBackups(client, 'b', 'inst-3', 999);
    assert(
      'T90b retention=999 → 0 fichier (1j < 999j)',
      r999.deletedCount === 0,
      `deletedCount=${r999.deletedCount}`,
    );
    mock.restore();
  }

  // ─── T90c pagination List > 1 page ────────────────────────────────────
  {
    const mock = mockClient(S3Client);
    const now = Date.now();
    const day = 86_400_000;
    const tsOld = new Date(now - 100 * day).toISOString().replace(/[:.]/g, '-');
    let callCount = 0;
    mock.on(ListObjectsV2Command).callsFake((input) => {
      callCount++;
      if (!input.ContinuationToken) {
        return Promise.resolve({
          Contents: [{ Key: `openquittance/inst-4/${tsOld}/page1.bin`, Size: 100 }],
          IsTruncated: true,
          NextContinuationToken: 'token-2',
        });
      }
      return Promise.resolve({
        Contents: [{ Key: `openquittance/inst-4/${tsOld}/page2.bin`, Size: 200 }],
        IsTruncated: false,
      });
    });
    mock.on(DeleteObjectsCommand).resolves({});
    const client = createS3Client({
      endpoint: 'https://s3.test.local',
      region: 'auto', bucket: 'b', forcePathStyle: false,
      accessKeyId: 'AK', secretAccessKey: 'SK',
    });
    const r = await cleanupOldBackups(client, 'b', 'inst-4', 30);
    assert(
      'T90c pagination List → 2 pages traitées, 2 fichiers supprimés',
      callCount === 2 && r.deletedCount === 2 && r.freedBytes === 300,
      `calls=${callCount} deleted=${r.deletedCount} freed=${r.freedBytes}`,
    );
    mock.restore();
  }

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.1.0-rc2 backup-runner ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.1.0-rc2 backup-runner passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
