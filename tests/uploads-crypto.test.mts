/**
 * Tests v2.9.0 — chiffrement uploads AES-256-GCM portable.
 *
 * Lance : UPLOADS_ENCRYPTION_KEY=$(openssl rand -base64 32) \
 *         npx tsx tests/uploads-crypto.test.mts
 *
 * T65 encryptBuffer → magic bytes "ENC1" en tête
 * T66 round-trip encrypt + decrypt → buffer identique
 * T67 decrypt avec mauvaise clé → throw (auth tag fail)
 * T68 isEncrypted detection clair vs chiffré
 * T69 intégration : POST /api/upload + GET /api/uploads/[...path]
 *     → fichier disque chiffré + serving renvoie plaintext
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync, existsSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { encryptBuffer, decryptBuffer, isEncrypted } from '../src/lib/uploads-crypto';

const BASE_URL = process.env.PORTAIL_BASE_URL ?? 'http://localhost:3800';
const UPLOADS_DIR = process.env.UPLOADS_DIR || resolvePath(process.cwd(), 'uploads');
const prisma = new PrismaClient();

class Jar {
  private store = new Map<string, string>();
  ingest(setCookie: string[]) {
    for (const c of setCookie) {
      const kv = c.split(';')[0]!;
      const eq = kv.indexOf('=');
      if (eq > 0) this.store.set(kv.slice(0, eq), kv.slice(eq + 1));
    }
  }
  header(): string {
    return [...this.store.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

async function fetchWithJar(jar: Jar, url: string, init: RequestInit = {}) {
  const r = await fetch(url, {
    ...init,
    headers: { ...(init.headers ?? {}), Cookie: jar.header() },
    redirect: 'manual',
  });
  jar.ingest(r.headers.getSetCookie?.() ?? []);
  return r;
}

async function loginCredentials(jar: Jar, email: string, password: string) {
  const csrfResp = await fetchWithJar(jar, `${BASE_URL}/api/auth/csrf`);
  const csrf = await csrfResp.json();
  const r = await fetchWithJar(jar, `${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password, csrfToken: csrf.csrfToken }).toString(),
  });
  if (![200, 302].includes(r.status)) {
    throw new Error(`login failed for ${email}: ${r.status}`);
  }
}

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  // ─── Tests unitaires (pas besoin de stack HTTP) ───────────────────────
  const plaintext = Buffer.from('Hello, World ! Données sensibles 🔒.\n', 'utf-8');

  // T65 encrypt → magic "ENC1"
  const encrypted = encryptBuffer(plaintext);
  const t65ok = encrypted.length > plaintext.length + 31
    && encrypted.subarray(0, 4).toString('ascii') === 'ENC1';
  assert(
    'T65 encryptBuffer → magic bytes "ENC1" + header 32 bytes overhead',
    t65ok,
    `len plain=${plaintext.length} enc=${encrypted.length} magic="${encrypted.subarray(0, 4).toString('ascii')}"`,
  );

  // T66 round-trip
  const decrypted = decryptBuffer(encrypted);
  const t66ok = decrypted.equals(plaintext);
  assert(
    'T66 encrypt + decrypt round-trip → buffer identique au plaintext',
    t66ok,
    `plain="${plaintext.subarray(0, 30)}..." dec="${decrypted.subarray(0, 30)}..."`,
  );

  // T67 mauvaise clé → throw
  const originalKey = process.env.UPLOADS_ENCRYPTION_KEY;
  let threwOnBadKey = false;
  try {
    // Force re-evaluation du cache via lazy : importer dynamiquement avec
    // une nouvelle clé est complexe (cache module). On simule en altérant
    // les bytes du chiffré : le tag GCM doit fail.
    const tampered = Buffer.from(encrypted);
    // Flip un bit dans le ciphertext (offset 32 = après header)
    tampered[40] = tampered[40] ^ 0xff;
    decryptBuffer(tampered);
  } catch {
    threwOnBadKey = true;
  }
  assert(
    'T67 decrypt buffer altéré (tampering) → throw auth tag fail',
    threwOnBadKey,
  );

  // T68 isEncrypted detection
  const t68a = isEncrypted(encrypted);
  const t68b = isEncrypted(plaintext);
  const t68c = isEncrypted(Buffer.from('ENC1xx', 'ascii')); // magic OK mais trop court
  assert(
    'T68 isEncrypted : true sur chiffré, false sur plain, false si trop court',
    t68a === true && t68b === false && t68c === false,
    `enc=${t68a} plain=${t68b} short=${t68c}`,
  );

  // ─── T69 intégration HTTP ────────────────────────────────────────────
  // Setup : 1 bailleur + admin + login + POST /api/upload (logo) + vérif
  // disque chiffré + GET /api/uploads/[...path] = plaintext.
  console.log('\n→ T69 intégration : POST upload + GET serve → disque chiffré + plain serving');

  await prisma.bailleurMembership.deleteMany({
    where: { user: { email: 'crypto-uploads@x.com' } },
  });
  await prisma.user.deleteMany({ where: { email: 'crypto-uploads@x.com' } });
  await prisma.bailleur.deleteMany({ where: { nom: 'CryptoTest' } });

  const b = await prisma.bailleur.create({
    data: { nom: 'CryptoTest', adresseLigne1: '1 r', adresseLigne2: '75001 Paris', villeSignature: 'Paris' },
  });
  const pwd = await bcrypt.hash('TestPass1!', 10);
  const admin = await prisma.user.create({
    data: { email: 'crypto-uploads@x.com', name: 'Crypto Admin', password: pwd, role: 'ADMIN' },
  });
  await prisma.bailleurMembership.create({
    data: { userId: admin.id, bailleurId: b.id, role: 'ADMIN' },
  });

  const jar = new Jar();
  await loginCredentials(jar, 'crypto-uploads@x.com', 'TestPass1!');

  // PNG 1x1 transparent (87 bytes)
  const png1x1 = Buffer.from(
    '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4'
    + '890000000D49444154789C636001000000050001A4E4DCD80000000049454E44AE426082',
    'hex',
  );

  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(png1x1)], { type: 'image/png' }), 'logo.png');
  fd.append('kind', 'logo');
  fd.append('bailleurId', b.id);
  const rUpload = await fetchWithJar(jar, `${BASE_URL}/api/upload`, {
    method: 'POST',
    body: fd,
  });
  let uploadOk = false;
  let uploadedPath = '';
  if (rUpload.status === 200) {
    const j = await rUpload.json();
    uploadedPath = j.path; // bailleurs/<id>/logo-<ts>.png
    uploadOk = !!uploadedPath;
  }

  // Vérif : fichier disque commence par "ENC1"
  let diskEncrypted = false;
  if (uploadOk) {
    const diskPath = join(UPLOADS_DIR, uploadedPath);
    if (existsSync(diskPath)) {
      const raw = readFileSync(diskPath);
      diskEncrypted = isEncrypted(raw);
    }
  }

  // GET /api/uploads/<uploadedPath> → contenu déchiffré = png1x1
  let serveOk = false;
  if (uploadOk) {
    const rServe = await fetchWithJar(jar, `${BASE_URL}/api/uploads/${uploadedPath}`);
    if (rServe.status === 200) {
      const served = Buffer.from(await rServe.arrayBuffer());
      serveOk = served.equals(png1x1);
    }
  }

  assert(
    'T69 POST upload encrypt disque + GET serving décrypte → plain',
    uploadOk && diskEncrypted && serveOk,
    `upload=${uploadOk} disk_enc=${diskEncrypted} serve_ok=${serveOk} path=${uploadedPath}`,
  );

  // Cleanup
  await prisma.bailleurMembership.deleteMany({
    where: { user: { email: 'crypto-uploads@x.com' } },
  });
  await prisma.user.deleteMany({ where: { email: 'crypto-uploads@x.com' } });
  await prisma.bailleur.deleteMany({ where: { nom: 'CryptoTest' } });

  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  await prisma.$disconnect();
  if (passed !== results.length) {
    console.error('\n✗ Tests v2.9.0 chiffrement uploads ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v2.9.0 chiffrement uploads passent.');
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
