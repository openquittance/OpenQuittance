/**
 * v3.1.0 — abstraction stockage backup.
 *
 * Permet d'utiliser indifféremment S3-compatible (B2 / R2 / Wasabi / AWS /
 * MinIO) ou Google Drive comme cible de backup. Toutes les implémentations
 * exposent la même interface `BackupStorage`.
 *
 * Le runner (`runBackup`) ne connaît pas la cible — il appelle uniquement
 * les méthodes de l'interface.
 */

import type { Readable } from 'node:stream';

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
  /** Étape qui a échoué — utile pour diagnostic UI. */
  failedAt?: 'auth' | 'list' | 'put' | 'delete';
}

export interface UploadResult {
  /** Identifiant logique de l'objet (key S3 ou nom Drive). */
  key: string;
  sizeBytes: number;
}

export interface ListedObject {
  key: string;
  sizeBytes?: number;
  /** Timestamp d'upload, exposé par le storage si dispo. */
  modifiedAt?: Date;
}

export interface BackupStorage {
  /** Type de storage (informatif, sert au logging). */
  readonly type: 's3' | 'drive';

  /**
   * Upload un buffer / stream sous la clé donnée. Pour S3, key = S3 key
   * complet (`openquittance/<inst>/<ts>/db.sql.gz`). Pour Drive, key
   * sert de nom de fichier (slashes remplacés par séparateur safe — voir
   * impl Drive).
   */
  uploadFile(args: {
    key: string;
    body: Readable | Buffer;
    contentType?: string;
  }): Promise<UploadResult>;

  /** Liste tous les objets dont le key commence par prefix. */
  listKeys(prefix: string): Promise<ListedObject[]>;

  /** Supprime un objet par son key. */
  deleteKey(key: string): Promise<void>;

  /** Vérifie l'accès (auth + permissions list + put + delete). */
  testConnection(): Promise<ConnectionTestResult>;
}
