import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { prisma } from '../prisma';
import { runBackup } from './runner';
import { sendBackupNotification } from './notifier';

/**
 * v3.1.0 — scheduler backup automatique via node-cron.
 *
 * Cycle de vie :
 *   - boot Next.js → instrumentation.ts appelle initScheduler()
 *   - admin update config → POST /api/parametres/backup appelle reloadScheduler()
 *   - shutdown : stopScheduler() appelé par signal SIGTERM (optionnel)
 *
 * Singleton process-local. Pas de cluster Node.js — une instance Next.js =
 * un cron actif. Pour cluster (Phase 4 multi-replica), utiliser un lock
 * Redis ou Postgres advisory lock.
 */

let activeTask: ScheduledTask | null = null;
let activeSchedule: string | null = null;

/**
 * Charge la config backup depuis la DB.
 */
async function loadBackupConfig(): Promise<{ enabled: boolean; schedule: string | null }> {
  const cfg = await prisma.appConfig.findUnique({
    where: { id: 'singleton' },
    select: { backupEnabled: true, backupSchedule: true },
  });
  if (!cfg) return { enabled: false, schedule: null };
  return { enabled: cfg.backupEnabled, schedule: cfg.backupSchedule };
}

/**
 * Job déclenché par cron. Appelle runBackup puis sendBackupNotification.
 * Catch global pour ne pas crash le scheduler.
 */
async function runScheduledBackup(): Promise<void> {
  console.log('[backup/scheduler] Backup planifié déclenché');
  try {
    const result = await runBackup();
    const cfg = await prisma.appConfig.findUnique({
      where: { id: 'singleton' },
      select: { backupNotifySuccess: true, backupS3Bucket: true, backupS3Endpoint: true },
    });
    if (cfg) {
      const run = await prisma.backupRun.findUnique({ where: { id: result.runId } });
      if (run) {
        const notif = await sendBackupNotification({ run, config: cfg });
        if (!notif.sent) {
          console.log(`[backup/scheduler] Notif skipped : ${notif.reason}`);
        }
      }
    }
  } catch (e) {
    console.error('[backup/scheduler] Erreur job cron :', e);
  }
}

/**
 * Démarre le scheduler avec la config en DB. Idempotent — appelé au boot
 * et après chaque update config. Si déjà actif avec le même schedule,
 * no-op. Si schedule changé, stop ancien + start nouveau.
 */
export async function reloadScheduler(): Promise<{ status: 'started' | 'stopped' | 'unchanged' | 'invalid'; schedule: string | null }> {
  const { enabled, schedule } = await loadBackupConfig();

  // Cas 1 : désactivé → arrêter l'éventuel cron actif.
  if (!enabled || !schedule) {
    if (activeTask) {
      activeTask.stop();
      activeTask = null;
      activeSchedule = null;
      console.log('[backup/scheduler] Scheduler arrêté (backup désactivé)');
      return { status: 'stopped', schedule: null };
    }
    return { status: 'stopped', schedule: null };
  }

  // Cas 2 : même schedule déjà actif → no-op.
  if (activeTask && activeSchedule === schedule) {
    return { status: 'unchanged', schedule };
  }

  // Cas 3 : schedule invalide → log + stop éventuel.
  if (!cron.validate(schedule)) {
    console.error(`[backup/scheduler] Cron expression invalide : "${schedule}"`);
    if (activeTask) {
      activeTask.stop();
      activeTask = null;
      activeSchedule = null;
    }
    return { status: 'invalid', schedule };
  }

  // Cas 4 : nouveau schedule → stop ancien + start nouveau.
  if (activeTask) {
    activeTask.stop();
    activeTask = null;
  }
  activeTask = cron.schedule(schedule, runScheduledBackup);
  activeSchedule = schedule;
  console.log(`[backup/scheduler] Scheduler démarré avec schedule "${schedule}"`);
  return { status: 'started', schedule };
}

/**
 * Stoppe le scheduler. Appelé par SIGTERM ou shutdown gracieux.
 */
export function stopScheduler(): void {
  if (activeTask) {
    activeTask.stop();
    activeTask = null;
    activeSchedule = null;
    console.log('[backup/scheduler] Scheduler arrêté');
  }
}

/**
 * Initialisation au boot Next.js. Appelé par instrumentation.ts.
 */
export async function initScheduler(): Promise<void> {
  try {
    const result = await reloadScheduler();
    console.log(`[backup/scheduler] init : ${result.status} schedule=${result.schedule ?? '—'}`);
  } catch (e) {
    console.error('[backup/scheduler] Échec init :', e);
  }
}

// Exports internes pour tests
export const _internals = {
  getActiveSchedule: () => activeSchedule,
  hasActiveTask: () => activeTask !== null,
  // Permet tests d'injecter une config sans toucher la DB.
  reloadWithConfig: async (enabled: boolean, schedule: string | null) => {
    if (!enabled || !schedule) {
      if (activeTask) { activeTask.stop(); activeTask = null; activeSchedule = null; }
      return { status: 'stopped' as const, schedule: null };
    }
    if (activeTask && activeSchedule === schedule) {
      return { status: 'unchanged' as const, schedule };
    }
    if (!cron.validate(schedule)) {
      if (activeTask) { activeTask.stop(); activeTask = null; activeSchedule = null; }
      return { status: 'invalid' as const, schedule };
    }
    if (activeTask) { activeTask.stop(); activeTask = null; }
    activeTask = cron.schedule(schedule, () => {});
    activeSchedule = schedule;
    return { status: 'started' as const, schedule };
  },
  reset: () => {
    if (activeTask) activeTask.stop();
    activeTask = null;
    activeSchedule = null;
  },
};
