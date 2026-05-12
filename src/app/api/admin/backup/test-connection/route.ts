import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { loadStorageFromConfig } from '@/lib/backup/storage/load';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/backup/test-connection
 *
 * ADMIN only. Lit la config DB, instancie BackupStorage (S3 ou Drive),
 * exécute testConnection() — auth + list/head + put + delete sur fichier
 * test. Retourne ok / error / failedAt pour diagnostic UI.
 */
export async function POST() {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;

  const cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) {
    return NextResponse.json(
      { ok: false, error: 'AppConfig absent' },
      { status: 400 },
    );
  }

  let storage;
  try {
    storage = loadStorageFromConfig(cfg);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }

  const result = await storage.testConnection();
  return NextResponse.json(result);
}
