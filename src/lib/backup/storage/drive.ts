import { google, drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';
import { decrypt, encrypt } from '../../crypto';
import { prisma } from '../../prisma';
import type { BackupStorage, ConnectionTestResult, ListedObject, UploadResult } from './index';

/**
 * v3.1.0 — implémentation Google Drive de BackupStorage.
 *
 * Scope minimal : `https://www.googleapis.com/auth/drive.file` — accès
 * uniquement aux fichiers créés par l'app (pas accès aux autres fichiers
 * Drive du user). C'est volontaire pour la sécurité : si compromis, le
 * dommage est limité à ce que l'app a créé.
 *
 * Mapping S3 ↔ Drive :
 *   - "key" S3 (`openquittance/<inst>/<ts>/db.sql.gz`) → "name" Drive
 *     (slashes remplacés par `___` car Drive ne supporte pas les paths).
 *     Tous les fichiers sont dans `parents=[folderId]`.
 *   - listKeys(prefix) → drive.files.list(name STARTS WITH prefix-encoded)
 *
 * Limites :
 *   - Drive impose 5 To max par fichier en API resumable.
 *   - Pas de "directory" — tous les backups sont à plat dans le folder.
 *     Le mapping nom↔key permet de retrouver l'arbre.
 */

const KEY_SEPARATOR = '___';

function encodeKey(key: string): string {
  return key.replace(/\//g, KEY_SEPARATOR);
}

function decodeKey(name: string): string {
  return name.replace(new RegExp(KEY_SEPARATOR, 'g'), '/');
}

export interface BackupDriveConfig {
  /** Refresh token chiffré (`enc:v1:`). */
  refreshToken: string;
  /** ID du dossier Drive cible (URL Drive : /folders/<id>). */
  folderId: string;
  /** v3.1.0-rc10 — credentials OAuth saisis via UI, chiffrés (`enc:v1:`). */
  clientId: string;
  clientSecret: string;
}

/**
 * v3.1.0-rc10 — buildOAuthClient prend les credentials en paramètres
 * (depuis AppConfig DB), plus de lecture process.env.
 */
export function buildOAuthClient(args: {
  clientIdEnc: string;
  clientSecretEnc: string;
  redirectUri?: string;
}) {
  const clientId = decrypt(args.clientIdEnc);
  const clientSecret = decrypt(args.clientSecretEnc);
  const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '');
  const redirectUri = args.redirectUri
    ?? `${baseUrl}/api/admin/backup/drive/oauth/callback`;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Construit un client Drive authentifié depuis le refresh token chiffré.
 * Refresh access token automatique si expiré (oauth2 lib gère cela
 * transparent à l'API).
 */
export function createDriveClient(args: {
  refreshTokenEnc: string;
  clientIdEnc: string;
  clientSecretEnc: string;
}): {
  drive: drive_v3.Drive;
  oauth2: ReturnType<typeof buildOAuthClient>;
} {
  const oauth2 = buildOAuthClient({
    clientIdEnc: args.clientIdEnc,
    clientSecretEnc: args.clientSecretEnc,
  });
  oauth2.setCredentials({ refresh_token: decrypt(args.refreshTokenEnc) });
  // Hook : si access_token est rafraîchi, on peut le persister en cache.
  oauth2.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      // Google peut renvoyer un nouveau refresh_token (rare mais possible).
      try {
        await prisma.appConfig.update({
          where: { id: 'singleton' },
          data: { backupDriveRefreshToken: encrypt(tokens.refresh_token) },
        });
      } catch (e) {
        console.error('[backup/drive] Échec persist nouveau refresh_token :', e);
      }
    }
  });
  const drive = google.drive({ version: 'v3', auth: oauth2 });
  return { drive, oauth2 };
}

export class DriveStorage implements BackupStorage {
  readonly type = 'drive' as const;
  private drive: drive_v3.Drive;
  private folderId: string;

  constructor(config: BackupDriveConfig) {
    const { drive } = createDriveClient({
      refreshTokenEnc: config.refreshToken,
      clientIdEnc: config.clientId,
      clientSecretEnc: config.clientSecret,
    });
    this.drive = drive;
    this.folderId = config.folderId;
  }

  async uploadFile(args: { key: string; body: Readable | Buffer; contentType?: string }): Promise<UploadResult> {
    const name = encodeKey(args.key);
    // googleapis attend `body` en Readable. Wrapper Buffer si besoin.
    const stream = Buffer.isBuffer(args.body) ? Readable.from(args.body) : args.body;
    const res = await this.drive.files.create({
      requestBody: {
        name,
        parents: [this.folderId],
      },
      media: {
        mimeType: args.contentType ?? 'application/octet-stream',
        body: stream,
      },
      // Resumable upload auto pour gros fichiers (> 5 MB).
      fields: 'id,size',
      supportsAllDrives: true,
    });
    const sizeBytes = res.data.size ? Number(res.data.size) : 0;
    return { key: args.key, sizeBytes };
  }

  async listKeys(prefix: string): Promise<ListedObject[]> {
    const all: ListedObject[] = [];
    let pageToken: string | undefined;
    const namePrefix = encodeKey(prefix);
    // Échappe les apostrophes pour la query Drive.
    const safe = namePrefix.replace(/'/g, "\\'");
    const q = `'${this.folderId}' in parents and name contains '${safe}' and trashed = false`;
    do {
      const out: { data: drive_v3.Schema$FileList } = await this.drive.files.list({
        q,
        fields: 'nextPageToken, files(id, name, size, modifiedTime)',
        pageToken,
        pageSize: 1000,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      for (const f of out.data.files ?? []) {
        if (!f.name) continue;
        // Filtre strict : Drive `contains` matche aussi en milieu de nom,
        // on garde uniquement ceux qui commencent vraiment par le prefix.
        if (!f.name.startsWith(namePrefix)) continue;
        all.push({
          key: decodeKey(f.name),
          sizeBytes: f.size ? Number(f.size) : undefined,
          modifiedAt: f.modifiedTime ? new Date(f.modifiedTime) : undefined,
        });
      }
      pageToken = out.data.nextPageToken ?? undefined;
    } while (pageToken);
    return all;
  }

  /**
   * Drive supprime par fileId, pas par nom. On résout name → id puis
   * delete. Si plusieurs fichiers du même nom (collision), on supprime
   * tous (cas rare car Drive n'impose pas l'unicité de nom).
   */
  async deleteKey(key: string): Promise<void> {
    const name = encodeKey(key);
    const safe = name.replace(/'/g, "\\'");
    const q = `'${this.folderId}' in parents and name = '${safe}' and trashed = false`;
    const out: { data: drive_v3.Schema$FileList } = await this.drive.files.list({
      q,
      fields: 'files(id)',
      supportsAllDrives: true,
    });
    for (const f of out.data.files ?? []) {
      if (!f.id) continue;
      await this.drive.files.delete({ fileId: f.id, supportsAllDrives: true });
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // Étape 1 : auth + list dans le folder cible.
    try {
      await this.drive.files.list({
        q: `'${this.folderId}' in parents and trashed = false`,
        fields: 'files(id)',
        pageSize: 1,
        supportsAllDrives: true,
      });
    } catch (e) {
      return { ok: false, failedAt: e instanceof Error && /authError|invalid_grant/i.test(e.message) ? 'auth' : 'list', error: errMsg(e) };
    }
    // Étape 2 : upload + delete fichier test.
    const testName = `_openquittance-conn-test-${Date.now()}.txt`;
    let testFileId: string | null = null;
    try {
      const res = await this.drive.files.create({
        requestBody: { name: testName, parents: [this.folderId] },
        media: { mimeType: 'text/plain', body: Readable.from(Buffer.from('test')) },
        fields: 'id',
        supportsAllDrives: true,
      });
      testFileId = res.data.id ?? null;
    } catch (e) {
      return { ok: false, failedAt: 'put', error: errMsg(e) };
    }
    if (testFileId) {
      try {
        await this.drive.files.delete({ fileId: testFileId, supportsAllDrives: true });
      } catch (e) {
        return { ok: true, error: `Test file uploaded but delete failed: ${errMsg(e)}` };
      }
    }
    return { ok: true };
  }
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return JSON.stringify(e);
}
