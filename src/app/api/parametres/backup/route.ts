import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { backupConfigSchema } from '@/lib/validation';
import { encryptOptional } from '@/lib/crypto';
import { reloadScheduler } from '@/lib/backup/scheduler';

export const dynamic = 'force-dynamic';

const SECRET_MASK = '***';

/**
 * v3.1.0 — endpoint admin pour configurer le backup S3-compatible.
 * Uniquement ADMIN (clés S3, passphrase env, schedule = sensibles).
 *
 * GET  → retourne config + secrets masqués (`***` si configuré, null sinon).
 *        Génère `instanceId` UUID v4 si null (premier appel).
 * POST → valide via backupConfigSchema, chiffre les secrets non masqués,
 *        upsert AppConfig singleton.
 */

function maskSecret(value: string | null): string | null {
  return value ? SECRET_MASK : null;
}

export async function GET() {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;

  // Singleton AppConfig — créé si absent.
  let cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) {
    cfg = await prisma.appConfig.create({
      data: { id: 'singleton', instanceId: randomUUID() },
    });
  } else if (!cfg.instanceId) {
    cfg = await prisma.appConfig.update({
      where: { id: 'singleton' },
      data: { instanceId: randomUUID() },
    });
  }

  return NextResponse.json({
    instanceId: cfg.instanceId,
    backupEnabled: cfg.backupEnabled,
    backupStorageType: cfg.backupStorageType ?? 's3',
    backupS3Endpoint: cfg.backupS3Endpoint,
    backupS3Region: cfg.backupS3Region,
    backupS3Bucket: cfg.backupS3Bucket,
    backupS3ForcePathStyle: cfg.backupS3ForcePathStyle,
    backupS3AccessKeyId: maskSecret(cfg.backupS3AccessKeyId),
    backupS3SecretKey: maskSecret(cfg.backupS3SecretKey),
    backupDriveFolderId: cfg.backupDriveFolderId,
    backupDriveAccountEmail: cfg.backupDriveAccountEmail,
    backupDriveConnected: !!cfg.backupDriveRefreshToken,
    googleDriveClientId: maskSecret(cfg.googleDriveClientId),
    googleDriveClientSecret: maskSecret(cfg.googleDriveClientSecret),
    backupSchedule: cfg.backupSchedule,
    backupRetentionDays: cfg.backupRetentionDays,
    backupEnvPassphrase: maskSecret(cfg.backupEnvPassphrase),
    backupNotifySuccess: cfg.backupNotifySuccess,
    backupLastRunAt: cfg.backupLastRunAt,
    backupLastStatus: cfg.backupLastStatus,
    backupLastError: cfg.backupLastError,
  });
}

export async function POST(req: NextRequest) {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;

  const body = await req.json();
  const parsed = backupConfigSchema.safeParse(body);
  if (!parsed.success) {
    // v3.1.0-rc11 — log explicite des erreurs Zod pour diagnostic futur.
    // Sans ça, le 400 silencieux côté UI est dur à investiguer.
    console.error(
      '[parametres/backup] Zod validation failed :',
      JSON.stringify(parsed.error.issues),
    );
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Récupère config existante pour préserver secrets si masqués `***`.
  const existing = await prisma.appConfig.findUnique({
    where: { id: 'singleton' },
  });

  // Si secret = `***` → conserver valeur DB. Sinon chiffrer la nouvelle.
  const accessKeyId = data.backupS3AccessKeyId === SECRET_MASK
    ? existing?.backupS3AccessKeyId ?? null
    : encryptOptional(data.backupS3AccessKeyId);
  const secretKey = data.backupS3SecretKey === SECRET_MASK
    ? existing?.backupS3SecretKey ?? null
    : encryptOptional(data.backupS3SecretKey);
  const envPassphrase = data.backupEnvPassphrase === SECRET_MASK
    ? existing?.backupEnvPassphrase ?? null
    : encryptOptional(data.backupEnvPassphrase);
  const driveClientId = data.googleDriveClientId === SECRET_MASK
    ? existing?.googleDriveClientId ?? null
    : encryptOptional(data.googleDriveClientId);
  const driveClientSecret = data.googleDriveClientSecret === SECRET_MASK
    ? existing?.googleDriveClientSecret ?? null
    : encryptOptional(data.googleDriveClientSecret);

  // Génère instanceId si absent (premier POST).
  const instanceId = existing?.instanceId ?? randomUUID();

  const updateData = {
    instanceId,
    backupEnabled: data.backupEnabled,
    backupStorageType: data.backupStorageType ?? 's3',
    backupS3Endpoint: data.backupS3Endpoint || null,
    backupS3Region: data.backupS3Region || null,
    backupS3Bucket: data.backupS3Bucket || null,
    backupS3ForcePathStyle: data.backupS3ForcePathStyle,
    backupS3AccessKeyId: accessKeyId,
    backupS3SecretKey: secretKey,
    backupDriveFolderId: data.backupDriveFolderId || null,
    googleDriveClientId: driveClientId,
    googleDriveClientSecret: driveClientSecret,
    backupSchedule: data.backupSchedule || null,
    backupRetentionDays: data.backupRetentionDays,
    backupEnvPassphrase: envPassphrase,
    backupNotifySuccess: data.backupNotifySuccess,
  };

  const saved = await prisma.appConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  });

  // v3.1.0-rc9 — log explicite pour diagnostic toggle activation.
  console.log(
    `[parametres/backup] saved backupEnabled=${saved.backupEnabled} `
    + `storageType=${saved.backupStorageType} schedule=${saved.backupSchedule ?? '—'}`,
  );

  // Reload scheduler immédiatement pour appliquer le nouveau schedule
  // (ou stopper si backupEnabled=false). Erreur loggée mais non-bloquante.
  reloadScheduler().catch(e => {
    console.error('[parametres/backup] Échec reloadScheduler après save :', e);
  });

  return NextResponse.json({
    instanceId: saved.instanceId,
    backupEnabled: saved.backupEnabled,
    backupStorageType: saved.backupStorageType ?? 's3',
    backupS3Endpoint: saved.backupS3Endpoint,
    backupS3Region: saved.backupS3Region,
    backupS3Bucket: saved.backupS3Bucket,
    backupS3ForcePathStyle: saved.backupS3ForcePathStyle,
    backupS3AccessKeyId: maskSecret(saved.backupS3AccessKeyId),
    backupS3SecretKey: maskSecret(saved.backupS3SecretKey),
    backupDriveFolderId: saved.backupDriveFolderId,
    backupDriveAccountEmail: saved.backupDriveAccountEmail,
    backupDriveConnected: !!saved.backupDriveRefreshToken,
    googleDriveClientId: maskSecret(saved.googleDriveClientId),
    googleDriveClientSecret: maskSecret(saved.googleDriveClientSecret),
    backupSchedule: saved.backupSchedule,
    backupRetentionDays: saved.backupRetentionDays,
    backupEnvPassphrase: maskSecret(saved.backupEnvPassphrase),
    backupNotifySuccess: saved.backupNotifySuccess,
    backupLastRunAt: saved.backupLastRunAt,
    backupLastStatus: saved.backupLastStatus,
    backupLastError: saved.backupLastError,
  });
}
