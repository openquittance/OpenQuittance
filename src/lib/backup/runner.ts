import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { PassThrough } from 'node:stream';
import { createHash, randomBytes, createCipheriv, scryptSync } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { prisma } from '../prisma';
import { generateBailleurZip, slugify } from '../zip-export';
import { decrypt } from '../crypto';
import { sendBackupNotification } from './notifier';
import { loadStorageFromConfig } from './storage/load';
import type { BackupStorage } from './storage/index';

/**
 * v3.1.0 — runner backup principal.
 *
 * Layout S3 produit :
 *   <bucket>/openquittance/<instanceId>/<ISO-timestamp>/
 *     ├── manifest.json     (versions, counts, hashes SHA-256, durée)
 *     ├── db.sql.gz         (pg_dump global)
 *     ├── env.enc           (.env chiffré AES-256-GCM, clé dérivée PBKDF2/scrypt
 *     │                      depuis backupEnvPassphrase)
 *     └── bailleurs/
 *           ├── <slug>.zip
 *           └── ...
 *
 * Sécurité env.enc :
 *   - scrypt(passphrase, salt=16B, N=16384, r=8, p=1) → 32B key
 *   - AES-256-GCM (12B IV + 16B tag)
 *   - Format : "OQENC1" + salt(16) + iv(12) + tag(16) + ciphertext
 *   - Pas de dépendance gpg externe — déchiffrable avec scripts/restore-env.mjs
 *     ou snippet Node.js.
 */

export interface BackupOptions {
  /** Si fourni, override l'AppConfig en DB (utile tests). */
  configOverride?: ResolvedBackupConfig;
  /** Chemin .env à backuper (default : process.env.BACKUP_ENV_PATH ou ".env"). */
  envPath?: string;
}

export interface ResolvedBackupConfig {
  instanceId: string;
  storage: BackupStorage;
  envPassphrase: string;
  /** Connection string Postgres pour pg_dump. Optional → utilise DATABASE_URL. */
  databaseUrl?: string;
}

export interface BackupResult {
  runId: string;
  status: 'success' | 'failed';
  startedAt: Date;
  finishedAt: Date;
  sizeBytes: number;
  manifestS3Key: string | null;
  bailleursCount: number;
  zipsCount: number;
  errorMessage: string | null;
}

interface ManifestEntry {
  key: string;
  sizeBytes: number;
  sha256: string;
}

interface Manifest {
  version: '1';
  app: 'openquittance';
  appVersion: string;
  instanceId: string;
  timestamp: string;
  durationMs: number;
  bailleursCount: number;
  files: ManifestEntry[];
}

const ENV_MAGIC = Buffer.from('OQENC1', 'ascii');
const ENV_SALT_LEN = 16;
const ENV_IV_LEN = 12;
const ENV_TAG_LEN = 16;

/**
 * v3.1.0-rc9 — whitelist des env vars critiques à inclure dans le backup
 * env.enc. Le `.env` n'est PAS bind-mounté dans le container (docker
 * compose passe les vars via `environment:`), donc on reconstruit son
 * contenu à partir de `process.env` au runtime.
 *
 * Stratégie : whitelist explicite pour éviter de leaker des vars
 * système Linux (PATH, HOME, HOSTNAME, etc.) ou de Next.js
 * (NEXT_RUNTIME, NODE_ENV, ...) dans le backup.
 *
 * Si l'utilisateur définit `BACKUP_ENV_PATH=/chemin/.env`, le contenu
 * du fichier est utilisé tel quel (priorité, fallback rétro-compat).
 */
const ENV_WHITELIST = [
  // Database
  'DATABASE_URL',
  // Auth
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  // Chiffrement applicatif (CRITIQUE — sans ces clés les backups sont inutiles)
  'ENCRYPTION_SECRET',
  'UPLOADS_ENCRYPTION_KEY',
  // OAuth Google login + Gmail API
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  // OAuth Google Drive backup
  'GOOGLE_DRIVE_CLIENT_ID',
  'GOOGLE_DRIVE_CLIENT_SECRET',
  // INSEE IRL (optionnel)
  'INSEE_API_KEY',
  // Backup config (optionnel, peut override config DB)
  'BACKUP_NOTIFY_EMAIL',
  'BACKUP_ENV_PATH',
  // Stockage uploads
  'UPLOADS_DIR',
  // Audit
  'AUDIT_LOG_RETENTION_DAYS',
  // Branding optionnel
  'NEXT_PUBLIC_APP_NAME',
  // Locale / TZ
  'TZ',
] as const;

/**
 * Construit un buffer format .env (KEY=value\n) à partir de process.env
 * filtré par la whitelist. Les vars non définies sont omises (pas
 * d'output `KEY=`).
 *
 * Format : pas de quoting — les valeurs avec espaces / quotes
 * pourraient nécessiter `KEY="value"`. Ici on copie verbatim, suffisant
 * pour les clés type secrets / URLs (pas d'espaces typique).
 */
export function buildEnvFromProcessEnv(): Buffer {
  const lines: string[] = [
    `# OpenQuittance backup env — généré ${new Date().toISOString()}`,
    `# Whitelist : ${ENV_WHITELIST.length} variables critiques.`,
    `# Variables système / Linux non incluses (PATH, HOME, NODE_ENV, etc.).`,
    '',
  ];
  for (const key of ENV_WHITELIST) {
    const v = process.env[key];
    if (v === undefined || v === null || v === '') continue;
    lines.push(`${key}=${v}`);
  }
  lines.push('');
  return Buffer.from(lines.join('\n'), 'utf8');
}

/**
 * Charge le contenu .env à backuper :
 *   1. Si `BACKUP_ENV_PATH` env var set ET fichier existe → lire le fichier
 *      (rétro-compat avec setups qui bind-mount le .env).
 *   2. Sinon → reconstruire à partir de process.env via whitelist.
 */
export function loadEnvBuffer(envPath: string): Buffer {
  const explicit = process.env.BACKUP_ENV_PATH;
  if (explicit && existsSync(explicit)) {
    return readFileSync(explicit);
  }
  if (envPath && existsSync(envPath) && envPath !== explicit) {
    return readFileSync(envPath);
  }
  // Fallback v3.1.0-rc9 : reconstruction depuis process.env.
  return buildEnvFromProcessEnv();
}

/**
 * Chiffre un buffer .env avec une passphrase. Format :
 * "OQENC1" + salt(16) + iv(12) + tag(16) + ciphertext
 * Clé dérivée scrypt(passphrase, salt, N=16384, r=8, p=1) → 32 bytes.
 */
export function encryptEnv(plain: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(ENV_SALT_LEN);
  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const iv = randomBytes(ENV_IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENV_MAGIC, salt, iv, tag, ct]);
}

async function loadConfig(): Promise<ResolvedBackupConfig> {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) throw new Error('AppConfig absent — backup impossible');
  if (!cfg.backupEnabled) throw new Error('Backup désactivé (backupEnabled=false)');
  if (!cfg.instanceId) throw new Error('instanceId absent');
  if (!cfg.backupEnvPassphrase) {
    throw new Error('Passphrase de chiffrement env absente');
  }

  const storage = loadStorageFromConfig(cfg);

  return {
    instanceId: cfg.instanceId,
    storage,
    envPassphrase: decrypt(cfg.backupEnvPassphrase),
  };
}

/**
 * Stream pg_dump | gzip vers un PassThrough utilisable comme Body S3.
 * Throw si pg_dump échoue (exit non-zero).
 */
function spawnPgDumpGzipStream(databaseUrl: string): { stream: PassThrough; donePromise: Promise<void> } {
  const out = new PassThrough();
  const errChunks: Buffer[] = [];

  const dump = spawn('pg_dump', [
    '--no-owner',
    '--no-acl',
    '--clean',
    '--if-exists',
    databaseUrl,
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  dump.stderr.on('data', (chunk) => errChunks.push(chunk));

  const gz = createGzip();
  dump.stdout.pipe(gz).pipe(out);

  const donePromise = new Promise<void>((resolve, reject) => {
    dump.on('error', reject);
    dump.on('close', (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString('utf8');
        reject(new Error(`pg_dump exit=${code} stderr=${stderr.slice(0, 500)}`));
        return;
      }
      resolve();
    });
  });

  return { stream: out, donePromise };
}

/**
 * Génère un buffer ZIP bailleur. archiver streaming → buffer collect.
 * Pour très gros bailleurs (> 100MB) on pourrait streamer directement vers
 * S3 multipart, mais buffer-first reste plus simple + permet hash SHA-256.
 */
async function buildBailleurZipBuffer(bailleurId: string): Promise<{ buf: Buffer; counts: Awaited<ReturnType<typeof generateBailleurZip>> }> {
  const archive = archiver('zip', { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk) => chunks.push(chunk));
  const archiveDone = new Promise<void>((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
  });
  const counts = await generateBailleurZip(bailleurId, archive);
  await archive.finalize();
  await archiveDone;
  return { buf: Buffer.concat(chunks), counts };
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export async function runBackup(options: BackupOptions = {}): Promise<BackupResult> {
  const startedAt = new Date();
  const timestamp = startedAt.toISOString().replace(/[:.]/g, '-');
  const config = options.configOverride ?? await loadConfig();
  const envPath = options.envPath ?? process.env.BACKUP_ENV_PATH ?? '.env';

  // Crée BackupRun status='running' pour tracking concurrent
  const run = await prisma.backupRun.create({
    data: { status: 'running', startedAt },
  });

  try {
    const storage = config.storage;
    const prefix = `openquittance/${config.instanceId}/${timestamp}`;
    const files: ManifestEntry[] = [];
    let totalBytes = 0;

    // ─── Étape 1 : pg_dump.gz ─────────────────────────────────────────
    const databaseUrl = config.databaseUrl ?? process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL absent — pg_dump impossible');
    const dbKey = `${prefix}/db.sql.gz`;
    const { stream: dbStream, donePromise: dbDone } = spawnPgDumpGzipStream(databaseUrl);

    // Tee : upload + collect pour SHA-256
    const dbChunks: Buffer[] = [];
    dbStream.on('data', (c: Buffer) => dbChunks.push(c));
    const dbUpload = storage.uploadFile({ key: dbKey, body: dbStream, contentType: 'application/gzip' });
    await Promise.all([dbDone, dbUpload]);
    const dbBuf = Buffer.concat(dbChunks);
    files.push({ key: dbKey, sizeBytes: dbBuf.length, sha256: sha256(dbBuf) });
    totalBytes += dbBuf.length;

    // ─── Étape 2 : ZIPs bailleurs ─────────────────────────────────────
    const bailleurs = await prisma.bailleur.findMany({
      where: { actif: true },
      select: { id: true, nom: true },
      orderBy: { nom: 'asc' },
    });
    let zipsCount = 0;
    for (const b of bailleurs) {
      const { buf } = await buildBailleurZipBuffer(b.id);
      const zipKey = `${prefix}/bailleurs/${slugify(b.nom)}.zip`;
      await storage.uploadFile({ key: zipKey, body: buf, contentType: 'application/zip' });
      files.push({ key: zipKey, sizeBytes: buf.length, sha256: sha256(buf) });
      totalBytes += buf.length;
      zipsCount++;
    }

    // ─── Étape 3 : env.enc (chiffré AES-GCM passphrase) ───────────────
    // v3.1.0-rc9 : reconstruction depuis process.env si pas de fichier
    // .env disponible (cas Docker compose `environment:` sans bind-mount
    // du .env). loadEnvBuffer prend BACKUP_ENV_PATH en priorité, sinon
    // envPath fourni, sinon construit depuis process.env via whitelist.
    const absEnvPath = path.isAbsolute(envPath) ? envPath : path.resolve(envPath);
    const envBuf = loadEnvBuffer(absEnvPath);
    const envEnc = encryptEnv(envBuf, config.envPassphrase);
    const envKey = `${prefix}/env.enc`;
    await storage.uploadFile({ key: envKey, body: envEnc, contentType: 'application/octet-stream' });
    files.push({ key: envKey, sizeBytes: envEnc.length, sha256: sha256(envEnc) });
    totalBytes += envEnc.length;

    // ─── Étape 4 : manifest.json ──────────────────────────────────────
    const finishedAt = new Date();
    const manifest: Manifest = {
      version: '1',
      app: 'openquittance',
      appVersion: process.env.npm_package_version ?? 'unknown',
      instanceId: config.instanceId,
      timestamp,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      bailleursCount: bailleurs.length,
      files,
    };
    const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    const manifestKey = `${prefix}/manifest.json`;
    await storage.uploadFile({ key: manifestKey, body: manifestBuf, contentType: 'application/json' });
    totalBytes += manifestBuf.length;

    // ─── Update BackupRun + AppConfig.lastRun ─────────────────────────
    await prisma.backupRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        finishedAt,
        sizeBytes: BigInt(totalBytes),
        manifestS3Key: manifestKey,
        bailleursCount: bailleurs.length,
        zipsCount,
      },
    });
    await prisma.appConfig.update({
      where: { id: 'singleton' },
      data: {
        backupLastRunAt: finishedAt,
        backupLastStatus: 'success',
        backupLastError: null,
      },
    });

    // Notif email (catch silencieux : notif ratée ne fait pas échouer le
    // backup).
    await notifyAfterRun(run.id);

    return {
      runId: run.id,
      status: 'success',
      startedAt,
      finishedAt,
      sizeBytes: totalBytes,
      manifestS3Key: manifestKey,
      bailleursCount: bailleurs.length,
      zipsCount,
      errorMessage: null,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const finishedAt = new Date();
    await prisma.backupRun.update({
      where: { id: run.id },
      data: { status: 'failed', finishedAt, errorMessage },
    });
    await prisma.appConfig.update({
      where: { id: 'singleton' },
      data: {
        backupLastRunAt: finishedAt,
        backupLastStatus: 'failed',
        backupLastError: errorMessage,
      },
    });
    await notifyAfterRun(run.id);
    return {
      runId: run.id,
      status: 'failed',
      startedAt,
      finishedAt,
      sizeBytes: 0,
      manifestS3Key: null,
      bailleursCount: 0,
      zipsCount: 0,
      errorMessage,
    };
  }
}

async function notifyAfterRun(runId: string): Promise<void> {
  try {
    const run = await prisma.backupRun.findUnique({ where: { id: runId } });
    const cfg = await prisma.appConfig.findUnique({
      where: { id: 'singleton' },
      select: { backupNotifySuccess: true, backupS3Bucket: true, backupS3Endpoint: true },
    });
    if (run && cfg) {
      await sendBackupNotification({ run, config: cfg });
    }
  } catch (e) {
    console.error('[backup/runner] Échec notif email :', e);
  }
}
