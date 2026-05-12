import { authenticator } from 'otplib';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import qrcode from 'qrcode';
import { encrypt, decrypt } from './crypto';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

// Configuration TOTP RFC 6238 — défauts otplib (30s window, 6 digits, SHA1).
// On accepte ±1 step (±30s) pour compenser le drift d'horloge.
authenticator.options = { window: 1 };

const APP_ISSUER = 'OpenQuittance';
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_BYTES = 5; // 10 hex chars

export interface BackupCode {
  hash: string;
  used: boolean;
}

/** Génère un nouveau secret TOTP base32. À utiliser uniquement pendant le setup. */
export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

/** Construit l'URL otpauth:// pour le QR code. */
export function buildOtpAuthUrl(secret: string, accountName: string): string {
  return authenticator.keyuri(accountName, APP_ISSUER, secret);
}

/** Génère le data URL d'une image PNG du QR code à afficher dans le navigateur. */
export async function generateQrDataUrl(secret: string, accountName: string): Promise<string> {
  const url = buildOtpAuthUrl(secret, accountName);
  return qrcode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, scale: 6 });
}

/**
 * Vérifie un code TOTP saisi par l'utilisateur contre son secret.
 * Le secret est attendu en clair (déchiffrer avant appel si nécessaire).
 */
export function verifyTotpToken(token: string, secret: string): boolean {
  if (!token || !secret) return false;
  // otplib gère déjà la fenêtre de tolérance configurée plus haut.
  return authenticator.verify({ token: token.replace(/\s/g, ''), secret });
}

/**
 * Génère 8 codes de secours, chacun de 10 caractères hex en majuscules,
 * formatés "XXXXX-XXXXX" pour la lecture humaine. Retourne aussi les hashes
 * scrypt à stocker en base.
 */
export async function generateBackupCodes(): Promise<{
  plain: string[];
  hashed: BackupCode[];
}> {
  const plain: string[] = [];
  const hashed: BackupCode[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const raw = randomBytes(BACKUP_CODE_BYTES).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    plain.push(formatted);
    hashed.push({ hash: await hashBackupCode(formatted), used: false });
  }
  return { plain, hashed };
}

async function hashBackupCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(code, salt, 32);
  // Format: salt(hex):derived(hex)
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

async function compareBackupCode(code: string, stored: string): Promise<boolean> {
  const [saltHex, derivedHex] = stored.split(':');
  if (!saltHex || !derivedHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(derivedHex, 'hex');
  const candidate = await scrypt(code, salt, expected.length);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/**
 * Vérifie un code de secours et le marque comme utilisé.
 * Retourne la liste mise à jour si OK, null si aucun match.
 */
export async function consumeBackupCode(
  code: string,
  codes: BackupCode[],
): Promise<BackupCode[] | null> {
  const normalized = code.replace(/\s/g, '').toUpperCase();
  for (let i = 0; i < codes.length; i++) {
    const c = codes[i]!;
    if (c.used) continue;
    if (await compareBackupCode(normalized, c.hash)) {
      const updated = codes.map((x, j) => (j === i ? { ...x, used: true } : x));
      return updated;
    }
  }
  return null;
}

/** Sérialise les codes de secours pour stockage en base (chiffré). */
export function serializeBackupCodes(codes: BackupCode[]): string {
  return encrypt(JSON.stringify(codes));
}

export function deserializeBackupCodes(stored: string | null): BackupCode[] {
  if (!stored) return [];
  try {
    return JSON.parse(decrypt(stored)) as BackupCode[];
  } catch {
    return [];
  }
}

/** Stocke le secret TOTP chiffré. Wrapper sémantique pour clarifier l'intention. */
export const encryptTotpSecret = encrypt;
export const decryptTotpSecret = decrypt;
