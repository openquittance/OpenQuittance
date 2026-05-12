/**
 * Tests v3.1.0-rc3 — Phase 2 Session 3 : scheduler cron + notifier email.
 *
 * T91 startScheduler avec schedule valide → cron actif, expression mémorisée
 * T92 reloadScheduler stop ancien + start nouveau quand schedule change
 * T93 sendBackupNotification politique : failed → notify, success+toggle off → skip
 *
 * Pure tests — pas de DB, pas de cron tick réel (on vérifie l'état activeTask
 * via _internals).
 */

import { randomBytes } from 'node:crypto';

if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const { _internals: schedInternals } = await import('../src/lib/backup/scheduler.ts');
const { _internals: notifInternals } = await import('../src/lib/backup/notifier.ts');

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // ─── T91 startScheduler avec schedule valide ──────────────────────────
  console.log('\n→ T91 reloadWithConfig démarre cron avec schedule valide');
  schedInternals.reset();

  {
    const r = await schedInternals.reloadWithConfig(true, '0 3 * * *');
    assert(
      'T91a enabled=true schedule="0 3 * * *" → status=started',
      r.status === 'started' && r.schedule === '0 3 * * *',
      JSON.stringify(r),
    );
    assert(
      'T91b activeTask présent + activeSchedule mémorisé',
      schedInternals.hasActiveTask() && schedInternals.getActiveSchedule() === '0 3 * * *',
      `hasTask=${schedInternals.hasActiveTask()} schedule=${schedInternals.getActiveSchedule()}`,
    );
  }

  // Cas désactivé → stop
  {
    const r = await schedInternals.reloadWithConfig(false, '0 3 * * *');
    assert(
      'T91c enabled=false → status=stopped + activeTask null',
      r.status === 'stopped' && !schedInternals.hasActiveTask(),
      `status=${r.status} hasTask=${schedInternals.hasActiveTask()}`,
    );
  }

  // Cas schedule null → stop
  {
    await schedInternals.reloadWithConfig(true, '0 3 * * *');
    const r = await schedInternals.reloadWithConfig(true, null);
    assert(
      'T91d schedule=null → status=stopped',
      r.status === 'stopped' && !schedInternals.hasActiveTask(),
      JSON.stringify(r),
    );
  }

  // Cas cron invalide → status=invalid + ancien stoppé
  {
    schedInternals.reset();
    await schedInternals.reloadWithConfig(true, '0 3 * * *');
    const r = await schedInternals.reloadWithConfig(true, 'pas une expression cron');
    assert(
      'T91e cron invalide → status=invalid + activeTask null (ancien stoppé)',
      r.status === 'invalid' && !schedInternals.hasActiveTask(),
      `status=${r.status} hasTask=${schedInternals.hasActiveTask()}`,
    );
  }

  // ─── T92 reload : unchanged si même schedule, switch si différent ─────
  console.log('\n→ T92 reload unchanged vs switch');
  schedInternals.reset();

  {
    await schedInternals.reloadWithConfig(true, '0 3 * * *');
    const r = await schedInternals.reloadWithConfig(true, '0 3 * * *');
    assert(
      'T92a même schedule → status=unchanged',
      r.status === 'unchanged' && schedInternals.getActiveSchedule() === '0 3 * * *',
      JSON.stringify(r),
    );
  }

  {
    const r = await schedInternals.reloadWithConfig(true, '*/15 * * * *');
    assert(
      'T92b schedule change → status=started + activeSchedule update',
      r.status === 'started'
        && schedInternals.getActiveSchedule() === '*/15 * * * *'
        && schedInternals.hasActiveTask(),
      `status=${r.status} schedule=${schedInternals.getActiveSchedule()}`,
    );
  }

  schedInternals.reset();

  // ─── T93 sendBackupNotification politique ─────────────────────────────
  console.log('\n→ T93 notifier politique : failed always, success toggle');

  const baseRun = {
    id: 'run-1',
    startedAt: new Date('2026-05-08T03:00:00Z'),
    finishedAt: new Date('2026-05-08T03:02:30Z'),
    status: 'success',
    sizeBytes: BigInt(15_728_640),
    errorMessage: null,
    manifestS3Key: 'openquittance/inst-1/2026-05-08T03-00-00-000Z/manifest.json',
    bailleursCount: 2,
    zipsCount: 2,
  };

  // shouldNotify : failed → true
  assert(
    'T93a status=failed → shouldNotify=true (toujours)',
    notifInternals.shouldNotify({
      run: { ...baseRun, status: 'failed', errorMessage: 'pg_dump exit=1' } as any,
      config: { backupNotifySuccess: false, backupS3Bucket: 'b', backupS3Endpoint: 'e' },
    }) === true,
    'OK',
  );
  assert(
    'T93b status=success + notifySuccess=false → shouldNotify=false',
    notifInternals.shouldNotify({
      run: baseRun as any,
      config: { backupNotifySuccess: false, backupS3Bucket: 'b', backupS3Endpoint: 'e' },
    }) === false,
    'OK',
  );
  assert(
    'T93c status=success + notifySuccess=true → shouldNotify=true',
    notifInternals.shouldNotify({
      run: baseRun as any,
      config: { backupNotifySuccess: true, backupS3Bucket: 'b', backupS3Endpoint: 'e' },
    }) === true,
    'OK',
  );

  // formatBytes
  assert(
    'T93d formatBytes : null → —, 500 → 500 B, 2KB, 1.5MB, 2GB',
    notifInternals.formatBytes(null) === '—'
      && notifInternals.formatBytes(BigInt(500)) === '500 B'
      && notifInternals.formatBytes(BigInt(2048)) === '2.0 KB'
      && notifInternals.formatBytes(BigInt(1_572_864)) === '1.5 MB'
      && notifInternals.formatBytes(BigInt(2_147_483_648)) === '2.00 GB',
    `null=${notifInternals.formatBytes(null)} 500=${notifInternals.formatBytes(BigInt(500))} 2K=${notifInternals.formatBytes(BigInt(2048))} 1.5M=${notifInternals.formatBytes(BigInt(1_572_864))} 2G=${notifInternals.formatBytes(BigInt(2_147_483_648))}`,
  );

  // formatDuration
  assert(
    'T93e formatDuration : null → —, 500ms, 2.5s, 1.5min',
    notifInternals.formatDuration(new Date(), null) === '—'
      && notifInternals.formatDuration(new Date(0), new Date(500)) === '500 ms'
      && notifInternals.formatDuration(new Date(0), new Date(2500)) === '2.5 s'
      && notifInternals.formatDuration(new Date(0), new Date(90000)) === '1.5 min',
    'OK',
  );

  // buildSubject
  const subjFailed = notifInternals.buildSubject({ ...baseRun, status: 'failed' } as any);
  const subjSuccess = notifInternals.buildSubject(baseRun as any);
  assert(
    'T93f buildSubject contient ÉCHEC ou Succès',
    subjFailed.includes('ÉCHEC') && subjSuccess.includes('Succès'),
    `failed="${subjFailed}" success="${subjSuccess}"`,
  );

  // buildBody : structure text + html
  const body = notifInternals.buildBody({
    run: { ...baseRun, status: 'failed', errorMessage: 'pg_dump exit=1\nstderr: connection refused' } as any,
    config: { backupNotifySuccess: false, backupS3Bucket: 'oq-bucket', backupS3Endpoint: 'https://s3.test' },
  });
  assert(
    'T93g buildBody text contient status + erreur + lien settings',
    body.text.includes('ÉCHEC')
      && body.text.includes('pg_dump exit=1')
      && body.text.includes('parametres/backup')
      && body.text.includes('oq-bucket'),
    'OK',
  );
  assert(
    'T93h buildBody html contient erreur escape-HTML safe',
    body.html.includes('<h2')
      && body.html.includes('pg_dump exit=1')
      && !body.html.includes('<script>'),
    'OK',
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.1.0-rc3 backup-scheduler ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.1.0-rc3 backup-scheduler passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
