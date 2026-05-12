import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { Readable } from 'node:stream';
import { decrypt } from '../../crypto';
import type { BackupStorage, ConnectionTestResult, ListedObject, UploadResult } from './index';

/**
 * v3.1.0 — implémentation S3-compatible de BackupStorage.
 *
 * Compat path-style :
 *   - B2          : forcePathStyle=false, endpoint s3.<region>.backblazeb2.com
 *   - R2          : forcePathStyle=false, endpoint <account>.r2.cloudflarestorage.com, region "auto"
 *   - Wasabi      : forcePathStyle=false, endpoint s3.<region>.wasabisys.com
 *   - AWS         : endpoint omis ou s3.<region>.amazonaws.com
 *   - MinIO local : forcePathStyle=true,  endpoint http://localhost:9000
 */

export interface BackupS3Config {
  endpoint: string;
  region: string | null;
  bucket: string;
  forcePathStyle: boolean;
  /** Chiffré (préfixe enc:v1:) — décrypté au runtime. */
  accessKeyId: string;
  /** Chiffré (préfixe enc:v1:) — décrypté au runtime. */
  secretAccessKey: string;
}

function buildS3Client(config: BackupS3Config): S3Client {
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

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return JSON.stringify(e);
}

export class S3Storage implements BackupStorage {
  readonly type = 's3' as const;
  private client: S3Client;
  private bucket: string;

  constructor(config: BackupS3Config) {
    this.client = buildS3Client(config);
    this.bucket = config.bucket;
  }

  async uploadFile(args: { key: string; body: Readable | Buffer; contentType?: string }): Promise<UploadResult> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: args.key,
        Body: args.body,
        ContentType: args.contentType ?? 'application/octet-stream',
      },
      partSize: 5 * 1024 * 1024,
      queueSize: 4,
    });
    let sizeBytes = 0;
    upload.on('httpUploadProgress', (p) => {
      if (typeof p.loaded === 'number') sizeBytes = p.loaded;
    });
    await upload.done();
    return { key: args.key, sizeBytes };
  }

  async listKeys(prefix: string): Promise<ListedObject[]> {
    const all: ListedObject[] = [];
    let token: string | undefined;
    do {
      const out = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }));
      for (const o of out.Contents ?? []) {
        if (!o.Key) continue;
        all.push({ key: o.Key, sizeBytes: o.Size, modifiedAt: o.LastModified });
      }
      token = out.IsTruncated ? out.NextContinuationToken : undefined;
    } while (token);
    return all;
  }

  async deleteKey(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /**
   * Suppression batch. Plus efficace que deleteKey en boucle pour > 50
   * objets. Utilisé par cleanup.
   */
  async deleteKeysBatch(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: batch.map(k => ({ Key: k })), Quiet: true },
      }));
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const testKey = `_openquittance-conn-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (e) {
      return { ok: false, failedAt: 'auth', error: errMsg(e) };
    }
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: testKey,
        Body: 'openquittance-connection-test',
        ContentType: 'text/plain',
      }));
    } catch (e) {
      return { ok: false, failedAt: 'put', error: errMsg(e) };
    }
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: testKey }));
    } catch (e) {
      return { ok: true, error: `Test file uploaded but delete failed: ${errMsg(e)}` };
    }
    return { ok: true };
  }
}
