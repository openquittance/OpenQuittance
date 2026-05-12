import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

// Chiffrement symétrique AES-256-GCM des champs sensibles en base.
//
// Format produit : "enc:v1:<base64(iv|tag|ciphertext)>"
// - iv  : 12 octets aléatoires
// - tag : 16 octets d'authentification GCM
// - ciphertext : longueur variable
//
// La clé de chiffrement est dérivée de ENCRYPTION_SECRET via SHA-256
// (pour accepter n'importe quelle longueur de secret en entrée).
//
// Le préfixe "enc:v1:" sert deux usages :
//   1. distinguer une valeur chiffrée d'une valeur en clair (migration progressive)
//   2. permettre une rotation future ("enc:v2:" si on change l'algorithme)

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'ENCRYPTION_SECRET manquant ou trop court (minimum 16 caractères). ' +
      'Générez-en un avec : openssl rand -hex 32',
    );
  }
  cachedKey = createHash('sha256').update(secret).digest();
  return cachedKey;
}

export function isEncrypted(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encrypt(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Déchiffre une valeur chiffrée. Si la valeur n'a pas le préfixe `enc:v1:`,
 * on considère qu'elle est en clair (legacy / migration en cours) et on la
 * retourne telle quelle.
 */
export function decrypt(value: string): string {
  if (!isEncrypted(value)) return value;
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function encryptOptional(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return encrypt(value);
}

export function decryptOptional(value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return decrypt(value);
}
