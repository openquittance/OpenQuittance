/**
 * Tests v2.7.0 Feature C (Export ZIP organisé) — backend Session 1.
 *
 * Lance : DATABASE_URL=... NEXTAUTH_SECRET=... PDF_TEST_MODE=1 \
 *         PORTAIL_BASE_URL=http://localhost:3000 \
 *         npx tsx tests/feature-c-export-zip.test.mts
 *
 * Couvre :
 *   T51 GET /api/exports/bailleur/[id]/zip → 200 + Content-Type + magic
 *       bytes ZIP (PK\x03\x04)
 *   T52 ZIP extract → arborescence attendue + manifest.json + README.txt
 *   T53 cross-tenant : caller sans membership ADMIN sur bailleur cible
 *       → 404 (oracle-free)
 *   T54 rate-limit : 2 exports < 5 min → 429
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const BASE_URL = process.env.PORTAIL_BASE_URL ?? 'http://localhost:3800';
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

/**
 * Parser ZIP minimaliste : extrait la liste des entries depuis les
 * Central Directory File Headers (signature `PK\x01\x02`). Évite la
 * dépendance npm pour 1 test. Suffit pour T52 (lister les noms).
 */
function listZipEntries(buf: Buffer): string[] {
  const SIG = Buffer.from([0x50, 0x4b, 0x01, 0x02]); // PK\x01\x02
  const entries: string[] = [];
  let i = 0;
  while ((i = buf.indexOf(SIG, i)) !== -1) {
    // Central Directory File Header layout:
    //   0..3 sig, 4..5 version made by, 6..7 version needed, 8..9 flags,
    //   10..11 compression, 12..13 mtime, 14..15 mdate, 16..19 crc32,
    //   20..23 compressed size, 24..27 uncompressed size,
    //   28..29 filename length, 30..31 extra length, 32..33 comment length,
    //   34..35 disk start, 36..37 internal attrs, 38..41 external attrs,
    //   42..45 local header offset, 46.. filename
    const fnLen = buf.readUInt16LE(i + 28);
    const extraLen = buf.readUInt16LE(i + 30);
    const commentLen = buf.readUInt16LE(i + 32);
    const fname = buf.subarray(i + 46, i + 46 + fnLen).toString('utf8');
    entries.push(fname);
    i += 46 + fnLen + extraLen + commentLen;
  }
  return entries;
}

async function main() {
  console.log('→ Setup : 2 bailleurs (alpha + beta) + admin alpha + admin beta');
  // Cleanup
  for (const email of ['admin-zip-alpha@x.com', 'admin-zip-beta@x.com']) {
    await prisma.bailleurMembership.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  }
  await prisma.bailleur.deleteMany({ where: { nom: { in: ['ZipExportAlpha', 'ZipExportBeta'] } } });

  const bAlpha = await prisma.bailleur.create({
    data: { nom: 'ZipExportAlpha', adresseLigne1: '1 r', adresseLigne2: '75001 Paris', villeSignature: 'Paris' },
  });
  const bBeta = await prisma.bailleur.create({
    data: { nom: 'ZipExportBeta', adresseLigne1: '2 r', adresseLigne2: '75002 Paris', villeSignature: 'Paris' },
  });
  const pwd = await bcrypt.hash('TestPass1!', 10);
  const adminAlpha = await prisma.user.create({
    data: { email: 'admin-zip-alpha@x.com', name: 'AdminAlpha', password: pwd, role: 'ADMIN' },
  });
  const adminBeta = await prisma.user.create({
    data: { email: 'admin-zip-beta@x.com', name: 'AdminBeta', password: pwd, role: 'ADMIN' },
  });
  await prisma.bailleurMembership.createMany({
    data: [
      { userId: adminAlpha.id, bailleurId: bAlpha.id, role: 'ADMIN' },
      { userId: adminBeta.id, bailleurId: bBeta.id, role: 'ADMIN' },
    ],
  });

  // Crée 1 bien + 1 locataire + 1 quittance sur Alpha (rapide)
  const bienAlpha = await prisma.bien.create({
    data: {
      bailleurId: bAlpha.id, nom: 'Bien Alpha 1',
      adresse: '12 rue Test', codePostal: '75019', ville: 'Paris',
      surface: 42, typeBien: 'T2',
      annonceTexte: 'Annonce Alpha 1 — texte demo',
    },
  });
  const locAlpha = await prisma.locataire.create({
    data: {
      bienId: bienAlpha.id, nom: 'Dupont', prenom: 'Jean',
      loyerNu: 800, charges: 50, dateEntree: new Date('2024-01-01'),
    },
  });
  await prisma.quittance.create({
    data: {
      locataireId: locAlpha.id, mois: 1, annee: 2026,
      loyerNu: 800, charges: 50, montantTotal: 850,
      datePaiement: new Date('2026-01-05'), dateEmission: new Date('2026-01-01'),
    },
  });

  const jarAlpha = new Jar();
  await loginCredentials(jarAlpha, 'admin-zip-alpha@x.com', 'TestPass1!');
  const jarBeta = new Jar();
  await loginCredentials(jarBeta, 'admin-zip-beta@x.com', 'TestPass1!');

  // ─── T51 : GET zip → 200 + magic bytes ZIP ────────────────────────────
  console.log('\n→ T51 : GET /api/exports/bailleur/[id]/zip → 200 + Content-Type + magic ZIP');
  const r51 = await fetchWithJar(jarAlpha, `${BASE_URL}/api/exports/bailleur/${bAlpha.id}/zip`);
  let buf51: Buffer | null = null;
  let contentType51 = '';
  let disposition51 = '';
  if (r51.status === 200) {
    contentType51 = r51.headers.get('content-type') ?? '';
    disposition51 = r51.headers.get('content-disposition') ?? '';
    buf51 = Buffer.from(await r51.arrayBuffer());
  }
  const magicOk = buf51 != null
    && buf51.length > 200
    && buf51.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  assert(
    'T51 GET zip → 200 + Content-Type application/zip + magic bytes PK\\x03\\x04',
    r51.status === 200
    && contentType51.includes('application/zip')
    && disposition51.includes('quittances-export-zipexportalpha-')
    && magicOk,
    `status=${r51.status} ct=${contentType51} disposition=${disposition51.slice(0, 80)} size=${buf51?.length} magic=${magicOk}`,
  );

  // ─── T52 : ZIP entries → arborescence + manifest + README ─────────────
  console.log('\n→ T52 : ZIP entries — arborescence + manifest.json + README.txt');
  let entries52: string[] = [];
  if (buf51) entries52 = listZipEntries(buf51);
  const hasManifest = entries52.some(n => n.endsWith('/manifest.json'));
  const hasReadme = entries52.some(n => n.endsWith('/README.txt'));
  const hasAuditLog = entries52.some(n => n.endsWith('/audit-log.json'));
  const hasBienDir = entries52.some(n => n.match(/^zipexportalpha\/biens\/bien-alpha-1\//));
  const hasAnnonce = entries52.some(n => n.endsWith('/annonce.txt'));
  const hasQuittance = entries52.some(n => n.match(/quittances\/2026\/2026-01_quittance\.pdf$/));
  assert(
    'T52 ZIP entries : manifest.json + README.txt + audit-log.json + biens/{slug}/ + annonce.txt + quittances/{YYYY}/{YYYY-MM}_*.pdf',
    hasManifest && hasReadme && hasAuditLog && hasBienDir && hasAnnonce && hasQuittance,
    `manifest=${hasManifest} readme=${hasReadme} audit=${hasAuditLog} bien=${hasBienDir} annonce=${hasAnnonce} q=${hasQuittance} count=${entries52.length}`,
  );

  // ─── T53 : cross-tenant → 404 ─────────────────────────────────────────
  console.log('\n→ T53 : cross-tenant export → 404 (oracle-free)');
  // adminBeta tente d'exporter Alpha (sans membership Alpha)
  const r53 = await fetchWithJar(jarBeta, `${BASE_URL}/api/exports/bailleur/${bAlpha.id}/zip`);
  assert(
    'T53 cross-tenant : adminBeta sans membership sur Alpha → 404',
    r53.status === 404,
    `status=${r53.status}`,
  );

  // ─── T54 : rate-limit → 429 ───────────────────────────────────────────
  console.log('\n→ T54 : 2e export < 5 min même bailleur même user → 429');
  const r54 = await fetchWithJar(jarAlpha, `${BASE_URL}/api/exports/bailleur/${bAlpha.id}/zip`);
  assert(
    'T54 rate-limit 1/5min : 2e export immédiat → 429 + Retry-After',
    r54.status === 429 && (r54.headers.get('retry-after') ?? '') !== '',
    `status=${r54.status} retryAfter=${r54.headers.get('retry-after')}`,
  );

  // Cleanup
  await prisma.quittance.deleteMany({ where: { locataire: { nom: 'Dupont' } } });
  await prisma.locataire.deleteMany({ where: { nom: 'Dupont' } });
  await prisma.bien.deleteMany({ where: { nom: { startsWith: 'Bien Alpha' } } });
  for (const email of ['admin-zip-alpha@x.com', 'admin-zip-beta@x.com']) {
    await prisma.bailleurMembership.deleteMany({ where: { user: { email } } });
    await prisma.user.deleteMany({ where: { email } });
  }
  await prisma.bailleur.deleteMany({ where: { nom: { in: ['ZipExportAlpha', 'ZipExportBeta'] } } });

  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  await prisma.$disconnect();
  if (passed !== results.length) {
    console.error('\n✗ Tests Feature C export ZIP ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests Feature C export ZIP passent.');
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
