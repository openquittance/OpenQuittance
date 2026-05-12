import { NextResponse } from 'next/server';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { runBackup } from '@/lib/backup/runner';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/backup/run
 *
 * ADMIN only. Lance runBackup en arrière-plan (fire-and-forget) et retourne
 * 202 Accepted immédiatement. Le job écrit BackupRun en DB pendant l'exec
 * (status='running' → 'success' / 'failed'). UI poll /api/admin/backup/runs
 * pour suivre.
 *
 * Si runBackup throw avant le premier `await prisma.backupRun.create`, on
 * retourne 500 avec l'erreur immédiate.
 */
export async function POST() {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;

  // Fire-and-forget : on attache un handler d'erreur pour ne pas crash le
  // process Node (unhandled rejection), mais on n'attend pas la promesse.
  void runBackup().catch((e) => {
    // Le runner écrit déjà BackupRun.status='failed' en interne. Ce catch
    // capture les erreurs inattendues hors gestion runner (très rare).
    console.error('[backup/run] Erreur non gérée :', e);
  });

  return NextResponse.json(
    { ok: true, message: 'Backup démarré en arrière-plan' },
    { status: 202 },
  );
}
