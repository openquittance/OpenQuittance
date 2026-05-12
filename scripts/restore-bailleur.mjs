#!/usr/bin/env node
/**
 * v3.1.0 — restauration partielle d'un ZIP bailleur (Feature C).
 *
 * Le ZIP est généré par `src/lib/zip-export.ts generateBailleurZip()`
 * (utilisé pour exports manuels + backups Phase 2). Il contient :
 *   - manifest.json (métadonnées bailleur)
 *   - <slug>/biens/<bien-slug>/documents/<categorie>/<filename>
 *   - <slug>/biens/<bien-slug>/locataires/<loc-slug>/quittances/<...>.pdf
 *   - <slug>/biens/.../locataires/.../documents/<categorie>/<filename>
 *   - audit-log.json (events liés)
 *
 * **PORTÉE LIMITÉE** : ce script extrait les fichiers physiques sur
 * disque mais ne réinjecte PAS les rows DB (Quittance, Bien, Locataire,
 * Archive). Pour restauration complète d'un bailleur, restaurez d'abord
 * le `db.sql.gz` global puis ce script ré-extrait les fichiers binaires.
 *
 * Usage :
 *   node scripts/restore-bailleur.mjs <bailleur.zip> [target-dir]
 *
 * target-dir default : ./uploads-restored/
 *
 * Si UPLOADS_DIR + UPLOADS_ENCRYPTION_KEY définis, les archives extraites
 * sont re-chiffrées au format v2.9.0 (ENC1 magic) pour être directement
 * utilisables par l'app. Sinon en clair.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomBytes, createCipheriv } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';

const ENC1_MAGIC = Buffer.from('ENC1', 'ascii');
const IV_LEN = 12;

function usage(code = 1) {
  console.error('Usage : node scripts/restore-bailleur.mjs <bailleur.zip> [target-dir]');
  process.exit(code);
}

function encryptUpload(plain, keyB64) {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('UPLOADS_ENCRYPTION_KEY invalide (32 bytes attendus).');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ENC1_MAGIC, iv, tag, ct]);
}

async function unzipTo(zipPath, targetDir) {
  // Utilise `unzip` si dispo, sinon Node `node-stream-zip` n'est pas
  // une dep. On exec `unzip -o -d <target> <zip>` (présent macOS/Linux).
  return new Promise((resolve, reject) => {
    const proc = spawn('unzip', ['-o', '-q', '-d', targetDir, zipPath], { stdio: ['ignore', 'inherit', 'inherit'] });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip exit=${code}`));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args[0] === '-h' || args[0] === '--help') usage(0);

  const zipPath = path.resolve(args[0]);
  if (!existsSync(zipPath)) {
    console.error(`ZIP introuvable : ${zipPath}`);
    process.exit(2);
  }
  const targetDir = path.resolve(args[1] ?? './uploads-restored');
  mkdirSync(targetDir, { recursive: true });

  console.log(`→ Extraction ${zipPath}`);
  console.log(`  Cible : ${targetDir}`);
  await unzipTo(zipPath, targetDir);

  // Cherche manifest.json
  const manifestPath = path.join(targetDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      console.log(`\n  Bailleur : ${manifest.bailleur?.nom ?? '?'}`);
      console.log(`  Counts : biens=${manifest.counts?.biens ?? 0} locataires=${manifest.counts?.locataires ?? 0} quittances=${manifest.counts?.quittances ?? 0}`);
    } catch {
      console.warn('  ⚠ manifest.json présent mais illisible.');
    }
  }

  console.log('\n→ Fichiers extraits avec succès.');
  console.log('\n⚠ ATTENTION : ce script ne réinjecte PAS la DB.');
  console.log('   Pour restauration complète d\'un bailleur :');
  console.log('   1. Restaurez d\'abord db.sql.gz du backup global');
  console.log('      (cf. docs/BACKUP.md "Restaurer un backup").');
  console.log('   2. Copiez les fichiers extraits dans UPLOADS_DIR.');
  console.log('   3. Relancez l\'app — les rows DB référencent les chemins.');

  // Re-chiffrement uploads si UPLOADS_ENCRYPTION_KEY dispo.
  const keyB64 = process.env.UPLOADS_ENCRYPTION_KEY;
  if (keyB64) {
    console.log('\n→ Re-chiffrement uploads avec UPLOADS_ENCRYPTION_KEY (v2.9.0+).');
    let count = 0;
    walkAndEncrypt(targetDir, keyB64, (n) => { count = n; });
    console.log(`  ${count} fichiers re-chiffrés.`);
  } else {
    console.log('\n  (UPLOADS_ENCRYPTION_KEY non défini → fichiers laissés en clair.');
    console.log('   Définir cette env var avant de copier dans UPLOADS_DIR.)');
  }
}

function walkAndEncrypt(dir, keyB64, onProgress) {
  const { readdirSync } = require('node:fs');
  let total = 0;
  function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (e.isFile() && /\.(pdf|jpe?g|png|webp|tiff?)$/i.test(e.name)) {
        try {
          const plain = readFileSync(p);
          // Skip si déjà chiffré
          if (plain.length >= 4 && plain.subarray(0, 4).equals(ENC1_MAGIC)) continue;
          const enc = encryptUpload(plain, keyB64);
          writeFileSync(p, enc);
          total++;
        } catch (e) {
          console.error(`  ✗ Échec re-chiffrement ${p} : ${e.message}`);
        }
      }
    }
  }
  walk(dir);
  onProgress(total);
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(99);
});
