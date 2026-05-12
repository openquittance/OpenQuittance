#!/usr/bin/env node
/**
 * Rotation UPLOADS_ENCRYPTION_KEY (v3.0.0).
 *
 * Déchiffre les uploads avec OLD_KEY, re-chiffre avec NEW_KEY.
 * Walk récursif UPLOADS_DIR/archives + bailleurs. Idempotent.
 * Atomic via tmp file + rename.
 *
 * Usage :
 *   OLD_UPLOADS_KEY=<base64> NEW_UPLOADS_KEY=<base64> \
 *   UPLOADS_DIR=./uploads node scripts/rotate-uploads-key.mjs [--apply]
 *
 *   - Sans --apply : DRY-RUN (compte fichiers à rotater, n'écrit rien).
 *   - Avec --apply : applique la rotation.
 *
 * Pré-requis :
 *   1. Backup complet du dossier UPLOADS_DIR (snapshot Synology, tar, etc.).
 *   2. NEW_UPLOADS_KEY déjà générée (`openssl rand -base64 32`) et stockée
 *      en lieu sûr (1Password, coffre).
 *   3. App ARRÊTÉE pendant la rotation (sinon race condition entre uploads
 *      en cours et rotation).
 *
 * Après rotation :
 *   - Mettre à jour `UPLOADS_ENCRYPTION_KEY` dans .env avec NEW_UPLOADS_KEY.
 *   - Redémarrer l'app.
 *   - L'ancienne OLD_UPLOADS_KEY peut être détruite (mais garder un backup
 *     temporaire 30j en cas de rollback nécessaire).
 *
 * Cf. docs/CHIFFREMENT-UPLOADS.md "Rotation de clé".
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const MAGIC = Buffer.from('ENC1', 'ascii');
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = 4 + IV_LEN + TAG_LEN;

function isEnc(buf) {
  return buf.length >= HEADER_LEN && buf.subarray(0, 4).equals(MAGIC);
}

function decryptWith(buf, key) {
  if (!isEnc(buf)) {
    throw new Error('Buffer non chiffré (magic ENC1 absent)');
  }
  const iv = buf.subarray(4, 4 + IV_LEN);
  const tag = buf.subarray(4 + IV_LEN, HEADER_LEN);
  const ct = buf.subarray(HEADER_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

function encryptWith(plain, key) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ct]);
}

function loadKey(envName) {
  const raw = process.env[envName];
  if (!raw) {
    console.error(`✗ Variable env ${envName} manquante.`);
    console.error(`  Générer une clé : openssl rand -base64 32`);
    process.exit(1);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    console.error(`✗ ${envName} invalide (32 bytes attendus, reçu ${key.length}).`);
    process.exit(1);
  }
  return key;
}

async function walk(dir, onFile) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // dir absent
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walk(p, onFile);
    } else if (e.isFile()) {
      await onFile(p);
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const oldKey = loadKey('OLD_UPLOADS_KEY');
  const newKey = loadKey('NEW_UPLOADS_KEY');

  if (oldKey.equals(newKey)) {
    console.error('✗ OLD_UPLOADS_KEY et NEW_UPLOADS_KEY sont identiques. Rotation inutile.');
    process.exit(1);
  }

  const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
  const subdirs = ['archives', 'bailleurs'];

  console.log(`→ Rotation UPLOADS_ENCRYPTION_KEY ${apply ? '(APPLY)' : '(DRY-RUN)'}`);
  console.log(`  UPLOADS_DIR : ${uploadsDir}`);

  let total = 0;
  let toRotate = 0;
  let plainSkipped = 0;
  let errors = 0;
  const errorList = [];

  for (const sub of subdirs) {
    await walk(path.join(uploadsDir, sub), async (p) => {
      total++;
      try {
        const buf = await readFile(p);
        if (!isEnc(buf)) {
          plainSkipped++;
          return; // skip fichiers en clair (legacy pré-v2.9, rare après bootstrap migration)
        }
        // Vérifier qu'on peut décrypter avec OLD_KEY
        const plain = decryptWith(buf, oldKey);
        toRotate++;
        if (apply) {
          const newEnc = encryptWith(plain, newKey);
          const tmp = `${p}.tmp-rotate`;
          await writeFile(tmp, newEnc);
          await rename(tmp, p);
        }
      } catch (e) {
        errors++;
        errorList.push({ path: p, error: e.message });
      }
    });
  }

  console.log(`\n→ Résumé`);
  console.log(`  Total fichiers scannés     : ${total}`);
  console.log(`  À rotater (chiffrés ENC1)  : ${toRotate}`);
  console.log(`  Plain text (skip)          : ${plainSkipped}`);
  console.log(`  Erreurs                    : ${errors}`);

  if (errors > 0) {
    console.error('\n✗ Erreurs (les 10 premières) :');
    for (const { path, error } of errorList.slice(0, 10)) {
      console.error(`  ${path}: ${error}`);
    }
  }

  if (apply) {
    if (errors === 0) {
      console.log('\n✓ Rotation appliquée avec succès.');
      console.log('  → Mettez à jour UPLOADS_ENCRYPTION_KEY dans .env avec NEW_UPLOADS_KEY.');
      console.log('  → Redémarrez l\'app.');
      console.log('  → Conservez OLD_UPLOADS_KEY backup 30j en cas de rollback.');
    } else {
      console.error('\n✗ Rotation incomplète à cause d\'erreurs. Vérifier les fichiers en erreur.');
      console.error('  Les fichiers réussis ont été ré-écrits avec NEW_UPLOADS_KEY.');
      console.error('  Les fichiers en erreur restent sous OLD_UPLOADS_KEY.');
      process.exit(2);
    }
  } else {
    console.log('\n→ DRY-RUN terminé. Re-lancer avec --apply pour appliquer la rotation.');
    if (errors > 0) {
      console.error('  ⚠️ Erreurs détectées en DRY-RUN — résoudre avant --apply.');
      process.exit(2);
    }
  }
}

main().catch(e => {
  console.error('✗ Erreur fatale :', e);
  process.exit(1);
});
