/**
 * Tests v2.8.0 — sécurité quick wins + RGPD effacement + export RGPD.
 *
 * Lance : DATABASE_URL=... NEXTAUTH_SECRET=... PORTAIL_BASE_URL=... \
 *         PDF_TEST_MODE=1 npx tsx tests/security-rgpd-v280.test.mts
 *
 * Couvre :
 *   T56 callbackUrl externe → fallback "/" (pas de redirect open)
 *   T57 callbackUrl "//evil" → fallback "/"
 *   T58 callbackUrl "/biens" → "/biens" (légitime)
 *   T59 register email existant → 200 generic (anti-énum, pas 409)
 *   T60 DELETE locataire → cascade complète (Archive purgé, audit anonymisé)
 *   T61 export RGPD ZIP → fichiers attendus + 0 fuite cross-locataire
 *   T62 headers sécu présents (CSP, X-Frame-Options, nosniff)
 *
 * Tests T56-T58 sont unitaires sur safeCallbackUrl (pas de HTTP — fonction
 * pure côté client). On reproduit la logique inline pour ne pas importer
 * le composant client.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { formatRcsFooter } from '../src/lib/legal-pages';

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

// Reproduit safeCallbackUrl du composant /login (cf. src/app/login/page.tsx)
function safeCallbackUrl(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

// ZIP entry parser minimaliste
function listZipEntries(buf: Buffer): string[] {
  const SIG = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const entries: string[] = [];
  let i = 0;
  while ((i = buf.indexOf(SIG, i)) !== -1) {
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
  console.log('→ Setup : 1 bailleur + 1 admin staff + 1 locataire + 1 archive + 1 quittance');

  // Cleanup (ordre : archives uploaded → quittances/loc/bien → memberships → users → bailleur)
  const oldUsers = await prisma.user.findMany({
    where: { email: { in: ['admin-rgpd@x.com', 'duplicate-rgpd@x.com'] } },
    select: { id: true },
  });
  if (oldUsers.length > 0) {
    const ids = oldUsers.map(u => u.id);
    await prisma.archive.deleteMany({ where: { uploadedById: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  }
  await prisma.locataire.deleteMany({ where: { nom: 'TestRgpd' } });
  await prisma.bien.deleteMany({ where: { nom: 'Bien RGPD' } });
  await prisma.bailleurMembership.deleteMany({
    where: { user: { email: { in: ['admin-rgpd@x.com', 'duplicate-rgpd@x.com'] } } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: ['admin-rgpd@x.com', 'duplicate-rgpd@x.com'] } },
  });
  await prisma.bailleur.deleteMany({ where: { nom: 'RgpdTest' } });
  await prisma.auditLog.deleteMany({ where: { targetId: { startsWith: 'deleted_loc_' } } });

  // ─── T56-T58 : safeCallbackUrl unit tests ─────────────────────────────
  console.log('\n→ T56-T58 : safeCallbackUrl unit (open redirect mitigation)');
  assert('T56 callbackUrl=https://evil.com → "/"', safeCallbackUrl('https://evil.com') === '/');
  assert('T57 callbackUrl=//evil.com → "/"', safeCallbackUrl('//evil.com') === '/');
  assert('T57b callbackUrl=/\\\\evil.com → "/"', safeCallbackUrl('/\\evil.com') === '/');
  assert('T58 callbackUrl=/biens → "/biens"', safeCallbackUrl('/biens') === '/biens');
  assert('T58b callbackUrl=null → "/"', safeCallbackUrl(null) === '/');
  assert('T58c callbackUrl=biens (sans slash) → "/"', safeCallbackUrl('biens') === '/');

  // Setup DB pour T59-T62
  const bailleur = await prisma.bailleur.create({
    data: { nom: 'RgpdTest', adresseLigne1: '1 r', adresseLigne2: '75001 Paris', villeSignature: 'Paris' },
  });
  const pwd = await bcrypt.hash('TestPass1!', 10);
  const admin = await prisma.user.create({
    data: { email: 'admin-rgpd@x.com', name: 'Admin RGPD', password: pwd, role: 'ADMIN' },
  });
  const dup = await prisma.user.create({
    data: { email: 'duplicate-rgpd@x.com', name: 'Dup', password: pwd, role: 'MEMBER' },
  });
  await prisma.bailleurMembership.create({
    data: { userId: admin.id, bailleurId: bailleur.id, role: 'ADMIN' },
  });

  const bien = await prisma.bien.create({
    data: { bailleurId: bailleur.id, nom: 'Bien RGPD', adresse: '12 r', codePostal: '75001', ville: 'Paris' },
  });
  const loc = await prisma.locataire.create({
    data: { bienId: bien.id, nom: 'TestRgpd', prenom: 'Jean', loyerNu: 700, charges: 50, dateEntree: new Date('2024-01-01') },
  });
  const archiveLoc = await prisma.archive.create({
    data: {
      ownerType: 'Locataire', ownerId: loc.id,
      category: 'BAIL', filename: 'bail.pdf', storedPath: 'archives/fake-rgpd.pdf',
      mimeType: 'application/pdf', size: 1000, uploadedById: admin.id,
    },
  });
  await prisma.quittance.create({
    data: {
      locataireId: loc.id, mois: 1, annee: 2026,
      loyerNu: 700, charges: 50, montantTotal: 750,
      datePaiement: new Date('2026-01-05'), dateEmission: new Date('2026-01-01'),
    },
  });
  await prisma.auditLog.create({
    data: {
      actorId: admin.id, action: 'locataire.create',
      targetType: 'Locataire', targetId: loc.id,
      metadata: '{}',
    },
  });

  // ─── T59 : register email existant → 200 generic ──────────────────────
  console.log('\n→ T59 : POST /api/register email existant → 200 (anti-énum)');
  const r59 = await fetch(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Dup Attempt', email: 'duplicate-rgpd@x.com', password: 'NewPass123!',
    }),
  });
  const j59 = r59.ok ? await r59.json() : null;
  assert(
    'T59 register email existant → 200 (pas 409)',
    r59.status === 200 && j59?.existing === true,
    `status=${r59.status} existing=${j59?.existing}`,
  );

  // ─── T62 : headers sécu présents ──────────────────────────────────────
  console.log('\n→ T62 : headers sécu présents (CSP, X-Frame-Options, nosniff)');
  const r62 = await fetch(`${BASE_URL}/api/health`);
  const csp = r62.headers.get('content-security-policy') ?? '';
  const xfo = r62.headers.get('x-frame-options') ?? '';
  const nosniff = r62.headers.get('x-content-type-options') ?? '';
  const referrer = r62.headers.get('referrer-policy') ?? '';
  assert(
    'T62 headers : CSP + X-Frame-Options=SAMEORIGIN + nosniff + Referrer-Policy',
    csp.includes('default-src')
    && xfo === 'SAMEORIGIN'
    && nosniff === 'nosniff'
    && referrer.length > 0,
    `csp=${csp.slice(0, 30)}... xfo=${xfo} nosniff=${nosniff} ref=${referrer}`,
  );

  // ─── T61 : export RGPD locataire ──────────────────────────────────────
  console.log('\n→ T61 : GET /api/locataires/[id]/export-rgpd → ZIP attendu');
  const adminJar = new Jar();
  await loginCredentials(adminJar, 'admin-rgpd@x.com', 'TestPass1!');
  const r61 = await fetchWithJar(adminJar, `${BASE_URL}/api/locataires/${loc.id}/export-rgpd`);
  let zipOk = false;
  let entries: string[] = [];
  if (r61.status === 200) {
    const buf = Buffer.from(await r61.arrayBuffer());
    if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
      entries = listZipEntries(buf);
      const hasData = entries.some(n => n.endsWith('/data.json'));
      const hasReadme = entries.some(n => n.endsWith('/README.txt'));
      const hasAuditLog = entries.some(n => n.endsWith('/audit-log.json'));
      const hasQuittance = entries.some(n => /quittances\/2026\/2026-01_/.test(n));
      zipOk = hasData && hasReadme && hasAuditLog && hasQuittance;
    }
  }
  assert(
    'T61 export RGPD ZIP : data.json + README + audit-log + quittances/{YYYY}/',
    r61.status === 200 && zipOk,
    `status=${r61.status} entries=${entries.length}`,
  );

  // ─── T60 : DELETE locataire cascade complète ─────────────────────────
  console.log('\n→ T60 : DELETE /api/locataires/[id] cascade (RGPD effacement)');
  const r60 = await fetchWithJar(adminJar, `${BASE_URL}/api/locataires/${loc.id}`, {
    method: 'DELETE',
  });
  // Verify DB state post-DELETE
  const locStillExists = await prisma.locataire.findUnique({ where: { id: loc.id } });
  const archiveStillExists = await prisma.archive.findUnique({ where: { id: archiveLoc.id } });
  const auditAnonymized = await prisma.auditLog.count({
    where: { targetType: 'Locataire', targetId: { startsWith: 'deleted_loc_' } },
  });
  assert(
    'T60 DELETE → Locataire purgé + Archive purgée + AuditLog anonymisé',
    r60.status === 200
    && locStillExists === null
    && archiveStillExists === null
    && auditAnonymized > 0,
    `status=${r60.status} locExists=${!!locStillExists} archExists=${!!archiveStillExists} anonAudit=${auditAnonymized}`,
  );

  // ─── T63 : formatRcsFooter helper (v2.8.0-rc3) ────────────────────────
  console.log('\n→ T63 : formatRcsFooter helper (siret + raisonSociale + adresseLegale)');
  const f63a = formatRcsFooter({
    nom: 'Beauregard', rcs: null,
    raisonSociale: 'SCI Beauregard', siret: '12345678900012',
    adresseLegale: '12 rue Test 75019 Paris',
  });
  const f63b = formatRcsFooter({
    nom: 'Test', rcs: '987 654 321 RCS Lyon',
    raisonSociale: null, siret: null, adresseLegale: null,
  });
  const f63c = formatRcsFooter({
    nom: 'X', rcs: null, raisonSociale: null, siret: null, adresseLegale: null,
  });
  // SIRET formaté avec espaces : 123 456 789 00012
  const t63ok = f63a === 'SCI Beauregard · SIRET 123 456 789 00012 · 12 rue Test 75019 Paris'
    && f63b === '987 654 321 RCS Lyon'
    && f63c === null;
  assert(
    'T63 formatRcsFooter : siret formaté · raisonSociale · adresseLegale + fallback rcs + null',
    t63ok,
    `f63a="${f63a}" f63b="${f63b}" f63c=${f63c}`,
  );

  // ─── T64 : migration bootstrap rcs→siret (logique inline reproduite) ──
  console.log('\n→ T64 : migration rcs→siret (bootstrap logic)');
  const oldBailleur = await prisma.bailleur.create({
    data: {
      nom: 'Migration Legacy',
      adresseLigne1: '1 r', adresseLigne2: '14000 Caen',
      villeSignature: 'Caen',
      rcs: '123 456 789 RCS Caen',
    },
  });
  // Reproduit la logique bootstrap
  const m = (oldBailleur.rcs ?? '').match(/\b(\d{3})\s?(\d{3})\s?(\d{3})\b/);
  let siretExtracted: string | null = null;
  if (m) {
    siretExtracted = `${m[1]}${m[2]}${m[3]}00012`;
    await prisma.bailleur.update({
      where: { id: oldBailleur.id },
      data: { siret: siretExtracted, raisonSociale: oldBailleur.nom },
    });
  }
  const reloaded = await prisma.bailleur.findUnique({ where: { id: oldBailleur.id } });
  const t64ok = siretExtracted === '12345678900012'
    && reloaded?.siret === '12345678900012'
    && reloaded?.raisonSociale === 'Migration Legacy';
  assert(
    'T64 migration rcs="123 456 789 RCS Caen" → siret="12345678900012" + raisonSociale=nom',
    t64ok,
    `extracted=${siretExtracted} reloadedSiret=${reloaded?.siret} raison=${reloaded?.raisonSociale}`,
  );
  await prisma.bailleur.deleteMany({ where: { id: oldBailleur.id } });

  // Cleanup final
  await prisma.bien.deleteMany({ where: { nom: 'Bien RGPD' } });
  await prisma.bailleurMembership.deleteMany({
    where: { user: { email: { in: ['admin-rgpd@x.com', 'duplicate-rgpd@x.com'] } } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: ['admin-rgpd@x.com', 'duplicate-rgpd@x.com'] } },
  });
  await prisma.bailleur.deleteMany({ where: { nom: 'RgpdTest' } });
  await prisma.auditLog.deleteMany({ where: { targetId: { startsWith: 'deleted_loc_' } } });

  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  await prisma.$disconnect();
  if (passed !== results.length) {
    console.error('\n✗ Tests v2.8.0 sécurité + RGPD ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v2.8.0 sécurité + RGPD passent.');
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
