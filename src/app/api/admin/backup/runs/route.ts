import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/backup/runs
 *
 * ADMIN only. Retourne les 50 derniers BackupRun ORDER BY startedAt DESC.
 * Sérialise sizeBytes (BigInt) en string pour JSON.
 */
export async function GET() {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;

  const runs = await prisma.backupRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
  });

  return NextResponse.json({
    runs: runs.map(r => ({
      id: r.id,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      status: r.status,
      sizeBytes: r.sizeBytes != null ? r.sizeBytes.toString() : null,
      errorMessage: r.errorMessage,
      manifestS3Key: r.manifestS3Key,
      bailleursCount: r.bailleursCount,
      zipsCount: r.zipsCount,
    })),
  });
}
