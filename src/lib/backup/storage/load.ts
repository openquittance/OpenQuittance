import type { AppConfig } from '@prisma/client';
import { S3Storage, type BackupS3Config } from './s3';
import { DriveStorage, type BackupDriveConfig } from './drive';
import type { BackupStorage } from './index';

/**
 * v3.1.0-rc5 — sélectionne le BackupStorage selon AppConfig.backupStorageType.
 *
 * Throw si la config est incomplète pour le type choisi (l'API et le runner
 * catchent et reportent l'erreur en BackupRun).
 */
export function loadStorageFromConfig(cfg: Pick<AppConfig,
  | 'backupStorageType'
  | 'backupS3Endpoint'
  | 'backupS3Region'
  | 'backupS3Bucket'
  | 'backupS3ForcePathStyle'
  | 'backupS3AccessKeyId'
  | 'backupS3SecretKey'
  | 'backupDriveFolderId'
  | 'backupDriveRefreshToken'
  | 'googleDriveClientId'
  | 'googleDriveClientSecret'
>): BackupStorage {
  const type = cfg.backupStorageType ?? 's3';
  if (type === 's3') {
    if (!cfg.backupS3Endpoint || !cfg.backupS3Bucket
      || !cfg.backupS3AccessKeyId || !cfg.backupS3SecretKey) {
      throw new Error('Configuration S3 incomplète (endpoint / bucket / credentials)');
    }
    const s3Config: BackupS3Config = {
      endpoint: cfg.backupS3Endpoint,
      region: cfg.backupS3Region,
      bucket: cfg.backupS3Bucket,
      forcePathStyle: cfg.backupS3ForcePathStyle,
      accessKeyId: cfg.backupS3AccessKeyId,
      secretAccessKey: cfg.backupS3SecretKey,
    };
    return new S3Storage(s3Config);
  }
  if (type === 'drive') {
    if (!cfg.backupDriveFolderId || !cfg.backupDriveRefreshToken
      || !cfg.googleDriveClientId || !cfg.googleDriveClientSecret) {
      throw new Error('Configuration Google Drive incomplète (folderId / refreshToken / clientId / clientSecret)');
    }
    const driveConfig: BackupDriveConfig = {
      refreshToken: cfg.backupDriveRefreshToken,
      folderId: cfg.backupDriveFolderId,
      clientId: cfg.googleDriveClientId,
      clientSecret: cfg.googleDriveClientSecret,
    };
    return new DriveStorage(driveConfig);
  }
  throw new Error(`Type de stockage backup inconnu : "${type}"`);
}
