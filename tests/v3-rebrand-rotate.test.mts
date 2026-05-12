/**
 * Tests v3.0.0-rc1 — rebrand OpenQuittance + rotation uploads key + setup wizard.
 *
 * T72 rotate-uploads-key dry-run + apply round-trip → contenu identique
 * T73 setup wizard validation : structure .env générée
 * T74 nom "OpenQuittance" présent dans footer email + branding UI
 */

import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes, createCipheriv } from 'node:crypto';

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

function encryptWithKey(plain: Buffer, keyB64: string): Buffer {
  const key = Buffer.from(keyB64, 'base64');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('ENC1', 'ascii'), iv, tag, ct]);
}

async function main() {
  // ─── T72 rotate dry-run + apply ───────────────────────────────────────
  console.log('\n→ T72 rotate-uploads-key DRY-RUN + APPLY → round-trip');
  const tmpRoot = await mkdtemp(path.join(tmpdir(), 'oq-rotate-'));
  const archivesDir = path.join(tmpRoot, 'archives');
  await mkdir(archivesDir, { recursive: true });

  const oldKey = randomBytes(32).toString('base64');
  const newKey = randomBytes(32).toString('base64');
  const plain = Buffer.from('OpenQuittance test payload — données critiques.\n');

  // Crée 3 fichiers chiffrés sous oldKey
  for (let i = 0; i < 3; i++) {
    const enc = encryptWithKey(plain, oldKey);
    await writeFile(path.join(archivesDir, `test-${i}.bin`), enc);
  }

  const env = {
    ...process.env,
    OLD_UPLOADS_KEY: oldKey,
    NEW_UPLOADS_KEY: newKey,
    UPLOADS_DIR: tmpRoot,
  };

  // DRY-RUN
  const dry = spawnSync('node', ['scripts/rotate-uploads-key.mjs'], { env, encoding: 'utf-8' });
  const dryOk = dry.status === 0
    && dry.stdout.includes('À rotater (chiffrés ENC1)  : 3')
    && dry.stdout.includes('DRY-RUN terminé');

  // Vérif fichiers PAS modifiés en DRY-RUN
  const f0 = await readFile(path.join(archivesDir, 'test-0.bin'));
  // Encrypted with oldKey — taille fixe = 32 (header) + plain.length
  const dryUntouched = f0.length === plain.length + 32;

  // APPLY
  const apply = spawnSync('node', ['scripts/rotate-uploads-key.mjs', '--apply'], { env, encoding: 'utf-8' });
  const applyOk = apply.status === 0
    && apply.stdout.includes('Rotation appliquée avec succès')
    && apply.stdout.includes('À rotater (chiffrés ENC1)  : 3');

  // Vérif round-trip : décrypter avec newKey doit retourner le plain
  const { createDecipheriv } = await import('node:crypto');
  const decryptWith = (buf: Buffer, keyB64: string): Buffer => {
    const key = Buffer.from(keyB64, 'base64');
    const iv = buf.subarray(4, 16);
    const tag = buf.subarray(16, 32);
    const ct = buf.subarray(32);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  };
  let roundTrip = true;
  for (let i = 0; i < 3; i++) {
    const newEnc = await readFile(path.join(archivesDir, `test-${i}.bin`));
    const decrypted = decryptWith(newEnc, newKey);
    if (!decrypted.equals(plain)) { roundTrip = false; break; }
  }

  // Idempotence : 2e apply → 0 fichiers à rotater (sous newKey, oldKey
  // ne décrypte plus, donc erreurs attendues — mais c'est cohérent).
  // En vrai usage, on ne ré-applique pas.

  await rm(tmpRoot, { recursive: true, force: true });
  assert(
    'T72 rotate dry-run + apply + round-trip décryptable avec newKey',
    dryOk && dryUntouched && applyOk && roundTrip,
    `dry=${dryOk} untouched=${dryUntouched} apply=${applyOk} roundTrip=${roundTrip}`,
  );

  // ─── T73 setup wizard validation ──────────────────────────────────────
  // Test indirect : vérifie la structure du template ENV qu'aurait
  // produit le wizard (sans lancer l'interactif).
  console.log('\n→ T73 setup wizard structure .env (non-interactive check)');
  const setupSource = await readFile(path.resolve('scripts/setup.mjs'), 'utf-8');
  const t73ok =
    setupSource.includes("name: 'openquittance'") === false // ne référence pas package.json
    && setupSource.includes('NEXTAUTH_SECRET=')
    && setupSource.includes('UPLOADS_ENCRYPTION_KEY=')
    && setupSource.includes('ENCRYPTION_SECRET=')
    && setupSource.includes('docker compose up -d --build')
    && setupSource.includes('IRRÉCUPÉRABLES'); // warning sauvegarde
  assert(
    'T73 setup wizard contient NEXTAUTH_SECRET + ENCRYPTION_SECRET + UPLOADS_ENCRYPTION_KEY + warning',
    t73ok,
  );

  // ─── T74 nom OpenQuittance dans footer email + branding ───────────────
  console.log('\n→ T74 rebrand OpenQuittance dans email/portail/sidebar');
  const emailSource = await readFile(path.resolve('src/lib/email/index.ts'), 'utf-8');
  const portailEmailSource = await readFile(path.resolve('src/lib/email/portail.ts'), 'utf-8');
  const sidebarSource = await readFile(path.resolve('src/components/layout/Sidebar.tsx'), 'utf-8');
  const layoutSource = await readFile(path.resolve('src/app/layout.tsx'), 'utf-8');
  const totpSource = await readFile(path.resolve('src/lib/totp.ts'), 'utf-8');

  const t74ok =
    emailSource.includes('Propulsé par <a href="https://github.com/grx14/quittances-app" style="color:#999;">OpenQuittance</a>')
    && portailEmailSource.includes('Propulsé par OpenQuittance')
    && sidebarSource.includes('>OpenQuittance<')
    && layoutSource.includes("title: 'OpenQuittance'")
    && totpSource.includes("APP_ISSUER = 'OpenQuittance'");
  assert(
    'T74 OpenQuittance branding : email footer + portail email + sidebar + layout title + TOTP issuer',
    t74ok,
  );

  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.0.0-rc1 ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.0.0-rc1 passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
