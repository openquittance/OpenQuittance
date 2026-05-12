#!/usr/bin/env node
/**
 * v3.1.0 — restauration d'un fichier `.env` chiffré par OpenQuittance.
 *
 * Format `env.enc` (produit par src/lib/backup/runner.ts encryptEnv) :
 *   "OQENC1" (6) | salt (16) | iv (12) | tag (16) | ciphertext
 *   Clé dérivée scrypt(passphrase, salt, N=16384, r=8, p=1) → 32 bytes
 *   AES-256-GCM
 *
 * Usage :
 *   node scripts/restore-env.mjs <env.enc> [output.env]
 *
 * Si output.env omis, écrit dans `<env.enc>.decrypted`. La passphrase
 * est demandée à l'invite (input masqué stdin).
 *
 * SÉCURITÉ : ne JAMAIS passer la passphrase en argument CLI ou env var
 * (visible dans `ps`, history shell). Toujours via prompt interactif.
 */

import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { scryptSync, createDecipheriv } from 'node:crypto';
import { createInterface } from 'node:readline';
import path from 'node:path';
import process from 'node:process';

const MAGIC = Buffer.from('OQENC1', 'ascii');
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

function usage(code = 1) {
  console.error('Usage : node scripts/restore-env.mjs <env.enc> [output.env]');
  process.exit(code);
}

function decryptEnv(buf, passphrase) {
  if (buf.length < 6 + SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error('Fichier trop court — pas un env.enc valide.');
  }
  if (!buf.subarray(0, 6).equals(MAGIC)) {
    throw new Error('Magic OQENC1 absent — pas un env.enc OpenQuittance.');
  }
  const salt = buf.subarray(6, 6 + SALT_LEN);
  const iv = buf.subarray(6 + SALT_LEN, 6 + SALT_LEN + IV_LEN);
  const tag = buf.subarray(6 + SALT_LEN + IV_LEN, 6 + SALT_LEN + IV_LEN + TAG_LEN);
  const ct = buf.subarray(6 + SALT_LEN + IV_LEN + TAG_LEN);

  const key = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

async function promptPassphrase() {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Masque les caractères tapés.
    const stdout = process.stdout;
    rl.question('Passphrase : ', (answer) => {
      rl.close();
      resolve(answer);
    });
    // Hack pour masquer : remplace _writeToOutput par no-op après l'affichage du prompt.
    rl._writeToOutput = function (s) {
      if (s === 'Passphrase : ' || s === '\n' || s === '\r\n' || s === '\r') {
        stdout.write(s);
      }
      // Sinon on n'écrit rien (input masqué).
    };
    rl.on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args[0] === '-h' || args[0] === '--help') usage(0);

  const inputPath = path.resolve(args[0]);
  if (!existsSync(inputPath)) {
    console.error(`Fichier introuvable : ${inputPath}`);
    process.exit(2);
  }
  const outputPath = args[1] ? path.resolve(args[1]) : `${inputPath}.decrypted`;

  console.log(`Déchiffrement de ${inputPath}`);
  console.log(`→ Sortie : ${outputPath}`);
  console.log('');

  const enc = readFileSync(inputPath);

  let passphrase;
  try {
    passphrase = await promptPassphrase();
  } catch (e) {
    console.error('Erreur lecture passphrase :', e);
    process.exit(3);
  }

  if (!passphrase || passphrase.length < 12) {
    console.error('\n✗ Passphrase trop courte (minimum 12 caractères).');
    process.exit(4);
  }

  let plain;
  try {
    plain = decryptEnv(enc, passphrase);
  } catch (e) {
    console.error(`\n✗ Échec déchiffrement : ${e.message}`);
    console.error('  Causes possibles :');
    console.error('  - Mauvaise passphrase');
    console.error('  - Fichier corrompu');
    console.error('  - Pas un env.enc OpenQuittance');
    process.exit(5);
  }

  writeFileSync(outputPath, plain);
  try {
    chmodSync(outputPath, 0o600);
  } catch {
    // Windows / fs sans chmod : ignore.
  }

  console.log(`\n✓ Déchiffré avec succès : ${outputPath} (${plain.length} bytes, mode 0600)`);
  console.log('');
  console.log('Étapes suivantes :');
  console.log(`  cp ${outputPath} /chemin/vers/openquittance/.env`);
  console.log('  docker compose up -d  # ou redémarrer l\'app');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(99);
});
