/**
 * v3.1.0-rc5 — compat shim. La logique S3 a été déplacée dans
 * `src/lib/backup/storage/s3.ts` derrière l'interface `BackupStorage`
 * (Session 4bis). Ce fichier conserve les exports legacy pour ne pas
 * casser les imports existants (tests + route test-connection).
 *
 * Nouveau code → utiliser `loadStorage()` depuis `./storage`.
 */

import { S3Storage, type BackupS3Config } from './storage/s3';
import type { Readable } from 'node:stream';

export type { BackupS3Config };

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
  failedAt?: 'head' | 'put' | 'delete';
}

/**
 * @deprecated v3.1.0-rc5 — utiliser `new S3Storage(config)` directement.
 *
 * Conservé pour compat tests v3-backup-runner. Renvoie un wrapper qui
 * adapte les méthodes BackupStorage au signature legacy.
 */
export function createS3Client(config: BackupS3Config) {
  // Le wrapper expose `send()` mocké par aws-sdk-client-mock dans les
  // tests. On crée un vrai S3Client en interne via S3Storage qui le
  // détient. Pour ne pas casser les mocks, on instancie un S3Client
  // direct identique.
  const { S3Client } = require('@aws-sdk/client-s3');
  const { decrypt } = require('../crypto');
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region || 'auto',
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: decrypt(config.accessKeyId),
      secretAccessKey: decrypt(config.secretAccessKey),
    },
  });
}

/**
 * @deprecated v3.1.0-rc5 — utiliser `S3Storage.testConnection()`.
 *
 * Maintient la signature legacy pour tests + route test-connection.
 */
export async function testConnection(client: any, bucket: string): Promise<ConnectionTestResult> {
  const {
    HeadBucketCommand,
    PutObjectCommand,
    DeleteObjectCommand,
  } = require('@aws-sdk/client-s3');
  const testKey = `_openquittance-conn-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (e) {
    return { ok: false, failedAt: 'head', error: errMsg(e) };
  }
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: 'openquittance-connection-test',
      ContentType: 'text/plain',
    }));
  } catch (e) {
    return { ok: false, failedAt: 'put', error: errMsg(e) };
  }
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: testKey }));
  } catch (e) {
    return { ok: true, error: `Test file uploaded but delete failed: ${errMsg(e)}` };
  }
  return { ok: true };
}

/**
 * @deprecated v3.1.0-rc5 — utiliser `S3Storage.uploadFile()`.
 */
export async function uploadStream(
  client: any,
  bucket: string,
  key: string,
  body: Readable | Buffer | string,
  contentType?: string,
): Promise<{ key: string; sizeBytes: number }> {
  const { Upload } = require('@aws-sdk/lib-storage');
  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType ?? 'application/octet-stream',
    },
    partSize: 5 * 1024 * 1024,
    queueSize: 4,
  });
  let sizeBytes = 0;
  upload.on('httpUploadProgress', (progress: { loaded?: number }) => {
    if (typeof progress.loaded === 'number') sizeBytes = progress.loaded;
  });
  await upload.done();
  return { key, sizeBytes };
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return JSON.stringify(e);
}

// Re-export S3Storage pour le nouveau code.
export { S3Storage };
