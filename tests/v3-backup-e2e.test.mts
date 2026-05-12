/**
 * Tests v3.1.0-rc6 — Phase 2 Session 5 : E2E backup S3 (MinIO).
 *
 * Pré-requis avant lancement :
 *   1. docker compose -f docker-compose.test.yml up -d
 *   2. attendre healthchecks (~10s)
 *   3. TEST_E2E=1 npx tsx tests/v3-backup-e2e.test.mts
 *
 * Sans TEST_E2E=1, le test est skipé (CI default = pas de docker
 * automatique). À activer Phase 3 dans CI dédiée.
 *
 * Couverture :
 *   T101 createBucket + S3Storage.testConnection vers MinIO local → ok
 *   T102 S3Storage uploadFile + listKeys + deleteKey round-trip
 *   T103 encryptEnv → upload → download → decryptEnv → identité
 *   T104 cleanupOldBackupsViaStorage filtre + suppression réelle
 */

import { randomBytes } from 'node:crypto';

// ─── Skip propre si TEST_E2E pas défini ───────────────────────────────
if (!process.env.TEST_E2E) {
  console.log('→ E2E skipé (TEST_E2E non défini).');
  console.log('  Pour lancer :');
  console.log('    docker compose -f docker-compose.test.yml up -d');
  console.log('    TEST_E2E=1 npx tsx tests/v3-backup-e2e.test.mts');
  process.exit(0);
}

if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  DeleteBucketCommand,
} = await import('@aws-sdk/client-s3');
const { S3Storage } = await import('../src/lib/backup/storage/s3.ts');
const { encryptEnv } = await import('../src/lib/backup/runner.ts');
const { cleanupOldBackupsViaStorage } = await import('../src/lib/backup/cleanup.ts');
const { encrypt } = await import('../src/lib/crypto.ts');

const ENDPOINT = process.env.E2E_S3_ENDPOINT ?? 'http://localhost:9100';
const ACCESS_KEY = process.env.E2E_S3_ACCESS_KEY ?? 'testuser';
const SECRET_KEY = process.env.E2E_S3_SECRET_KEY ?? 'testpassword123';
const BUCKET = `oq-test-${Date.now()}`;

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // ─── Setup : create bucket ────────────────────────────────────────────
  console.log(`\n→ Setup MinIO bucket "${BUCKET}" sur ${ENDPOINT}`);
  const adminClient = new S3Client({
    endpoint: ENDPOINT,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });
  try {
    await adminClient.send(new CreateBucketCommand({ Bucket: BUCKET }));
  } catch (e) {
    console.error('Échec create bucket :', e);
    process.exit(1);
  }
  console.log(`  Bucket créé.`);

  // S3Storage utilisée par tous les tests E2E.
  const storage = new S3Storage({
    endpoint: ENDPOINT,
    region: 'us-east-1',
    bucket: BUCKET,
    forcePathStyle: true,
    accessKeyId: encrypt(ACCESS_KEY),
    secretAccessKey: encrypt(SECRET_KEY),
  });

  try {
    // ─── T101 testConnection vers MinIO réel ────────────────────────────
    console.log('\n→ T101 S3Storage.testConnection vers MinIO');
    const r = await storage.testConnection();
    assert(
      'T101 testConnection MinIO local → ok=true',
      r.ok && !r.error,
      JSON.stringify(r),
    );

    // ─── T102 upload + list + delete round-trip ─────────────────────────
    console.log('\n→ T102 uploadFile + listKeys + deleteKey round-trip');
    const testKey = 'openquittance/inst-e2e/2026-05-08T03-00-00-000Z/test.bin';
    const testBody = Buffer.from('payload-e2e-' + Date.now());
    const upload = await storage.uploadFile({
      key: testKey,
      body: testBody,
      contentType: 'application/octet-stream',
    });
    assert(
      'T102a uploadFile retourne key + sizeBytes',
      upload.key === testKey && upload.sizeBytes === testBody.length,
      JSON.stringify(upload),
    );
    const list = await storage.listKeys('openquittance/inst-e2e/');
    assert(
      'T102b listKeys retourne le fichier uploadé',
      list.some(o => o.key === testKey && o.sizeBytes === testBody.length),
      `count=${list.length} keys=${list.map(o => o.key).join(',')}`,
    );
    await storage.deleteKey(testKey);
    const listAfterDelete = await storage.listKeys('openquittance/inst-e2e/');
    assert(
      'T102c deleteKey supprime → list vide',
      !listAfterDelete.some(o => o.key === testKey),
      `count=${listAfterDelete.length}`,
    );

    // ─── T103 encryptEnv round-trip via storage ─────────────────────────
    console.log('\n→ T103 encryptEnv upload → download → decrypt');
    const passphrase = 'e2e-passphrase-ultra-secure';
    const envContent = Buffer.from('DATABASE_URL=postgres://...\nENCRYPTION_SECRET=xyz\n');
    const envEnc = encryptEnv(envContent, passphrase);
    const envKey = 'openquittance/inst-e2e/2026-05-08T03-00-00-000Z/env.enc';
    await storage.uploadFile({ key: envKey, body: envEnc, contentType: 'application/octet-stream' });

    // Download + verify magic
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const obj = await adminClient.send(new GetObjectCommand({ Bucket: BUCKET, Key: envKey }));
    const downloaded = Buffer.concat(await streamToChunks(obj.Body as any));
    assert(
      'T103a env.enc téléchargé avec magic OQENC1',
      downloaded.subarray(0, 6).toString('ascii') === 'OQENC1'
        && downloaded.length === envEnc.length,
      `len=${downloaded.length} expected=${envEnc.length}`,
    );

    // Decrypt
    const { scryptSync, createDecipheriv } = await import('node:crypto');
    const salt = downloaded.subarray(6, 22);
    const iv = downloaded.subarray(22, 34);
    const tag = downloaded.subarray(34, 50);
    const ct = downloaded.subarray(50);
    const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ct), decipher.final()]);
    assert(
      'T103b decrypt avec passphrase → identité',
      decrypted.equals(envContent),
      `decrypted=${decrypted.toString().slice(0, 40)}...`,
    );

    await storage.deleteKey(envKey);

    // ─── T104 cleanup réel ──────────────────────────────────────────────
    console.log('\n→ T104 cleanupOldBackupsViaStorage');
    const day = 86_400_000;
    const oldTs = new Date(Date.now() - 50 * day).toISOString().replace(/[:.]/g, '-');
    const newTs = new Date(Date.now() - 1 * day).toISOString().replace(/[:.]/g, '-');
    await storage.uploadFile({
      key: `openquittance/inst-cleanup/${oldTs}/file.bin`,
      body: Buffer.from('old'),
    });
    await storage.uploadFile({
      key: `openquittance/inst-cleanup/${newTs}/file.bin`,
      body: Buffer.from('new'),
    });
    const cleanupResult = await cleanupOldBackupsViaStorage(storage, 'inst-cleanup', 30);
    assert(
      'T104a cleanup retentionDays=30 → 1 supprimé (50j), 1 gardé (1j)',
      cleanupResult.deletedCount === 1
        && cleanupResult.deletedTimestamps.length === 1
        && cleanupResult.deletedTimestamps[0] === oldTs,
      JSON.stringify(cleanupResult),
    );
    const afterCleanup = await storage.listKeys('openquittance/inst-cleanup/');
    assert(
      'T104b après cleanup, seul newTs reste',
      afterCleanup.length === 1 && afterCleanup[0].key.includes(newTs),
      `count=${afterCleanup.length}`,
    );

    // Cleanup final
    for (const o of afterCleanup) await storage.deleteKey(o.key);
  } finally {
    // Teardown bucket (vide d'abord, puis delete)
    try {
      const remaining = await storage.listKeys('');
      for (const o of remaining) await storage.deleteKey(o.key);
      await adminClient.send(new DeleteBucketCommand({ Bucket: BUCKET }));
      console.log(`\n  Bucket "${BUCKET}" supprimé.`);
    } catch (e) {
      console.error('  Échec teardown bucket :', e);
    }
  }

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests E2E passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests E2E v3.1.0-rc6 ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests E2E v3.1.0-rc6 passent.');
}

async function streamToChunks(stream: NodeJS.ReadableStream): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  for await (const c of stream) {
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  }
  return chunks;
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
