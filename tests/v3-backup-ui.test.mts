/**
 * Tests v3.1.0-rc4 — Phase 2 Session 4 : UI Paramètres > Backup.
 *
 * T94 page + BackupForm + BackupHistory contiennent les éléments UI
 *     attendus (provider preset, schedule, passphrase warning, history
 *     table) — fichiers présents + markers texte.
 * T95 régression Sidebar : "Backup" ajouté + items existants intacts.
 *
 * Pure tests — file content assertions, pas de SSR (nécessiterait Next
 * dev server + DB → Session 6 E2E).
 */

import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  // ─── T94 page + form + history présents + markers ─────────────────────
  console.log('\n→ T94 fichiers UI Paramètres > Backup présents + markers');

  const pagePath = path.resolve('src/app/parametres/backup/page.tsx');
  const formPath = path.resolve('src/app/parametres/backup/BackupForm.tsx');
  const historyPath = path.resolve('src/app/parametres/backup/BackupHistory.tsx');

  for (const p of [pagePath, formPath, historyPath]) {
    const ok = await fileExists(p);
    assert(`T94 fichier présent : ${path.basename(p)}`, ok, ok ? 'OK' : `MANQUE`);
  }

  const pageSrc = await readFile(pagePath, 'utf-8');
  const formSrc = await readFile(formPath, 'utf-8');
  const historySrc = await readFile(historyPath, 'utf-8');

  // page.tsx markers
  const t94pageOk =
    pageSrc.includes("'use client'")
    && pageSrc.includes('useSession')
    && pageSrc.includes('AppShell')
    && pageSrc.includes('BackupForm')
    && pageSrc.includes('BackupHistory')
    && pageSrc.includes("session?.user?.role === 'ADMIN'")
    && pageSrc.includes('/api/parametres/backup')
    && pageSrc.includes('Backup automatique');
  assert(
    'T94a page.tsx : useSession + ADMIN gating + AppShell + BackupForm + BackupHistory',
    t94pageOk,
    'OK',
  );

  // BackupForm.tsx markers
  const formMarkers = [
    'Backblaze B2',
    'Cloudflare R2',
    'Wasabi',
    'AWS S3',
    'Personnalisé',
    'Endpoint URL',
    'Bucket',
    'Force path-style',
    'Access Key ID',
    'Secret Access Key',
    'Quotidien 3h',
    'Hebdo dimanche 3h',
    'Cron expression',
    'Rétention',
    'IRRÉCUPÉRABLE',
    'gestionnaire de mots de passe',
    'Notifier aussi les backups réussis',
    'Tester la connexion',
    'Backup maintenant',
    'Enregistrer',
    'instanceId',
    'PROVIDER_PRESETS',
    'SCHEDULE_PRESETS',
  ];
  const missing = formMarkers.filter(m => !formSrc.includes(m));
  assert(
    'T94b BackupForm.tsx contient tous les markers UI (provider preset, schedule, passphrase, actions)',
    missing.length === 0,
    missing.length === 0 ? `${formMarkers.length} markers OK` : `manquants: ${missing.join(', ')}`,
  );

  // Vérif passphrase warning + checkbox confirmation
  assert(
    'T94c BackupForm passphrase warning IRRÉCUPÉRABLE + checkbox confirmation',
    formSrc.includes('IRRÉCUPÉRABLE')
      && formSrc.includes('confirmIrrecuperable')
      && formSrc.includes('Je comprends'),
    'OK',
  );

  // Vérif handling secret masqué `***`
  assert(
    'T94d BackupForm gère masque *** (secret préservé si non touché)',
    formSrc.includes("'***'")
      && formSrc.includes('accessKeyDirty')
      && formSrc.includes('secretKeyDirty')
      && formSrc.includes('passphraseDirty'),
    'OK',
  );

  // Vérif call API endpoints
  assert(
    'T94e BackupForm appelle bons endpoints API',
    formSrc.includes('/api/parametres/backup')
      && formSrc.includes('/api/admin/backup/test-connection')
      && formSrc.includes('/api/admin/backup/run'),
    'OK',
  );

  // BackupHistory.tsx markers
  const historyMarkers = [
    '/api/admin/backup/runs',
    'Historique',
    'Statut',
    'Erreur',
    'Détails',
    'formatBytes',
    'formatDuration',
    'statusBadge',
    'setInterval',
    '30_000',
  ];
  const histMissing = historyMarkers.filter(m => !historySrc.includes(m));
  assert(
    'T94f BackupHistory.tsx : table + auto-refresh 30s + modale détails',
    histMissing.length === 0,
    histMissing.length === 0 ? 'OK' : `manquants: ${histMissing.join(', ')}`,
  );

  // ─── T95 régression Sidebar ───────────────────────────────────────────
  console.log('\n→ T95 régression Sidebar : Backup ajouté + items existants intacts');

  const sidebarSrc = await readFile(path.resolve('src/components/layout/Sidebar.tsx'), 'utf-8');

  assert(
    'T95a Sidebar : entrée /parametres/backup label "Backup" icon Cloud',
    sidebarSrc.includes("href: '/parametres/backup'")
      && sidebarSrc.includes("label: 'Backup'")
      && sidebarSrc.includes('Cloud'),
    'OK',
  );

  // Items pré-existants intacts
  const expectedExisting = [
    "label: 'Tableau de bord'",
    "label: 'Bailleurs'",
    "label: 'Biens'",
    "label: 'Locataires'",
    "label: 'Quittances'",
    "label: 'Documents'",
    "label: 'Exports'",
    "label: 'Indexation IRL'",
    "label: 'Paramètres'",
    "label: 'Sécurité'",
  ];
  const sidebarMissing = expectedExisting.filter(l => !sidebarSrc.includes(l));
  assert(
    'T95b Sidebar items existants tous présents (10)',
    sidebarMissing.length === 0,
    sidebarMissing.length === 0 ? '10/10 intacts' : `manquants: ${sidebarMissing.join(', ')}`,
  );

  // ─── T95c BackupConfig type cohérent avec route handler ───────────────
  console.log('\n→ T95c cohérence types BackupConfig UI ↔ route handler');
  const routeSrc = await readFile(path.resolve('src/app/api/parametres/backup/route.ts'), 'utf-8');
  const fields = [
    'backupEnabled',
    'backupS3Endpoint',
    'backupS3Region',
    'backupS3Bucket',
    'backupS3ForcePathStyle',
    'backupS3AccessKeyId',
    'backupS3SecretKey',
    'backupSchedule',
    'backupRetentionDays',
    'backupEnvPassphrase',
    'backupNotifySuccess',
  ];
  const inForm = fields.filter(f => formSrc.includes(f));
  const inRoute = fields.filter(f => routeSrc.includes(f));
  assert(
    'T95c les 11 champs config présents dans BackupForm + route handler',
    inForm.length === 11 && inRoute.length === 11,
    `form=${inForm.length} route=${inRoute.length}`,
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.1.0-rc4 backup-ui ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.1.0-rc4 backup-ui passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
