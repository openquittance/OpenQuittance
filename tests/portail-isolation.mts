/**
 * Tests d'isolation du portail locataire (Lot A).
 *
 * Lance : npx tsx tests/portail-isolation.mts
 * Pré-requis : stack quittances-v2 sur http://localhost:3800.
 *
 * Couvre les 5 règles d'isolation de docs/PORTAIL-LOCATAIRE.md §4 :
 *
 *   1. TENANT → /api/locataires      → 403
 *   2. TENANT → /api/quittances/[id]/pdf (devinette d'ID) → 403
 *   3. Staff  → /portail (page)      → redirect /
 *   4. TENANT non auth → /portail/quittances → redirect /portail/login
 *   5. TENANT auth → /  (route staff) → redirect /portail
 *
 * Lot B ajoute :
 *   8. Activation portail refusée si email = email d'un staff existant (409)
 *   9. Suppression du seul locataire d'un TENANT → user disabled →
 *      /api/portail/login retourne silent OK mais aucun magic link créé
 *
 * Régression Bug v2.3.0-rc1 :
 *  13. TENANT loguant via magic link alors qu'aucun ADMIN n'existe en base
 *      ne doit JAMAIS être promu ADMIN par le jwt callback "first user
 *      becomes admin". Le test 13 utilise un setup distinct (pas d'admin
 *      créé) pour exercer cette branche.
 *
 * Lot D (réservés, à implémenter dans tests/page-verify.spec.ts ou
 *  prolongement) :
 *  14, 15, 16 : page /portail/login/verify Server Component (cf.
 *               PORTAIL-LOCATAIRE-TODO.md §D.1)
 *
 * Lot C ajoute (à partir de 17 pour ne pas chevaucher Lot D) :
 *  17. TENANT télécharge SA quittance via /api/portail/quittances/[id]/pdf
 *      (status, content-type, magic %PDF, taille, contenu via pdf-parse)
 *  18. TENANT tente quittance d'un AUTRE locataire → 404 (no leak)
 *  19. Non auth sur l'endpoint download → 401
 *  20. Staff sur l'endpoint /portail download → 403
 *  21. TENANT GET /api/portail/quittances → liste filtrée à ses quittances
 *  22. TENANT lié à 2 locataires du même bailleur voit les quittances
 *      des 2 baux (multi-bail), jamais d'un 3ème orphelin
 *  23. Flow E2E complet : magic link → consume → /portail → liste →
 *      download PDF → assertion pdf-parse contient nom locataire
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
  if (r.status !== 302 || (r.headers.get('location') ?? '').includes('error=')) {
    throw new Error(`login failed for ${email}: ${r.status} ${r.headers.get('location')}`);
  }
}

interface TestResult { name: string; ok: boolean; detail?: string }
const results: TestResult[] = [];

function assert(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  console.log('→ Setup : reset DB + crée 1 admin staff + 1 TENANT + 1 quittance');

  // Nettoyage des comptes de test précédents (idempotence)
  await prisma.user.deleteMany({ where: { email: { in: ['admin@isol-test.local', 'tenant@isol-test.local'] } } });

  // Admin staff (créé manuellement, pas via /api/register pour bypass le mode CLOSED)
  const adminPwd = await bcrypt.hash('AdminPass1!', 10);
  const admin = await prisma.user.create({
    data: { email: 'admin@isol-test.local', name: 'Isol Admin', password: adminPwd, role: 'ADMIN' },
  });

  // S'assurer qu'on a au moins une AppConfig (sinon /api/parametres et autres throw)
  await prisma.appConfig.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });

  // TENANT user
  const tenantPwd = await bcrypt.hash('TenantPass1!', 10);
  const tenant = await prisma.user.create({
    data: { email: 'tenant@isol-test.local', name: 'Isol Tenant', password: tenantPwd, role: 'TENANT' },
  });

  // Bailleur + bien + locataire (lié au TENANT) + quittance
  const bailleur = await prisma.bailleur.upsert({
    where: { id: 'isol-bailleur' },
    update: {},
    create: {
      id: 'isol-bailleur', nom: 'Isol Bailleur',
      adresseLigne1: '1 rue Test', adresseLigne2: '75000 Paris',
      villeSignature: 'Paris', pdfCouleur: '#000000', pdfPolice: 'Helvetica',
    },
  });
  const bien = await prisma.bien.upsert({
    where: { id: 'isol-bien' },
    update: {},
    create: {
      id: 'isol-bien', bailleurId: bailleur.id, nom: 'Logement test',
      adresse: '1 r', codePostal: '75000', ville: 'Paris',
    },
  });
  const locataire = await prisma.locataire.upsert({
    where: { id: 'isol-loc' },
    update: { tenantUserId: tenant.id, portailActiveLe: new Date(), portailActif: true },
    create: {
      id: 'isol-loc', bienId: bien.id, nom: 'TestLoc', prenom: 'X',
      loyerNu: 500, charges: 50, dateEntree: new Date(),
      tenantUserId: tenant.id, portailActiveLe: new Date(), portailActif: true,
    },
  });
  const quittance = await prisma.quittance.upsert({
    where: { locataireId_mois_annee: { locataireId: locataire.id, mois: 1, annee: 2026 } },
    update: {},
    create: {
      locataireId: locataire.id, mois: 1, annee: 2026,
      loyerNu: 500, charges: 50, montantTotal: 550,
      datePaiement: new Date(), dateEmission: new Date(),
    },
  });

  // Lot C bis : admin staff doit avoir une membership sur le bailleur de
  // test pour passer les checks withBailleurScope/requireResourceInScope.
  await prisma.bailleurMembership.upsert({
    where: { userId_bailleurId: { userId: admin.id, bailleurId: bailleur.id } },
    update: {},
    create: { userId: admin.id, bailleurId: bailleur.id, role: 'ADMIN' },
  });

  // Login chacun
  const adminJar = new Jar();
  await loginCredentials(adminJar, 'admin@isol-test.local', 'AdminPass1!');
  const tenantJar = new Jar();
  await loginCredentials(tenantJar, 'tenant@isol-test.local', 'TenantPass1!');
  const noJar = new Jar();

  console.log('→ Tests d\'isolation (5)');

  // Test 1 : TENANT → /api/locataires → 403
  const r1 = await fetchWithJar(tenantJar, `${BASE_URL}/api/locataires`);
  assert(
    'TENANT bloqué sur /api/locataires (403)',
    r1.status === 403,
    `status=${r1.status}`,
  );

  // Test 2 : TENANT → /api/quittances/{id}/pdf → 403 (route staff)
  const r2 = await fetchWithJar(tenantJar, `${BASE_URL}/api/quittances/${quittance.id}/pdf`);
  assert(
    'TENANT bloqué sur /api/quittances/[id]/pdf (403)',
    r2.status === 403,
    `status=${r2.status}`,
  );

  // Test 3 : Staff → /portail → redirect /
  const r3 = await fetchWithJar(adminJar, `${BASE_URL}/portail`);
  const r3Loc = r3.headers.get('location') ?? '';
  assert(
    'Staff redirigé depuis /portail vers /',
    r3.status === 307 || r3.status === 302
      ? r3Loc.endsWith('/') || r3Loc === `${BASE_URL}/`
      : false,
    `status=${r3.status} location=${r3Loc}`,
  );

  // Test 4 : non auth → /portail/quittances → redirect /portail/login
  const r4 = await fetchWithJar(noJar, `${BASE_URL}/portail/quittances`);
  const r4Loc = r4.headers.get('location') ?? '';
  assert(
    'Non auth redirigé depuis /portail/quittances vers /portail/login',
    (r4.status === 307 || r4.status === 302) && r4Loc.includes('/portail/login'),
    `status=${r4.status} location=${r4Loc}`,
  );

  // Test 5 : TENANT auth → / → redirect /portail
  const r5 = await fetchWithJar(tenantJar, `${BASE_URL}/`);
  const r5Loc = r5.headers.get('location') ?? '';
  assert(
    'TENANT redirigé depuis / vers /portail',
    (r5.status === 307 || r5.status === 302) && r5Loc.includes('/portail'),
    `status=${r5.status} location=${r5Loc}`,
  );

  // Bonus : TENANT → /api/quittances → 403 (route staff)
  const rb = await fetchWithJar(tenantJar, `${BASE_URL}/api/quittances`);
  assert(
    'TENANT bloqué sur /api/quittances (403)',
    rb.status === 403,
    `status=${rb.status}`,
  );

  // Bonus : TENANT → /api/admin/users → 403
  const rc = await fetchWithJar(tenantJar, `${BASE_URL}/api/admin/users`);
  assert(
    'TENANT bloqué sur /api/admin/users (403)',
    rc.status === 403,
    `status=${rc.status}`,
  );

  // ─── Lot B : tests #8 et #9 ──────────────────────────────────────────────
  console.log('\n→ Tests Lot B : collision email + orphan');

  // Test 8 : email collision staff vs locataire
  // On crée un 2e locataire dont l'email == email d'un staff existant.
  // L'activation du portail doit échouer en 409.
  const loc2 = await prisma.locataire.create({
    data: {
      bienId: bien.id,
      nom: 'CollisionLoc', prenom: 'X',
      email: 'admin@isol-test.local', // = email du admin staff
      loyerNu: 500, charges: 50, dateEntree: new Date(),
    },
  });
  // L'admin doit avoir des paramètres email pour que la route ne fail pas avant
  // le check collision. On simule en créant des paramètres minimalistes.
  await prisma.parametres.upsert({
    where: { userId: admin.id },
    update: { emailMethod: 'gmail_api', gmailRefreshToken: 'enc:v1:fake', gmailEmail: 'admin@isol-test.local' },
    create: { userId: admin.id, emailMethod: 'gmail_api', gmailRefreshToken: 'enc:v1:fake', gmailEmail: 'admin@isol-test.local' },
  });
  const r8 = await fetchWithJar(adminJar, `${BASE_URL}/api/locataires/${loc2.id}/portail-invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const r8Body = await r8.json().catch(() => ({}));
  assert(
    'Activation portail refusée si email = email staff (409)',
    r8.status === 409 && (r8Body.error ?? '').toLowerCase().includes('staff'),
    `status=${r8.status} error=${r8Body.error}`,
  );

  // Test 9 : orphan TENANT
  // Le tenant 'tenant@isol-test.local' n'a qu'un seul locataire (locataire).
  // Si on supprime ce locataire :
  //  - User devrait être désactivé (disabledAt set)
  //  - Demande magic link → silent OK mais aucun token créé
  // Note : la suppression directe en Prisma déclenche le hook DELETE de l'API
  // seulement si on passe par l'API. Pour le test on appelle l'API DELETE.
  // D'abord effacer la quittance liée pour permettre la suppression cascade
  await prisma.quittance.deleteMany({ where: { locataireId: locataire.id } });
  const r9del = await fetchWithJar(adminJar, `${BASE_URL}/api/locataires/${locataire.id}`, {
    method: 'DELETE',
  });
  const tenantAfter = await prisma.user.findUnique({ where: { id: tenant.id } });
  const linksBefore = await prisma.portailMagicLink.count({ where: { tenantUserId: tenant.id } });

  assert(
    'Suppression locataire OK',
    r9del.ok,
    `status=${r9del.status}`,
  );
  assert(
    'TENANT marqué disabledAt après suppression du dernier locataire',
    tenantAfter?.disabledAt != null,
    `disabledAt=${tenantAfter?.disabledAt?.toISOString() ?? 'null'}`,
  );

  // Demande de magic link sur cet email → silent OK mais 0 nouveau lien créé
  const r9magic = await fetch(`${BASE_URL}/api/portail/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'tenant@isol-test.local' }),
  });
  const linksAfter = await prisma.portailMagicLink.count({ where: { tenantUserId: tenant.id } });
  assert(
    'Magic link sur compte orphan → 200 silencieux (anti-énumération)',
    r9magic.ok,
    `status=${r9magic.status}`,
  );
  assert(
    'Magic link sur compte orphan → 0 nouveau token créé',
    linksAfter === linksBefore,
    `before=${linksBefore} after=${linksAfter}`,
  );

  // ─── Régression Bug TENANT promu ADMIN ──────────────────────────────────
  console.log('\n→ Test régression : TENANT ne doit pas être promu ADMIN');

  // Setup distinct : on supprime tous les ADMIN, on crée un nouveau TENANT
  // sans aucun admin existant. Cas découvert quand le user testait
  // l'invitation magic link sur une stack neuve avant d'avoir créé un admin.
  await prisma.portailMagicLink.deleteMany();
  await prisma.user.deleteMany({ where: { role: 'ADMIN' } });
  await prisma.user.deleteMany({ where: { email: 'tenant-noadmin@isol-test.local' } });

  // Vérifie qu'on a bien 0 ADMIN (sinon le bug ne serait pas déclenchable)
  const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
  if (adminCount !== 0) throw new Error('setup test 13 : encore des admins en base');

  // Crée un nouveau Bailleur+Bien+Locataire pour le TENANT solo
  const bien2 = await prisma.bien.create({
    data: { bailleurId: bailleur.id, nom: 'Test 13', adresse: '13 r', codePostal: '75013', ville: 'Paris' },
  });
  const tenant13 = await prisma.user.create({
    data: { email: 'tenant-noadmin@isol-test.local', name: 'Solo', role: 'TENANT' },
  });
  await prisma.locataire.create({
    data: {
      bienId: bien2.id, nom: 'Solo', prenom: 'X',
      loyerNu: 500, charges: 50, dateEntree: new Date(),
      tenantUserId: tenant13.id, portailActiveLe: new Date(), portailActif: true,
    },
  });

  // Génère + consomme un magic link via l'endpoint réel (= passe par le
  // jwt callback de NextAuth, c'est lui qui contient le bug à reproduire).
  const { generateMagicLink } = await import('../src/lib/portail-magic.js')
    .catch(async () => await import('../src/lib/portail-magic'));
  const { token: token13 } = await generateMagicLink({ tenantUserId: tenant13.id });

  const jar13 = new Jar();
  const r13verify = await fetchWithJar(jar13, `${BASE_URL}/api/portail/login/verify?token=${token13}`);
  // On suit la chaîne de redirects (la session est créée pendant)
  let next = r13verify.headers.get('location');
  let safety = 0;
  while (next && safety++ < 5) {
    if (!next.startsWith('http')) next = new URL(next, BASE_URL).toString();
    const rr = await fetchWithJar(jar13, next);
    next = rr.headers.get('location');
  }

  // Force un round-trip qui exerce le jwt callback (request session)
  await fetchWithJar(jar13, `${BASE_URL}/api/auth/session`);

  // Vérification : le TENANT doit toujours avoir role=TENANT en DB
  const tenant13After = await prisma.user.findUnique({ where: { id: tenant13.id } });
  assert(
    'TENANT seul (sans aucun ADMIN) ne doit pas être promu ADMIN par jwt callback',
    tenant13After?.role === 'TENANT',
    `role en DB après login = ${tenant13After?.role}`,
  );

  // ─── Tests T14/T15/T16 : page /portail/login/verify Server Component ──
  // Phase 3 D.1 : la page peek l'état du token sans le consommer et
  // rend une UI dédiée par cas (valid → signIn client / consumed,
  // expired, invalid → message + bouton "demander un nouveau lien").
  console.log('\n→ Tests T14/T15/T16 : page /portail/login/verify (Phase 3 D.1)');

  // T14 : token déjà consommé → page contient "Lien déjà utilisé"
  const tokenT14Result = await generateMagicLink({ tenantUserId: tenant13.id });
  // Force le token consommé en DB
  await prisma.portailMagicLink.updateMany({
    where: { tenantUserId: tenant13.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const r14 = await fetch(`${BASE_URL}/portail/login/verify?token=${tokenT14Result.token}`);
  const html14 = await r14.text();
  assert(
    'T14 token consommé → page rend "Lien déjà utilisé"',
    r14.status === 200 && html14.includes('Lien déjà utilisé'),
    `status=${r14.status} hasLabel=${html14.includes('Lien déjà utilisé')}`,
  );

  // T15 : token expiré → page contient "Lien expiré"
  const tokenT15Result = await generateMagicLink({ tenantUserId: tenant13.id });
  await prisma.portailMagicLink.updateMany({
    where: { tenantUserId: tenant13.id, consumedAt: null },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const r15 = await fetch(`${BASE_URL}/portail/login/verify?token=${tokenT15Result.token}`);
  const html15 = await r15.text();
  assert(
    'T15 token expiré → page rend "Lien expiré"',
    r15.status === 200 && html15.includes('Lien expiré'),
    `status=${r15.status} hasLabel=${html15.includes('Lien expiré')}`,
  );

  // T16 : token inexistant/invalide → page contient "Lien invalide"
  const r16 = await fetch(`${BASE_URL}/portail/login/verify?token=cafebabe1234`);
  const html16 = await r16.text();
  assert(
    'T16 token invalide → page rend "Lien invalide"',
    r16.status === 200 && html16.includes('Lien invalide'),
    `status=${r16.status} hasLabel=${html16.includes('Lien invalide')}`,
  );

  // ─── Test désactivation auto portail 5 ans (Phase 3) ─────────────────
  // Bootstrap.mjs étape 0 : Locataire.dateSortie > 5 ans → portailActif=false.
  // Test inline : crée un locataire avec dateSortie il y a 5 ans + 1 jour,
  // run la logique, assert portailActif=false. Le compte reste en DB.
  console.log('\n→ Test désactivation auto portail 5 ans');
  const bailExpire = await prisma.bailleur.create({
    data: { nom: 'Bail Expire', adresseLigne1: '1 r', adresseLigne2: '75001 Paris', villeSignature: 'Paris' },
  });
  const bienExpire = await prisma.bien.create({
    data: { bailleurId: bailExpire.id, nom: 'Bien E', adresse: '1', codePostal: '75001', ville: 'Paris' },
  });
  const dateSortie5y = new Date();
  dateSortie5y.setFullYear(dateSortie5y.getFullYear() - 5);
  dateSortie5y.setDate(dateSortie5y.getDate() - 1);
  const locExpire = await prisma.locataire.create({
    data: {
      bienId: bienExpire.id, nom: 'Expire', prenom: 'Z',
      loyerNu: 500, charges: 50,
      dateEntree: new Date('2018-01-01'),
      dateSortie: dateSortie5y,
      portailActif: true,
    },
  });
  // Run logique bootstrap inline
  const cutoff5y = new Date();
  cutoff5y.setFullYear(cutoff5y.getFullYear() - 5);
  await prisma.locataire.updateMany({
    where: { portailActif: true, dateSortie: { not: null, lt: cutoff5y } },
    data: { portailActif: false },
  });
  const after = await prisma.locataire.findUnique({ where: { id: locExpire.id } });
  assert(
    'Locataire dateSortie > 5 ans → portailActif=false (compte reste en DB)',
    !!after && after.portailActif === false,
    `exists=${!!after} portailActif=${after?.portailActif}`,
  );

  // ─── Lot C : tests 17-23 ────────────────────────────────────────────────
  // Re-setup : on a besoin d'un TENANT loggué + une quittance à lui +
  // un AUTRE TENANT avec sa propre quittance (pour tester le 404 trans-tenant)
  console.log('\n→ Lot C : portail quittances + download PDF');

  await prisma.portailMagicLink.deleteMany();
  await prisma.user.deleteMany({});
  await prisma.locataire.deleteMany({});
  await prisma.bien.deleteMany({});
  await prisma.bailleur.deleteMany({});
  await prisma.appConfig.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });

  // Admin staff
  const adminPwd17 = await bcrypt.hash('AdminPass1!', 10);
  const admin17 = await prisma.user.create({
    data: { email: 'admin@lotc.local', name: 'Admin C', password: adminPwd17, role: 'ADMIN' },
  });

  // Bailleur + bien + locataire principal (TENANT 17)
  const bailleur17 = await prisma.bailleur.create({
    data: {
      nom: 'Bailleur LotC',
      adresseLigne1: '1 rue C', adresseLigne2: '75001 Paris', villeSignature: 'Paris',
      pdfCouleur: '#1a3a5c', pdfPolice: 'Helvetica',
    },
  });
  const bien17 = await prisma.bien.create({
    data: { bailleurId: bailleur17.id, nom: 'Logement 17', adresse: '1 rue C', codePostal: '75001', ville: 'Paris' },
  });
  const tenantUser17 = await prisma.user.create({
    data: { email: 'tenant17@lotc.local', name: 'Camille C', role: 'TENANT' },
  });
  const locataire17 = await prisma.locataire.create({
    data: {
      bienId: bien17.id, nom: 'Camille', prenom: 'Test',
      loyerNu: 500, charges: 50, dateEntree: new Date('2024-01-01'),
      tenantUserId: tenantUser17.id, portailActiveLe: new Date(), portailActif: true,
    },
  });
  const quittance17 = await prisma.quittance.create({
    data: {
      locataireId: locataire17.id, mois: 3, annee: 2026,
      loyerNu: 500, charges: 50, montantTotal: 550,
      datePaiement: new Date('2026-03-05'), dateEmission: new Date('2026-03-01'),
    },
  });

  // Lot C bis : admin17 doit avoir des memberships sur b17 ET b18 pour
  // pouvoir tester les flows admin staff (ex: téléchargement quittance
  // d'un locataire). Avant, l'admin app-level avait accès à tout en DB.
  await prisma.bailleurMembership.create({
    data: { userId: admin17.id, bailleurId: bailleur17.id, role: 'ADMIN' },
  });

  // Second TENANT (autre locataire, autre bailleur même DB) pour test cross-leak
  const bailleur18 = await prisma.bailleur.create({
    data: {
      nom: 'Bailleur Other',
      adresseLigne1: '2 rue O', adresseLigne2: '75002 Paris', villeSignature: 'Paris',
      pdfCouleur: '#1a3a5c', pdfPolice: 'Helvetica',
    },
  });
  const bien18 = await prisma.bien.create({
    data: { bailleurId: bailleur18.id, nom: 'Logement 18', adresse: '2 rue O', codePostal: '75002', ville: 'Paris' },
  });
  const tenantUser18 = await prisma.user.create({
    data: { email: 'tenant18@lotc.local', name: 'Other Tenant', role: 'TENANT' },
  });
  const locataire18 = await prisma.locataire.create({
    data: {
      bienId: bien18.id, nom: 'Other', prenom: 'Z',
      loyerNu: 700, charges: 60, dateEntree: new Date('2024-01-01'),
      tenantUserId: tenantUser18.id, portailActiveLe: new Date(), portailActif: true,
    },
  });
  // admin17 a aussi un membership sur b18 pour tester scenarios cross
  await prisma.bailleurMembership.create({
    data: { userId: admin17.id, bailleurId: bailleur18.id, role: 'ADMIN' },
  });
  const quittance18 = await prisma.quittance.create({
    data: {
      locataireId: locataire18.id, mois: 3, annee: 2026,
      loyerNu: 700, charges: 60, montantTotal: 760,
      datePaiement: new Date('2026-03-05'), dateEmission: new Date('2026-03-01'),
    },
  });

  // Login TENANT 17 via magic link (generateMagicLink déjà importé pour test 13)
  const { token: tokenT17 } = await generateMagicLink({ tenantUserId: tenantUser17.id });
  const tenantJar17 = new Jar();
  const verify17 = await fetchWithJar(tenantJar17, `${BASE_URL}/api/portail/login/verify?token=${tokenT17}`);
  let nx = verify17.headers.get('location');
  let s = 0;
  while (nx && s++ < 5) {
    if (!nx.startsWith('http')) nx = new URL(nx, BASE_URL).toString();
    const rr = await fetchWithJar(tenantJar17, nx);
    nx = rr.headers.get('location');
  }

  // Login admin (pour test 20 staff sur endpoint portail)
  const adminJar17 = new Jar();
  await loginCredentials(adminJar17, 'admin@lotc.local', 'AdminPass1!');

  // Test 17 : TENANT télécharge SA quittance via /api/portail/quittances/[id]/pdf
  // Doit échouer en C.1 (route absente → 404 ou 500)
  const r17 = await fetchWithJar(tenantJar17, `${BASE_URL}/api/portail/quittances/${quittance17.id}/pdf`);
  let ok17 = r17.status === 200
    && r17.headers.get('content-type')?.includes('application/pdf') === true;
  let ok17pdf = false;
  let ok17content = false;
  if (ok17) {
    const buf = Buffer.from(await r17.arrayBuffer());
    // Seuil 1500 bytes : PDFKit minimaliste (sans logo/signature uploadés
    // côté bailleur) fait ~3KB. PDF "erreur" / vide < 1KB.
    ok17pdf = buf.subarray(0, 4).toString() === '%PDF' && buf.length > 1_500;
    if (ok17pdf) {
      const mod = await import('pdf-parse');
      const PDFParse = (mod as unknown as { PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> } }).PDFParse;
      const parser = new PDFParse({ data: buf });
      const { text } = await parser.getText();
      ok17content = text.includes('Camille')
        && (text.includes('Mars') || text.includes('mars'))
        && (text.includes('550,00') || text.includes('550.00'));
    }
  }
  assert(
    'TENANT télécharge SA quittance (200 + magic %PDF + contenu)',
    ok17 && ok17pdf && ok17content,
    `status=${r17.status} ct=${r17.headers.get('content-type')} pdfMagic=${ok17pdf} content=${ok17content}`,
  );

  // Test 18 : TENANT 17 tente la quittance d'un AUTRE locataire (TENANT 18) → 404
  // Le filtre Prisma composite ne doit JAMAIS retourner cette quittance.
  const r18 = await fetchWithJar(tenantJar17, `${BASE_URL}/api/portail/quittances/${quittance18.id}/pdf`);
  assert(
    'TENANT bloqué sur quittance d\'un AUTRE locataire (404)',
    r18.status === 404,
    `status=${r18.status}`,
  );

  // Test 19 : non auth → 401
  const r19 = await fetch(`${BASE_URL}/api/portail/quittances/${quittance17.id}/pdf`);
  assert(
    'Non auth bloqué sur /api/portail/quittances/[id]/pdf (401)',
    r19.status === 401,
    `status=${r19.status}`,
  );

  // Test 20 : staff (admin) sur l'endpoint /portail → 403 (middleware)
  const r20 = await fetchWithJar(adminJar17, `${BASE_URL}/api/portail/quittances/${quittance17.id}/pdf`);
  assert(
    'Staff bloqué sur /api/portail/quittances/[id]/pdf (403)',
    r20.status === 403,
    `status=${r20.status}`,
  );

  // Test 21 : TENANT GET /api/portail/quittances → liste filtrée à SES quittances
  const r21 = await fetchWithJar(tenantJar17, `${BASE_URL}/api/portail/quittances`);
  let q21List: { id: string }[] = [];
  if (r21.status === 200) {
    const j21 = await r21.json();
    q21List = j21.quittances ?? [];
  }
  assert(
    'TENANT GET /api/portail/quittances retourne ses quittances + AUCUNE d\'un autre tenant',
    r21.status === 200
      && q21List.length >= 1
      && q21List.some(q => q.id === quittance17.id)
      && !q21List.some(q => q.id === quittance18.id),
    `status=${r21.status} count=${q21List.length} containsOwn=${q21List.some(q => q.id === quittance17.id)} containsOther=${q21List.some(q => q.id === quittance18.id)}`,
  );

  // Test 22 : multi-bail (TENANT 17 lié à 2 locataires du MÊME bailleur)
  // → liste contient les quittances des 2 baux, jamais celles d'un 3ème orphelin
  const bien17b = await prisma.bien.create({
    data: { bailleurId: bailleur17.id, nom: 'Logement 17b', adresse: '17b rue C', codePostal: '75001', ville: 'Paris' },
  });
  const locataire17b = await prisma.locataire.create({
    data: {
      bienId: bien17b.id, nom: 'Camille', prenom: 'Test',
      loyerNu: 800, charges: 80, dateEntree: new Date('2024-06-01'),
      tenantUserId: tenantUser17.id, portailActiveLe: new Date(), portailActif: true,
    },
  });
  const quittance17b = await prisma.quittance.create({
    data: {
      locataireId: locataire17b.id, mois: 4, annee: 2026,
      loyerNu: 800, charges: 80, montantTotal: 880,
      datePaiement: new Date('2026-04-05'), dateEmission: new Date('2026-04-01'),
    },
  });

  // Locataire orphelin (pas lié au TENANT 17) sur même bailleur
  const locataireOrphan = await prisma.locataire.create({
    data: {
      bienId: bien17.id, nom: 'Orphelin', prenom: 'X',
      loyerNu: 600, charges: 60, dateEntree: new Date(),
    },
  });
  const quittanceOrphan = await prisma.quittance.create({
    data: {
      locataireId: locataireOrphan.id, mois: 4, annee: 2026,
      loyerNu: 600, charges: 60, montantTotal: 660,
      datePaiement: new Date(), dateEmission: new Date(),
    },
  });

  const r22 = await fetchWithJar(tenantJar17, `${BASE_URL}/api/portail/quittances`);
  let q22List: { id: string }[] = [];
  if (r22.status === 200) {
    const j22 = await r22.json();
    q22List = j22.quittances ?? [];
  }
  assert(
    'TENANT multi-bail voit les 2 baux + JAMAIS la quittance d\'un orphelin',
    r22.status === 200
      && q22List.some(q => q.id === quittance17.id)
      && q22List.some(q => q.id === quittance17b.id)
      && !q22List.some(q => q.id === quittanceOrphan.id),
    `status=${r22.status} hasMain=${q22List.some(q => q.id === quittance17.id)} hasSecond=${q22List.some(q => q.id === quittance17b.id)} leakOrphan=${q22List.some(q => q.id === quittanceOrphan.id)}`,
  );

  // ─── Test 23 — Flow E2E complet (Lot C.11) ──────────────────────────────
  // Demande magic link via /api/portail/login → consume via verify →
  // GET /portail (page rendue) → fetch /api/portail/quittances → download
  // PDF → assertion pdf-parse contient nom locataire.
  console.log('\n→ Test 23 : flow E2E complet portail');

  // Setup ENCORE (DB pleine de tests précédents). On crée une 3ème instance.
  await prisma.portailMagicLink.deleteMany();
  // On garde le bailleur17 + bien17 + locataire17 + tenantUser17 + quittance17
  // mais on recrée un magic link tout neuf (anti rate limit).
  const { token: token23 } = await generateMagicLink({ tenantUserId: tenantUser17.id });

  // Étape 1 : verify le magic link (= signIn server-side, set cookie)
  const jar23 = new Jar();
  const verify23 = await fetchWithJar(jar23, `${BASE_URL}/api/portail/login/verify?token=${token23}`);
  let n23 = verify23.headers.get('location');
  let s23 = 0;
  while (n23 && s23++ < 5) {
    if (!n23.startsWith('http')) n23 = new URL(n23, BASE_URL).toString();
    const rr = await fetchWithJar(jar23, n23);
    n23 = rr.headers.get('location');
  }

  // Étape 2 : fetch /portail (page rendue)
  const page23 = await fetchWithJar(jar23, `${BASE_URL}/portail`);
  const pageHtml = await page23.text();
  const pageOk = page23.status === 200
    && pageHtml.includes('Bonjour')
    && pageHtml.includes(bailleur17.nom);

  // Étape 3 : list quittances via API
  const list23 = await fetchWithJar(jar23, `${BASE_URL}/api/portail/quittances`);
  const list23json = list23.status === 200 ? await list23.json() : { quittances: [] };
  const quittanceFromApi = list23json.quittances.find((q: { id: string }) => q.id === quittance17.id);
  const listOk = list23.status === 200 && !!quittanceFromApi;

  // Étape 4 : download PDF + assertion contenu
  const pdf23 = await fetchWithJar(jar23, `${BASE_URL}/api/portail/quittances/${quittance17.id}/pdf?download=1`);
  let pdfOk = false;
  let textOk = false;
  if (pdf23.status === 200) {
    const buf = Buffer.from(await pdf23.arrayBuffer());
    pdfOk = buf.subarray(0, 4).toString() === '%PDF' && buf.length > 1_500;
    if (pdfOk) {
      const mod = await import('pdf-parse');
      const PDFParse = (mod as unknown as { PDFParse: new (opts: { data: Buffer }) => { getText(): Promise<{ text: string }> } }).PDFParse;
      const parser = new PDFParse({ data: buf });
      const { text } = await parser.getText();
      textOk = text.includes('Camille')
        && (text.includes('Mars') || text.includes('mars'))
        && (text.includes('550,00') || text.includes('550.00'));
    }
  }

  assert(
    'E2E flow complet : verify → /portail → list → download PDF → contenu OK',
    pageOk && listOk && pdfOk && textOk,
    `page=${pageOk} list=${listOk} pdf=${pdfOk} text=${textOk}`,
  );

  // ─── Test 24 : régression bug "/portail/quittances Client Component" ────
  // Bug Lot C : page shippée comme Client Component → useSession() renvoyait
  // 'unauthenticated' au premier render → router.push('/portail/login') →
  // middleware bounce vers /portail (boucle silencieuse).
  // Invisible côté tests HTTP (pas de browser → pas d'hydratation JS).
  // Détecté manuellement via Playwright. Fix : Server Component (cf. D.3).
  //
  // Ce test fetch la PAGE HTML (pas l'API) et exige que le contenu soit
  // RENDU côté SSR (titre "Toutes vos quittances" + pas de "Chargement…").
  // Si la page repasse en Client Component avec useSession() : HTML SSR
  // contiendra le placeholder loading → test rouge.
  console.log('\n→ Test 24 : régression /portail/quittances SSR');
  const page24 = await fetchWithJar(jar23, `${BASE_URL}/portail/quittances`);
  const html24 = await page24.text();
  const ssrOk = page24.status === 200
    && html24.includes('Toutes vos quittances')
    && !html24.includes('Chargement…')
    && !page24.headers.get('location');
  assert(
    'TENANT cold-fetch /portail/quittances → 200 + titre rendu côté SSR (régression Client Component bug)',
    ssrOk,
    `status=${page24.status} hasTitle=${html24.includes('Toutes vos quittances')} hasLoading=${html24.includes('Chargement…')} location=${page24.headers.get('location')}`,
  );

  // ─── Test 25 : système de branding (cf. PORTAIL-BRANDING.md) ────────────
  // Vérifie que les 3 variables CSS sont injectées dans le HTML SSR :
  //   --brand           = bailleur.pdfCouleur (full hex)
  //   --brand-pale      = hsl(<hue>, 30%, 95%)
  //   --brand-text-on-brand = #1a1a1a si lum > 0.5 sinon #ffffff
  // Et que la règle "pas d'aplat plein de la couleur" est respectée :
  // pas de `background-color: <pdfCouleur>` dans le HTML hors badge/bouton.
  console.log('\n→ Test 25 : système branding bailleur (CSS vars + luminance)');
  // Bleu marine moyen-foncé : luminance ≈ 0.045 → texte blanc attendu.
  await prisma.bailleur.update({
    where: { id: bailleur17.id },
    data: { pdfCouleur: '#1a2b5e', logoUrl: '/uploads/fake-logo.png' },
  });
  const page25 = await fetchWithJar(jar23, `${BASE_URL}/portail`);
  const html25 = await page25.text();
  const hasBrand = html25.includes('--brand:#1a2b5e');
  // Hue de #1a2b5e ≈ 224° (calculé via hexToHsl) — on accepte 220-228 pour
  // marge d'erreur d'arrondi. Le pattern accepte "hsl(224, 30%, 95%)".
  const palMatch = html25.match(/--brand-pale:hsl\((\d+),\s*30%,\s*95%\)/);
  const hue = palMatch ? parseInt(palMatch[1]!, 10) : -1;
  const hueOk = hue >= 220 && hue <= 230;
  const hasTextOnBrand = html25.includes('--brand-text-on-brand:#ffffff');
  // Règle 1 : pas d'aplat plein de la couleur. On ne doit PAS voir
  // `background-color:#1a2b5e` ailleurs que dans le badge compteur
  // (qui est l'unique exception : "X disponibles" en var(--brand)).
  // On accepte 0 ou 1 occurrence (le badge), pas plus.
  const fillOccurrences = (html25.match(/background-color:\s*#1a2b5e/gi) ?? []).length;
  const noFloodFill = fillOccurrences <= 1;
  assert(
    'CSS vars --brand / --brand-pale / --brand-text-on-brand correctement injectées',
    page25.status === 200 && hasBrand && hueOk && hasTextOnBrand && noFloodFill,
    `status=${page25.status} hasBrand=${hasBrand} hue=${hue} hasTextOnBrand=${hasTextOnBrand} fillOccurrences=${fillOccurrences}`,
  );

  // ─── Test 26 : edge cases couleurs extrêmes ─────────────────────────────
  // 4 couleurs aux extrêmes du spectre. Pour chacune, on vérifie que
  // textOnBrand calculé est cohérent avec la luminance (pas de
  // "blanc sur blanc" ni "noir sur noir").
  console.log('\n→ Test 26 : edge cases couleurs extrêmes');
  const cases: Array<{ hex: string; expectedTextOnBrand: '#1a1a1a' | '#ffffff'; label: string }> = [
    { hex: '#000000', expectedTextOnBrand: '#ffffff', label: 'noir pur' },
    { hex: '#ffffff', expectedTextOnBrand: '#1a1a1a', label: 'blanc pur' },
    { hex: '#ffff00', expectedTextOnBrand: '#1a1a1a', label: 'jaune fluo' },
    { hex: '#800080', expectedTextOnBrand: '#ffffff', label: 'violet' },
  ];
  let allEdgeCasesOk = true;
  const edgeReport: string[] = [];
  for (const c of cases) {
    await prisma.bailleur.update({
      where: { id: bailleur17.id },
      data: { pdfCouleur: c.hex },
    });
    const r = await fetchWithJar(jar23, `${BASE_URL}/portail`);
    const h = await r.text();
    const ok = r.status === 200
      && h.includes(`--brand:${c.hex}`)
      && h.includes(`--brand-text-on-brand:${c.expectedTextOnBrand}`);
    edgeReport.push(`${c.label}(${c.hex})=${ok ? 'OK' : 'FAIL'}`);
    if (!ok) allEdgeCasesOk = false;
  }
  assert(
    'Couleurs extrêmes (#000/#fff/#ffff00/#800080) → textOnBrand correct (WCAG luminance)',
    allEdgeCasesOk,
    edgeReport.join(' '),
  );

  // ─── Test 27 : branding propagé dans les générateurs PDF ───────────────
  // Vérifie que pdfCouleur est plumbé dans les 4 générateurs PDF :
  // quittance, avis-echeance, depot-garantie, courrier-revision. Pour
  // chacun, on génère le PDF avec 2 couleurs distinctes et on vérifie
  // que les bytes du buffer changent. Si un générateur ignore
  // pdfCouleur (regression Lot C BRAND_DARK hardcodé), les bytes sont
  // identiques → test rouge.
  console.log('\n→ Test 27 : branding propagé dans les générateurs PDF');
  // Re-active un locataire pour les générateurs qui en ont besoin
  await prisma.locataire.update({
    where: { id: locataire17.id },
    data: { irlValeurReference: 100, irlTrimestre: 2, dateEntree: new Date('2024-01-01') },
  });
  // Génère une révision DRAFT pour le test courrier-revision
  await prisma.revisionIRL.deleteMany({ where: { locataireId: locataire17.id } });
  const rev27 = await prisma.revisionIRL.create({
    data: {
      locataireId: locataire17.id, dateEffet: new Date('2026-01-01'),
      ancienLoyer: 500, nouveauLoyer: 510, irlReference: 100, irlNouveau: 102,
      trimestre: 2, statut: 'DRAFT',
    },
  });

  const generators = [
    { url: `/api/quittances/${quittance17.id}/pdf`, label: 'quittance' },
    { url: `/api/documents/avis-echeance?locataireId=${locataire17.id}&mois=3&annee=2026`, label: 'avis-echeance' },
    { url: `/api/documents/depot-garantie?locataireId=${locataire17.id}&montant=600`, label: 'depot-garantie' },
    { url: `/api/documents/courrier-revision?revisionId=${rev27.id}`, label: 'courrier-revision' },
  ];

  let allGenOk = true;
  const genReport: string[] = [];
  for (const g of generators) {
    // PDF avec couleur 1 (rouge)
    await prisma.bailleur.update({
      where: { id: bailleur17.id },
      data: { pdfCouleur: '#ff0000' },
    });
    const r1 = await fetchWithJar(adminJar17, `${BASE_URL}${g.url}`);
    const buf1 = r1.status === 200 ? Buffer.from(await r1.arrayBuffer()) : Buffer.alloc(0);

    // PDF avec couleur 2 (bleu)
    await prisma.bailleur.update({
      where: { id: bailleur17.id },
      data: { pdfCouleur: '#0000ff' },
    });
    const r2 = await fetchWithJar(adminJar17, `${BASE_URL}${g.url}`);
    const buf2 = r2.status === 200 ? Buffer.from(await r2.arrayBuffer()) : Buffer.alloc(0);

    // PDFKit émet `r g b scn` (fill) et `r g b SCN` (stroke) dans le content
    // stream. Avec PDF_TEST_MODE=1, le stream n'est pas compressé. Si
    // pdfCouleur est plumbé, on trouve "1 0 0 scn" (rouge fill) ou
    // "1 0 0 SCN" (rouge stroke). Idem bleu.
    const has = (b: Buffer, hex: string) => {
      const tok = hex === '#ff0000' ? '1 0 0' : '0 0 1';
      const s = b.toString('binary');
      return s.includes(`${tok} scn`) || s.includes(`${tok} SCN`);
    };
    const ok = r1.status === 200 && r2.status === 200
      && buf1.length > 1500 && buf2.length > 1500
      && has(buf1, '#ff0000') && has(buf2, '#0000ff');
    genReport.push(`${g.label}(${r1.status},${r2.status})=${ok ? 'OK' : 'FAIL'}`);
    if (!ok) allGenOk = false;
  }
  assert(
    'Branding pdfCouleur propagé dans les 4 générateurs PDF (rouge → "1 0 0 rg", bleu → "0 0 1 rg")',
    allGenOk,
    genReport.join(' '),
  );

  // Reset à la couleur par défaut + nettoyage logo
  await prisma.bailleur.update({
    where: { id: bailleur17.id },
    data: { pdfCouleur: '#1a3a5c', logoUrl: null },
  });

  // ─── Tests 28-33 : Phase 1 doc sharing ────────────────────────────────
  // Source of truth : Locataire.portailActif + 3 toggles partage*. Quand
  // portailActif=false → portail bloqué (gate global). Toggle false →
  // catégorie correspondante non exposée.
  console.log('\n→ Tests 28-33 : Phase 1 doc sharing toggles');

  // Setup : ré-utilise tenantUser17 + locataire17. Login via magic link.
  await prisma.locataire.update({
    where: { id: locataire17.id },
    data: { portailActif: true, partageQuittances: true, partageEtatDesLieux: true, partageBail: true },
  });
  const { token: tokenP1 } = await generateMagicLink({ tenantUserId: tenantUser17.id });
  const jarP1 = new Jar();
  const verP1 = await fetchWithJar(jarP1, `${BASE_URL}/api/portail/login/verify?token=${tokenP1}`);
  let np1 = verP1.headers.get('location'); let sp1 = 0;
  while (np1 && sp1++ < 5) { if (!np1.startsWith('http')) np1 = new URL(np1, BASE_URL).toString(); const rr = await fetchWithJar(jarP1, np1); np1 = rr.headers.get('location'); }

  // T28 : portailActif=true + partageQuittances=true → liste OK
  const r28 = await fetchWithJar(jarP1, `${BASE_URL}/api/portail/quittances`);
  const j28 = await r28.json();
  assert(
    'T28 portailActif=true + partageQuittances=true → liste contient quittance',
    r28.status === 200 && (j28.quittances?.length ?? 0) >= 1,
    `status=${r28.status} count=${j28.quittances?.length}`,
  );

  // T29 : portailActif=false sur TOUS les locataires du tenant → list=[]
  // (gate global). Le tenant17 a 2 locataires (multi-bail T22), on les
  // désactive tous les deux pour exercer le gate sur l'ensemble.
  await prisma.locataire.updateMany({
    where: { tenantUserId: tenantUser17.id },
    data: { portailActif: false },
  });
  const r29 = await fetchWithJar(jarP1, `${BASE_URL}/api/portail/quittances`);
  const j29 = await r29.json();
  const r29pdf = await fetchWithJar(jarP1, `${BASE_URL}/api/portail/quittances/${quittance17.id}/pdf`);
  assert(
    'T29 portailActif=false (tous loc) → list=[] + GET /[id]/pdf=404 (no oracle)',
    r29.status === 200 && (j29.quittances?.length ?? 0) === 0 && r29pdf.status === 404,
    `list_count=${j29.quittances?.length} pdf_status=${r29pdf.status}`,
  );

  // Restore portailActif=true sur tous les locataires
  await prisma.locataire.updateMany({
    where: { tenantUserId: tenantUser17.id },
    data: { portailActif: true },
  });

  // T30 : portailActif=true mais partageQuittances=false sur TOUS → list=[]
  await prisma.locataire.updateMany({
    where: { tenantUserId: tenantUser17.id },
    data: { partageQuittances: false },
  });
  const r30 = await fetchWithJar(jarP1, `${BASE_URL}/api/portail/quittances`);
  const j30 = await r30.json();
  const r30pdf = await fetchWithJar(jarP1, `${BASE_URL}/api/portail/quittances/${quittance17.id}/pdf`);
  assert(
    'T30 partageQuittances=false (tous loc) → list=[] + GET /[id]/pdf=404',
    r30.status === 200 && (j30.quittances?.length ?? 0) === 0 && r30pdf.status === 404,
    `list_count=${j30.quittances?.length} pdf_status=${r30pdf.status}`,
  );
  await prisma.locataire.updateMany({
    where: { tenantUserId: tenantUser17.id },
    data: { partageQuittances: true },
  });

  // T31 : Archive ownerType=Locataire visibleLocataire=true catégorie libre → exposée
  await prisma.archive.deleteMany({ where: { ownerType: 'Locataire', ownerId: locataire17.id } });
  const archDpe = await prisma.archive.create({
    data: {
      ownerType: 'Locataire', ownerId: locataire17.id,
      category: 'DPE', filename: 'dpe.pdf', storedPath: 'archives/x.pdf',
      mimeType: 'application/pdf', size: 1000, uploadedById: admin17.id,
      visibleLocataire: true,
    },
  });
  const r31 = await fetchWithJar(jarP1, `${BASE_URL}/api/portail/documents`);
  const j31 = await r31.json();
  const t31ok = r31.status === 200 && (j31.documents ?? []).some((d: { id: string }) => d.id === archDpe.id);
  assert(
    'T31 Archive catégorie libre + visibleLocataire=true → exposée',
    t31ok,
    `status=${r31.status} count=${j31.documents?.length} ids=${(j31.documents ?? []).map((d: { id: string }) => d.id).join(',')}`,
  );

  // T32 : Archive visibleLocataire=false catégorie libre → cachée
  await prisma.archive.update({ where: { id: archDpe.id }, data: { visibleLocataire: false } });
  const r32 = await fetchWithJar(jarP1, `${BASE_URL}/api/portail/documents`);
  const j32 = await r32.json();
  assert(
    'T32 Archive catégorie libre + visibleLocataire=false → cachée',
    r32.status === 200 && !((j32.documents ?? []).some((d: { id: string }) => d.id === archDpe.id)),
    `count=${j32.documents?.length}`,
  );

  // T33 : Archive catégorie système 'edl-entree' gouvernée par toggle
  // partageEtatDesLieux (ignore visibleLocataire). Avec toggle=true → exposée.
  // Avec toggle=false → cachée même si visibleLocataire=true (cas extrême).
  const archEdl = await prisma.archive.create({
    data: {
      ownerType: 'Locataire', ownerId: locataire17.id,
      category: 'edl-entree', filename: 'edl.pdf', storedPath: 'archives/y.pdf',
      mimeType: 'application/pdf', size: 1000, uploadedById: admin17.id,
      visibleLocataire: false, // important : prouve que toggle gouverne, pas visibleLocataire
    },
  });
  const r33a = await fetchWithJar(jarP1, `${BASE_URL}/api/portail/documents`);
  const j33a = await r33a.json();
  const expA = (j33a.documents ?? []).some((d: { id: string }) => d.id === archEdl.id);
  await prisma.locataire.update({ where: { id: locataire17.id }, data: { partageEtatDesLieux: false } });
  const r33b = await fetchWithJar(jarP1, `${BASE_URL}/api/portail/documents`);
  const j33b = await r33b.json();
  const expB = (j33b.documents ?? []).some((d: { id: string }) => d.id === archEdl.id);
  assert(
    'T33 Archive edl-entree gouvernée par partageEtatDesLieux (true=visible, false=cachée même si visibleLocataire=false)',
    expA === true && expB === false,
    `togglOn=${expA} togglOff=${expB}`,
  );

  // Cleanup
  await prisma.locataire.update({ where: { id: locataire17.id }, data: { partageEtatDesLieux: true } });
  await prisma.archive.deleteMany({ where: { id: { in: [archDpe.id, archEdl.id] } } });

  // ─── Tests 34-40 : v2.5.0 Feature A — Documents propriétaire ─────────
  // T34/T35 : POST /api/archives validation whitelist catégorie obligatoire.
  // T36 : POST Bien catégorie ACTE_VENTE → 200 (canonique whitelist).
  // T37/T38 : portail tenant voit les Bien-archives DDT (DPE) si toggle
  //           Locataire.partageDDT=true ; cachées si false.
  // T39 : portail tenant ne voit JAMAIS catégorie Bien hors-DDT (filet
  //       serveur strict, même si tampering category côté client).
  // T40 : migration helper Q6 — DPE en ownerType=Locataire → flip vers
  //       Bien via locataire.bienId.
  console.log('\n→ Tests 34-40 : v2.5.0 Feature A — Documents propriétaire (categories whitelist + DDT)');

  // Helper : POST upload via FormData (multipart). Reuse adminJar17 (staff).
  const fakePdf = Buffer.from('%PDF-1.4\n%fake-test-pdf\n');
  const postArchive = async (form: { ownerType: string; ownerId: string; category?: string }) => {
    const fd = new FormData();
    fd.append('ownerType', form.ownerType);
    fd.append('ownerId', form.ownerId);
    if (form.category !== undefined) fd.append('category', form.category);
    fd.append('file', new Blob([new Uint8Array(fakePdf)], { type: 'application/pdf' }), 'test.pdf');
    return fetchWithJar(adminJar17, `${BASE_URL}/api/archives`, {
      method: 'POST',
      body: fd,
    });
  };

  // T34 : POST sans category → 400
  const r34 = await postArchive({ ownerType: 'Bien', ownerId: bien17.id });
  assert(
    'T34 POST /api/archives sans category → 400',
    r34.status === 400,
    `status=${r34.status}`,
  );

  // T35 : POST avec category hors whitelist → 400
  const r35 = await postArchive({ ownerType: 'Bien', ownerId: bien17.id, category: 'PIZZA' });
  assert(
    'T35 POST /api/archives category hors whitelist → 400',
    r35.status === 400,
    `status=${r35.status}`,
  );

  // T36 : POST Bien category ACTE_VENTE → 200 + persisté en DB
  const r36 = await postArchive({ ownerType: 'Bien', ownerId: bien17.id, category: 'ACTE_VENTE' });
  let r36ok = r36.status === 200;
  let r36archiveId: string | null = null;
  if (r36ok) {
    const j36 = await r36.json();
    r36archiveId = j36.archive?.id ?? null;
    r36ok = !!r36archiveId && j36.archive?.category === 'ACTE_VENTE'
      && j36.archive?.ownerType === 'Bien';
  }
  assert(
    'T36 POST Bien category=ACTE_VENTE → 200 + persisté (whitelist canonique)',
    r36ok,
    `status=${r36.status} id=${r36archiveId}`,
  );

  // Setup pour T37/T38/T39 : créer Bien-archive DDT (DPE) + Bien-archive
  // hors-DDT (ACTE_VENTE) sur bien17. Restore portailActif sur tous loc.
  await prisma.locataire.updateMany({
    where: { tenantUserId: tenantUser17.id },
    data: { portailActif: true, partageDDT: false },
  });
  // Re-login tenant via magic link (rate limit conservateur)
  const { token: tokenP2 } = await generateMagicLink({ tenantUserId: tenantUser17.id });
  const jarP2 = new Jar();
  const verP2 = await fetchWithJar(jarP2, `${BASE_URL}/api/portail/login/verify?token=${tokenP2}`);
  let np2 = verP2.headers.get('location'); let sp2 = 0;
  while (np2 && sp2++ < 5) {
    if (!np2.startsWith('http')) np2 = new URL(np2, BASE_URL).toString();
    const rr = await fetchWithJar(jarP2, np2);
    np2 = rr.headers.get('location');
  }

  await prisma.archive.deleteMany({ where: { ownerType: 'Bien', ownerId: bien17.id } });
  const archDDT = await prisma.archive.create({
    data: {
      ownerType: 'Bien', ownerId: bien17.id,
      category: 'DPE', filename: 'dpe-bien.pdf', storedPath: 'archives/ddt.pdf',
      mimeType: 'application/pdf', size: 1000, uploadedById: admin17.id,
    },
  });
  const archActe = await prisma.archive.create({
    data: {
      ownerType: 'Bien', ownerId: bien17.id,
      category: 'ACTE_VENTE', filename: 'acte-vente.pdf', storedPath: 'archives/acte.pdf',
      mimeType: 'application/pdf', size: 1000, uploadedById: admin17.id,
    },
  });

  // T37 : partageDDT=true → tenant voit DPE Bien
  await prisma.locataire.update({
    where: { id: locataire17.id },
    data: { partageDDT: true },
  });
  const r37 = await fetchWithJar(jarP2, `${BASE_URL}/api/portail/documents`);
  const j37 = await r37.json();
  const t37ok = r37.status === 200
    && (j37.documents ?? []).some((d: { id: string }) => d.id === archDDT.id);
  assert(
    'T37 partageDDT=true → tenant voit Bien-archive DPE',
    t37ok,
    `status=${r37.status} count=${j37.documents?.length} hasDDT=${(j37.documents ?? []).map((d: { id: string }) => d.id).includes(archDDT.id)}`,
  );

  // T38 : partageDDT=false → DPE Bien caché
  await prisma.locataire.updateMany({
    where: { tenantUserId: tenantUser17.id },
    data: { partageDDT: false },
  });
  const r38 = await fetchWithJar(jarP2, `${BASE_URL}/api/portail/documents`);
  const j38 = await r38.json();
  assert(
    'T38 partageDDT=false → tenant ne voit PAS Bien-archive DPE',
    r38.status === 200 && !((j38.documents ?? []).some((d: { id: string }) => d.id === archDDT.id)),
    `status=${r38.status} count=${j38.documents?.length}`,
  );

  // T39 : ACTE_VENTE jamais exposé même avec partageDDT=true (filet strict)
  // ET test direct du download : GET /api/portail/archives/<acteId> → 404.
  await prisma.locataire.update({
    where: { id: locataire17.id },
    data: { partageDDT: true },
  });
  const r39list = await fetchWithJar(jarP2, `${BASE_URL}/api/portail/documents`);
  const j39 = await r39list.json();
  const r39dl = await fetchWithJar(jarP2, `${BASE_URL}/api/portail/archives/${archActe.id}`);
  assert(
    'T39 ACTE_VENTE jamais exposé tenant (filet strict DDT) — list ne contient pas + download=404',
    r39list.status === 200
    && !((j39.documents ?? []).some((d: { id: string }) => d.id === archActe.id))
    && r39dl.status === 404,
    `list_count=${j39.documents?.length} download=${r39dl.status}`,
  );

  // T40 : migration helper Q6 — DPE en ownerType=Locataire → flip vers Bien
  // Test direct sur la lib (la logique inline du bootstrap.mjs duplique).
  const { migrateLegacyCategory } = await import('../src/lib/archive-categories.js')
    .catch(async () => await import('../src/lib/archive-categories'));
  const m1 = migrateLegacyCategory({ ownerType: 'Locataire', category: 'dpe', filename: 'dpe-2024.pdf' });
  const m2 = migrateLegacyCategory({ ownerType: 'Locataire', category: 'attestation amiante', filename: 'amiante.pdf' });
  const m3 = migrateLegacyCategory({ ownerType: 'Locataire', category: 'contrat', filename: 'bail-2024.pdf' });
  const m4 = migrateLegacyCategory({ ownerType: 'Bien', category: null, filename: 'random-doc.pdf' });
  assert(
    'T40 migrateLegacyCategory : DPE/diag Locataire → flip Bien (Q6) ; alias contrat→BAIL ; fallback AUTRE_BIEN',
    m1.category === 'DPE' && m1.newOwnerType === 'Bien'
    && m2.category === 'DIAG_AMIANTE' && m2.newOwnerType === 'Bien'
    && m3.category === 'BAIL' && m3.newOwnerType === undefined
    && m4.category === 'AUTRE_BIEN' && m4.newOwnerType === undefined,
    `m1=${JSON.stringify(m1)} m3=${JSON.stringify(m3)} m4=${JSON.stringify(m4)}`,
  );

  // Cleanup tests 34-40
  await prisma.archive.deleteMany({ where: { ownerType: 'Bien', ownerId: bien17.id } });
  if (r36archiveId) {
    await prisma.archive.deleteMany({ where: { id: r36archiveId } });
  }
  await prisma.locataire.updateMany({
    where: { tenantUserId: tenantUser17.id },
    data: { partageDDT: false },
  });

  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  await prisma.$disconnect();

  if (passed !== results.length) {
    console.error('\n✗ Certains tests d\'isolation ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tous les tests d\'isolation passent.');
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
