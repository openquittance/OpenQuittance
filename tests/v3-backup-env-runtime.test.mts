/**
 * Tests v3.1.0-rc9 — hotfix .env runtime + toggle activation.
 *
 * BUG 1 fixé : runner.ts construit le .env à backuper depuis process.env
 * (whitelist) au lieu de lire un fichier `/app/.env` qui n'existe pas
 * dans le container Docker (les vars sont passées via `environment:`,
 * pas bind-mountées).
 *
 * T105 buildEnvFromProcessEnv produit un .env-format avec les vars
 *      whitelistées présentes dans process.env
 * T106 buildEnvFromProcessEnv ignore les vars hors whitelist
 *      (PATH, NODE_ENV, etc.) — pas de leak système
 * T107 loadEnvBuffer fallback : pas de fichier → reconstruit depuis
 *      process.env (pas de throw)
 * T108 loadEnvBuffer priorité BACKUP_ENV_PATH si fichier existe
 *
 * Pure tests — pas de DB, pas de filesystem (sauf tmp pour T108).
 */

import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const { buildEnvFromProcessEnv, loadEnvBuffer, encryptEnv } = await import('../src/lib/backup/runner.ts');

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // Backup env state pour restaurer après tests.
  const savedEnv = { ...process.env };

  // ─── T105 buildEnvFromProcessEnv inclut whitelist ─────────────────────
  console.log('\n→ T105 buildEnvFromProcessEnv whitelist');
  // Stub vars critiques.
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
  process.env.NEXTAUTH_URL = 'https://example.test';
  process.env.NEXTAUTH_SECRET = 'secret-test-12345';
  process.env.ENCRYPTION_SECRET = 'enc-secret-test-32-chars-zzzzz';
  process.env.UPLOADS_ENCRYPTION_KEY = 'uploads-key-base64-zzzzz';
  process.env.GOOGLE_DRIVE_CLIENT_ID = 'drive-id';
  process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'drive-secret';
  // Vars optionnelles non définies → omises.
  delete process.env.INSEE_API_KEY;
  delete process.env.BACKUP_NOTIFY_EMAIL;

  const buf = buildEnvFromProcessEnv();
  const text = buf.toString('utf8');

  assert(
    'T105a contient DATABASE_URL=postgres://...',
    text.includes('DATABASE_URL=postgres://test:test@localhost:5432/test'),
    'OK',
  );
  assert(
    'T105b contient NEXTAUTH_URL + NEXTAUTH_SECRET',
    text.includes('NEXTAUTH_URL=https://example.test')
      && text.includes('NEXTAUTH_SECRET=secret-test-12345'),
    'OK',
  );
  assert(
    'T105c contient ENCRYPTION_SECRET + UPLOADS_ENCRYPTION_KEY (CRITIQUE)',
    text.includes('ENCRYPTION_SECRET=enc-secret-test-32-chars-zzzzz')
      && text.includes('UPLOADS_ENCRYPTION_KEY=uploads-key-base64-zzzzz'),
    'OK',
  );
  assert(
    'T105d contient GOOGLE_DRIVE_CLIENT_ID + SECRET',
    text.includes('GOOGLE_DRIVE_CLIENT_ID=drive-id')
      && text.includes('GOOGLE_DRIVE_CLIENT_SECRET=drive-secret'),
    'OK',
  );
  assert(
    'T105e omet vars whitelistées non définies (INSEE_API_KEY)',
    !text.includes('INSEE_API_KEY='),
    'OK',
  );
  assert(
    'T105f header commentaire présent (date + whitelist)',
    text.startsWith('# OpenQuittance backup env')
      && text.includes('Whitelist :'),
    'OK',
  );

  // ─── T106 vars système non incluses ───────────────────────────────────
  console.log('\n→ T106 vars système / Linux / Next non leakées');
  process.env.PATH = '/usr/bin:/bin';
  process.env.HOME = '/home/test';
  process.env.NODE_ENV = 'test';
  process.env.NEXT_RUNTIME = 'nodejs';
  process.env.HOSTNAME = 'test-host';
  process.env.PWD = '/tmp';
  process.env.SHELL = '/bin/bash';
  process.env.USER = 'test';
  process.env.MY_RANDOM_VAR = 'should-not-be-in-backup';

  const buf2 = buildEnvFromProcessEnv();
  const text2 = buf2.toString('utf8');

  const leaks = ['PATH=', 'HOME=', 'NODE_ENV=', 'NEXT_RUNTIME=', 'HOSTNAME=', 'PWD=', 'SHELL=', 'USER=', 'MY_RANDOM_VAR='];
  const found = leaks.filter(l => text2.includes(l));
  assert(
    'T106 aucune var système leakée (PATH/HOME/NODE_ENV/etc.)',
    found.length === 0,
    found.length === 0 ? 'OK' : `LEAK : ${found.join(', ')}`,
  );

  // ─── T107 loadEnvBuffer pas de fichier → reconstruction ───────────────
  console.log('\n→ T107 loadEnvBuffer fallback process.env si pas de fichier');
  delete process.env.BACKUP_ENV_PATH;
  // Path inexistant — doit pas throw, doit retourner buffer reconstruit.
  const inexistent = '/tmp/inexistant-' + Date.now() + '.env';
  const fallback = loadEnvBuffer(inexistent);
  assert(
    'T107a fichier absent → buffer non vide depuis process.env',
    fallback.length > 0 && fallback.toString('utf8').includes('DATABASE_URL='),
    `length=${fallback.length}`,
  );
  assert(
    'T107b reconstruit identique à buildEnvFromProcessEnv',
    fallback.toString('utf8') === buildEnvFromProcessEnv().toString('utf8'),
    'OK (à un timestamp près du header)',
  );

  // ─── T108 BACKUP_ENV_PATH override ────────────────────────────────────
  console.log('\n→ T108 BACKUP_ENV_PATH priorité si fichier existe');
  const tmp = mkdtempSync(path.join(tmpdir(), 'oq-test-'));
  const realEnv = path.join(tmp, '.env');
  writeFileSync(realEnv, 'CUSTOM_VAR_FROM_FILE=hello\nANOTHER_KEY=world\n');
  process.env.BACKUP_ENV_PATH = realEnv;

  const fileBuf = loadEnvBuffer('/tmp/some-other-path');
  const fileText = fileBuf.toString('utf8');
  assert(
    'T108a BACKUP_ENV_PATH set + fichier existe → contenu fichier utilisé verbatim',
    fileText.includes('CUSTOM_VAR_FROM_FILE=hello')
      && fileText.includes('ANOTHER_KEY=world')
      && !fileText.includes('# OpenQuittance backup env'),
    'OK',
  );

  // BACKUP_ENV_PATH set mais fichier inexistant → fallback.
  process.env.BACKUP_ENV_PATH = '/tmp/never-exists-' + Date.now();
  const stillFallback = loadEnvBuffer('/tmp/some-other-path');
  assert(
    'T108b BACKUP_ENV_PATH inexistant → fallback process.env',
    stillFallback.toString('utf8').includes('# OpenQuittance backup env')
      && stillFallback.toString('utf8').includes('DATABASE_URL='),
    'OK',
  );

  // Cleanup
  rmSync(tmp, { recursive: true, force: true });

  // ─── T109 round-trip via encryptEnv → decrypt ─────────────────────────
  console.log('\n→ T109 round-trip env reconstruit → encrypt → decrypt → identité');
  delete process.env.BACKUP_ENV_PATH;
  const reconstructed = buildEnvFromProcessEnv();
  const enc = encryptEnv(reconstructed, 'test-passphrase-12-chars');

  const { scryptSync, createDecipheriv } = await import('node:crypto');
  const salt = enc.subarray(6, 22);
  const iv = enc.subarray(22, 34);
  const tag = enc.subarray(34, 50);
  const ct = enc.subarray(50);
  const key = scryptSync('test-passphrase-12-chars', salt, 32, { N: 16384, r: 8, p: 1 });
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  assert(
    'T109 round-trip identité',
    dec.equals(reconstructed),
    `equals=${dec.equals(reconstructed)}`,
  );

  // Restaurer env
  for (const k of Object.keys(process.env)) {
    if (!(k in savedEnv)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(savedEnv)) {
    process.env[k] = v;
  }

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.1.0-rc9 backup-env-runtime ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.1.0-rc9 backup-env-runtime passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
