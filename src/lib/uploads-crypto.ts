/**
 * Chiffrement des uploads (v2.9.0).
 *
 * AES-256-GCM portable — fonctionne sur n'importe quel hébergement
 * (NAS Synology / QNAP, VPS, Docker, cloud) sans dépendre d'une couche
 * système chiffrée native.
 *
 * Format binaire (tout en bytes, pas de base64) :
 *
 *   ┌──────┬─────────┬──────────┬───────────────┐
 *   │ ENC1 │   IV    │ AuthTag  │  Ciphertext   │
 *   │ 4 B  │  12 B   │  16 B    │  variable     │
 *   └──────┴─────────┴──────────┴───────────────┘
 *
 * Magic bytes "ENC1" = ASCII 0x45 0x4E 0x43 0x31. Permet :
 *   1. Détecter qu'un fichier est chiffré (vs legacy en clair).
 *   2. Versionner le format (ENC2... possible si évolution algo).
 *
 * Clé : `process.env.UPLOADS_ENCRYPTION_KEY` — 32 bytes (256 bits)
 * encodés base64 (44 chars sortie). Validation lazy au premier usage
 * (pattern QW3 v2.8 NEXTAUTH_SECRET) — n'empêche pas le build Next.
 *
 * Clé séparée d'`ENCRYPTION_SECRET` (utilisé pour Gmail tokens, smtpPass,
 * totpSecret) : principe de moindre privilège, compromission d'un secret
 * ne donne pas accès à l'autre.
 *
 * **PERTE DE CLÉ = FICHIERS IRRÉCUPÉRABLES**. La clé doit être backupée
 * séparément du serveur (gestionnaire de mots de passe, coffre-fort).
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const MAGIC = Buffer.from('ENC1', 'ascii'); // 4 bytes
const MAGIC_LEN = 4;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC_LEN + IV_LEN + TAG_LEN; // 32 bytes

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.UPLOADS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'UPLOADS_ENCRYPTION_KEY manquante. Générer une clé avec : '
      + 'openssl rand -base64 32 — puis l\'ajouter à .env.',
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('UPLOADS_ENCRYPTION_KEY invalide (base64 attendu).');
  }
  if (key.length !== 32) {
    throw new Error(
      `UPLOADS_ENCRYPTION_KEY invalide (32 bytes attendus après decode base64, reçu ${key.length}). `
      + 'Générer avec : openssl rand -base64 32',
    );
  }
  cachedKey = key;
  return cachedKey;
}

/**
 * Détecte si un buffer est au format chiffré "ENC1...". Retourne false
 * sur les fichiers legacy en clair (compat rétro pré-v2.9 ou si la
 * migration bootstrap n'a pas encore tourné).
 */
export function isEncrypted(buf: Buffer): boolean {
  if (buf.length < HEADER_LEN) return false;
  return buf.subarray(0, MAGIC_LEN).equals(MAGIC);
}

/**
 * Chiffre un buffer plaintext → format "ENC1 + IV + tag + ciphertext".
 * IV aléatoire 12 bytes (recommandation NIST GCM). Auth tag 16 bytes
 * détecte tout tampering au déchiffrement.
 */
export function encryptBuffer(plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, ct]);
}

/**
 * Déchiffre un buffer "ENC1 + IV + tag + ciphertext". Throw si :
 *   - magic bytes absents/incorrects (format invalide)
 *   - auth tag fail (clé incorrecte ou tampering du fichier)
 */
export function decryptBuffer(encrypted: Buffer): Buffer {
  if (!isEncrypted(encrypted)) {
    throw new Error('Buffer non chiffré (magic bytes ENC1 absents).');
  }
  const iv = encrypted.subarray(MAGIC_LEN, MAGIC_LEN + IV_LEN);
  const tag = encrypted.subarray(MAGIC_LEN + IV_LEN, HEADER_LEN);
  const ct = encrypted.subarray(HEADER_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * Helper read-then-decrypt-if-needed pour les routes serving.
 * Si le buffer disque est en clair (legacy), retourne tel quel.
 * Sinon déchiffre et retourne le plaintext.
 */
export function decryptIfNeeded(buf: Buffer): Buffer {
  if (!isEncrypted(buf)) return buf;
  return decryptBuffer(buf);
}
