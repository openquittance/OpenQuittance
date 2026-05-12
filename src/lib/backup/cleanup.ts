import {
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { BackupStorage } from './storage/index';

/**
 * v3.1.0 — purge des backups antérieurs à `retentionDays`.
 *
 * Layout (S3 ou Drive) :
 *   openquittance/<instanceId>/<ISO-timestamp>/...
 *
 * On parse le timestamp depuis la 3ème partie du key, compare à
 * `Date.now() - retentionDays * 86400_000`, et supprime tous les
 * objets dont le timestamp est plus ancien.
 *
 * 2 APIs publiques :
 *   - cleanupOldBackups(client, bucket, instanceId, retentionDays)
 *     → legacy S3-only, conservé pour tests Session 2 + route admin.
 *   - cleanupOldBackupsViaStorage(storage, instanceId, retentionDays)
 *     → nouveau, via abstraction BackupStorage (S3 + Drive).
 */

export interface CleanupResult {
  deletedCount: number;
  freedBytes: number;
  /** Timestamps de backups complets supprimés (informatif). */
  deletedTimestamps: string[];
}

const PREFIX_REGEX = /^openquittance\/[^/]+\/([^/]+)\//;

function parseTimestamp(timestamp: string): Date | null {
  // Format produit par runner : ISO avec ":" et "." remplacés par "-"
  // Ex : "2026-05-08T16-30-45-123Z"
  const restored = timestamp.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    '$1:$2:$3.$4Z',
  );
  const d = new Date(restored);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Legacy S3-only — conservé pour tests v3-backup-runner.test.mts +
 * route admin/backup/cleanup (futur). Utilise directement S3Client
 * (mockable via aws-sdk-client-mock).
 */
export async function cleanupOldBackups(
  client: S3Client,
  bucket: string,
  instanceId: string,
  retentionDays: number,
): Promise<CleanupResult> {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const prefix = `openquittance/${instanceId}/`;

  const allObjects: { Key: string; Size?: number; timestamp: string }[] = [];
  let continuationToken: string | undefined;
  do {
    const out = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const obj of out.Contents ?? []) {
      if (!obj.Key) continue;
      const m = obj.Key.match(PREFIX_REGEX);
      if (!m) continue;
      allObjects.push({ Key: obj.Key, Size: obj.Size, timestamp: m[1] });
    }
    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);

  const toDelete = allObjects.filter(o => {
    const d = parseTimestamp(o.timestamp);
    return d && d.getTime() < cutoff;
  });
  const deletedTimestamps = new Set(toDelete.map(o => o.timestamp));

  let freedBytes = 0;
  for (let i = 0; i < toDelete.length; i += 1000) {
    const batch = toDelete.slice(i, i + 1000);
    await client.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: batch.map(o => ({ Key: o.Key })),
        Quiet: true,
      },
    }));
    for (const o of batch) freedBytes += o.Size ?? 0;
  }

  return {
    deletedCount: toDelete.length,
    freedBytes,
    deletedTimestamps: Array.from(deletedTimestamps).sort(),
  };
}

/**
 * v3.1.0-rc5 — cleanup via abstraction BackupStorage. Marche pour S3
 * et Drive uniformément.
 */
export async function cleanupOldBackupsViaStorage(
  storage: BackupStorage,
  instanceId: string,
  retentionDays: number,
): Promise<CleanupResult> {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const prefix = `openquittance/${instanceId}/`;

  const all = await storage.listKeys(prefix);
  const toDelete = all.filter(o => {
    const m = o.key.match(PREFIX_REGEX);
    if (!m) return false;
    const d = parseTimestamp(m[1]);
    return d && d.getTime() < cutoff;
  });
  const deletedTimestamps = new Set<string>();
  for (const o of toDelete) {
    const m = o.key.match(PREFIX_REGEX);
    if (m) deletedTimestamps.add(m[1]);
  }

  let freedBytes = 0;
  for (const o of toDelete) {
    await storage.deleteKey(o.key);
    freedBytes += o.sizeBytes ?? 0;
  }

  return {
    deletedCount: toDelete.length,
    freedBytes,
    deletedTimestamps: Array.from(deletedTimestamps).sort(),
  };
}
