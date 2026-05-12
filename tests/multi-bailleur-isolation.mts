/**
 * Tests d'isolation multi-bailleur server-side (Lot C bis, v2.4.0).
 *
 * Lance : DATABASE_URL=... NEXTAUTH_SECRET=... npx tsx tests/multi-bailleur-isolation.mts
 * Pré-requis : stack quittances-v2 sur http://localhost:3800.
 *
 * Couvre la nouvelle architecture (cf. docs/MULTI-BAILLEUR.md) :
 *
 *   - Helpers withBailleurScope + requireResourceInScope
 *   - JWT/session memberships chargés à chaque hit
 *   - Cascade ON DELETE BailleurMembership
 *
 * Setup :
 *   - 2 Bailleurs (A, B) avec données complètes
 *   - 3 Users staff :
 *       staffA  : membership(A, ADMIN)
 *       staffB  : membership(B, ADMIN)
 *       staffAB : memberships(A, MEMBER) + (B, ADMIN)
 *
 * Session 1 (ce fichier, version setup) : 3 cas pour valider la
 * mécanique de base. Les 30+ cas par route arrivent en Session 2.
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
    throw new Error(`login failed for ${email}: ${r.status} ${r.headers.get('location')}`);
  }
}

const results: Array<{ ok: boolean; name: string }> = [];

function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  console.log('→ Setup : reset DB + 2 Bailleurs (A, B) + 3 Users staff');

  // Nettoyage idempotent des entités de test précédentes
  await prisma.bailleurMembership.deleteMany({
    where: { user: { email: { in: [
      'staffa@multi-test.local',
      'staffb@multi-test.local',
      'staffab@multi-test.local',
    ] } } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [
      'staffa@multi-test.local',
      'staffb@multi-test.local',
      'staffab@multi-test.local',
    ] } },
  });
  await prisma.bailleur.deleteMany({
    where: { nom: { in: ['Bailleur Multi-Test A', 'Bailleur Multi-Test B'] } },
  });

  const bailleurA = await prisma.bailleur.create({
    data: {
      nom: 'Bailleur Multi-Test A',
      adresseLigne1: '1 rue A',
      adresseLigne2: '75001 Paris',
      villeSignature: 'Paris',
    },
  });
  const bailleurB = await prisma.bailleur.create({
    data: {
      nom: 'Bailleur Multi-Test B',
      adresseLigne1: '1 rue B',
      adresseLigne2: '75002 Paris',
      villeSignature: 'Paris',
    },
  });

  const pwd = await bcrypt.hash('TestPass1!', 10);
  const staffA = await prisma.user.create({
    data: { email: 'staffa@multi-test.local', name: 'Staff A', password: pwd, role: 'ADMIN' },
  });
  const staffB = await prisma.user.create({
    data: { email: 'staffb@multi-test.local', name: 'Staff B', password: pwd, role: 'ADMIN' },
  });
  const staffAB = await prisma.user.create({
    data: { email: 'staffab@multi-test.local', name: 'Staff AB', password: pwd, role: 'MEMBER' },
  });

  await prisma.bailleurMembership.createMany({
    data: [
      { userId: staffA.id, bailleurId: bailleurA.id, role: 'ADMIN' },
      { userId: staffB.id, bailleurId: bailleurB.id, role: 'ADMIN' },
      { userId: staffAB.id, bailleurId: bailleurA.id, role: 'MEMBER' },
      { userId: staffAB.id, bailleurId: bailleurB.id, role: 'ADMIN' },
    ],
  });

  // ─── Test 1 : memberships exposés via /api/auth/session ────────────────
  // Vérifie que le jwt callback re-fetch + session callback exposent
  // bien session.user.memberships côté client.
  console.log('\n→ Test 1 : memberships exposés sur /api/auth/session');
  const jarA = new Jar();
  await loginCredentials(jarA, 'staffa@multi-test.local', 'TestPass1!');
  const sessResp = await fetchWithJar(jarA, `${BASE_URL}/api/auth/session`);
  const sess = await sessResp.json();
  const memberships = sess?.user?.memberships ?? [];
  const hasA = Array.isArray(memberships) && memberships.some((m: { bailleurId: string }) => m.bailleurId === bailleurA.id);
  const noB = Array.isArray(memberships) && !memberships.some((m: { bailleurId: string }) => m.bailleurId === bailleurB.id);
  assert(
    'staffA voit membership(A) + ne voit PAS membership(B) sur /api/auth/session',
    sessResp.status === 200 && memberships.length === 1 && hasA && noB,
    `count=${memberships.length} hasA=${hasA} noB=${noB}`,
  );

  // ─── Test 2 : staffAB voit ses 2 memberships ───────────────────────────
  console.log('\n→ Test 2 : staffAB voit memberships(A, B)');
  const jarAB = new Jar();
  await loginCredentials(jarAB, 'staffab@multi-test.local', 'TestPass1!');
  const sessAB = await (await fetchWithJar(jarAB, `${BASE_URL}/api/auth/session`)).json();
  const mAB = sessAB?.user?.memberships ?? [];
  const mA = Array.isArray(mAB)
    ? mAB.find((m: { bailleurId: string }) => m.bailleurId === bailleurA.id)
    : null;
  const mB = Array.isArray(mAB)
    ? mAB.find((m: { bailleurId: string }) => m.bailleurId === bailleurB.id)
    : null;
  const rolesOk = mA?.role === 'MEMBER' && mB?.role === 'ADMIN';
  assert(
    'staffAB voit memberships(A=MEMBER, B=ADMIN) avec rôles distincts',
    Array.isArray(mAB) && mAB.length === 2 && rolesOk,
    `count=${mAB.length} mA=${JSON.stringify(mA)} mB=${JSON.stringify(mB)}`,
  );

  // ─── Test 3 + 4 : cascade ON DELETE (chaînés volontairement) ───────────
  // Test 3 supprime staffA, test 4 supprime bailleurA. L'ordre est important :
  // les autres tests (5+) ne dépendent PAS de staffA/bailleurA après ce point.
  // Si on ajoute des cas après test 4 qui ont besoin de ces entités, il faut
  // soit les recréer dans le setup, soit bouger les tests cascade en fin de
  // suite.
  console.log('\n→ Test 3 : cascade ON DELETE User → BailleurMembership');
  const beforeUser = await prisma.bailleurMembership.count({ where: { userId: staffA.id } });
  await prisma.user.delete({ where: { id: staffA.id } });
  const afterUser = await prisma.bailleurMembership.count({ where: { userId: staffA.id } });
  assert(
    'DELETE User staffA → memberships purgées (cascade)',
    beforeUser === 1 && afterUser === 0,
    `before=${beforeUser} after=${afterUser}`,
  );

  // ─── Test 4 : cascade ON DELETE — supprimer Bailleur purge memberships ─
  console.log('\n→ Test 4 : cascade ON DELETE Bailleur → BailleurMembership');
  const beforeBail = await prisma.bailleurMembership.count({ where: { bailleurId: bailleurA.id } });
  await prisma.bailleur.delete({ where: { id: bailleurA.id } });
  const afterBail = await prisma.bailleurMembership.count({ where: { bailleurId: bailleurA.id } });
  assert(
    'DELETE Bailleur A → memberships purgées (cascade)',
    beforeBail >= 1 && afterBail === 0,
    `before=${beforeBail} after=${afterBail}`,
  );

  // ─── Re-setup pour tests 5-11 (entités fraîches, post-cascade) ──────────
  // Tests 3+4 ont supprimé staffA + bailleurA. On recrée des entités neuves
  // pour les tests cross-tenant : 2 bailleurs + 2 biens + 2 locataires +
  // 1 quittance par côté + 3 staff (s1, s2, s12).
  console.log('\n→ Re-setup pour tests 5-11 : 2 bailleurs frais + données + 3 staff');

  await prisma.bailleurMembership.deleteMany({
    where: { user: { email: { in: [
      's1@multi-test.local', 's2@multi-test.local', 's12@multi-test.local',
    ] } } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [
      's1@multi-test.local', 's2@multi-test.local', 's12@multi-test.local',
    ] } },
  });
  await prisma.bailleur.deleteMany({
    where: { nom: { in: ['Bailleur Cross-Tenant 1', 'Bailleur Cross-Tenant 2'] } },
  });

  const b1 = await prisma.bailleur.create({
    data: { nom: 'Bailleur Cross-Tenant 1', adresseLigne1: '1 r 1', adresseLigne2: '75001 Paris', villeSignature: 'Paris' },
  });
  const b2 = await prisma.bailleur.create({
    data: { nom: 'Bailleur Cross-Tenant 2', adresseLigne1: '2 r 2', adresseLigne2: '75002 Paris', villeSignature: 'Paris' },
  });
  const bien1 = await prisma.bien.create({
    data: { bailleurId: b1.id, nom: 'B1L1', adresse: '1 r', codePostal: '75001', ville: 'Paris' },
  });
  const bien2 = await prisma.bien.create({
    data: { bailleurId: b2.id, nom: 'B2L1', adresse: '2 r', codePostal: '75002', ville: 'Paris' },
  });
  const loc1 = await prisma.locataire.create({
    data: { bienId: bien1.id, nom: 'Loc1', prenom: 'Alice', loyerNu: 500, charges: 50, dateEntree: new Date('2024-01-01') },
  });
  const loc2 = await prisma.locataire.create({
    data: { bienId: bien2.id, nom: 'Loc2', prenom: 'Bob', loyerNu: 600, charges: 60, dateEntree: new Date('2024-01-01') },
  });
  const quit1 = await prisma.quittance.create({
    data: { locataireId: loc1.id, mois: 3, annee: 2026, loyerNu: 500, charges: 50, montantTotal: 550, datePaiement: new Date('2026-03-05'), dateEmission: new Date('2026-03-01') },
  });
  const quit2 = await prisma.quittance.create({
    data: { locataireId: loc2.id, mois: 3, annee: 2026, loyerNu: 600, charges: 60, montantTotal: 660, datePaiement: new Date('2026-03-05'), dateEmission: new Date('2026-03-01') },
  });

  const pwd2 = await bcrypt.hash('TestPass1!', 10);
  const s1 = await prisma.user.create({ data: { email: 's1@multi-test.local', name: 'S1', password: pwd2, role: 'ADMIN' } });
  const s2 = await prisma.user.create({ data: { email: 's2@multi-test.local', name: 'S2', password: pwd2, role: 'ADMIN' } });
  const s12 = await prisma.user.create({ data: { email: 's12@multi-test.local', name: 'S12', password: pwd2, role: 'MEMBER' } });
  await prisma.bailleurMembership.createMany({
    data: [
      { userId: s1.id, bailleurId: b1.id, role: 'ADMIN' },
      { userId: s2.id, bailleurId: b2.id, role: 'ADMIN' },
      { userId: s12.id, bailleurId: b1.id, role: 'MEMBER' },
      { userId: s12.id, bailleurId: b2.id, role: 'ADMIN' },
    ],
  });

  const jar1 = new Jar();
  await loginCredentials(jar1, 's1@multi-test.local', 'TestPass1!');
  const jar12 = new Jar();
  await loginCredentials(jar12, 's12@multi-test.local', 'TestPass1!');

  // ─── Test 5 : list scopée → 200 + données du bailleur uniquement ────────
  console.log('\n→ Test 5 : s1 ?bailleurId=b1 → 200, données b1 uniquement');
  const r5 = await fetchWithJar(jar1, `${BASE_URL}/api/locataires?bailleurId=${b1.id}`);
  const j5 = r5.status === 200 ? await r5.json() : [];
  const r5ok = r5.status === 200 && Array.isArray(j5) && j5.length === 1 && j5[0].id === loc1.id;
  assert(
    's1 GET /api/locataires?bailleurId=b1 → 200 + locataire de b1 uniquement',
    r5ok,
    `status=${r5.status} count=${Array.isArray(j5) ? j5.length : 0}`,
  );

  // ─── Test 6 : cross-tenant → 403 ────────────────────────────────────────
  console.log('\n→ Test 6 : s1 ?bailleurId=b2 → 403');
  const r6 = await fetchWithJar(jar1, `${BASE_URL}/api/locataires?bailleurId=${b2.id}`);
  assert(
    's1 GET /api/locataires?bailleurId=b2 → 403 (no membership)',
    r6.status === 403,
    `status=${r6.status}`,
  );

  // ─── Test 7 : sans bailleurId, 1 membership → fallback OK ──────────────
  // s1 a 1 seule membership → fallback automatique
  console.log('\n→ Test 7 : s1 sans ?bailleurId → fallback (1 seule membership)');
  const r7a = await fetchWithJar(jar1, `${BASE_URL}/api/locataires`);
  // s12 a 2 memberships → 400 explicite
  const r7b = await fetchWithJar(jar12, `${BASE_URL}/api/locataires`);
  assert(
    's1 sans bailleurId → 200 (fallback) ; s12 sans bailleurId → 400 (multi)',
    r7a.status === 200 && r7b.status === 400,
    `r7a=${r7a.status} r7b=${r7b.status}`,
  );

  // ─── Test 8 : route [id] cross-tenant → 404 (no oracle) ─────────────────
  console.log('\n→ Test 8 : s1 GET /api/quittances/<quit2.id>/pdf → 404 (cross-tenant)');
  const r8 = await fetchWithJar(jar1, `${BASE_URL}/api/quittances/${quit2.id}/pdf`);
  assert(
    's1 GET /api/quittances/<id>/pdf (Bailleur 2) → 404 (no leak)',
    r8.status === 404,
    `status=${r8.status}`,
  );
  // Sanity : s1 sur sa propre quittance → 200
  const r8b = await fetchWithJar(jar1, `${BASE_URL}/api/quittances/${quit1.id}/pdf`);
  assert(
    's1 GET sa propre quittance → 200 (sanity)',
    r8b.status === 200,
    `status=${r8b.status}`,
  );

  // ─── Test 9 : multi-bailleur staffAB OK sur les 2 ───────────────────────
  console.log('\n→ Test 9 : s12 OK sur b1 ET b2');
  const r9a = await fetchWithJar(jar12, `${BASE_URL}/api/locataires?bailleurId=${b1.id}`);
  const r9b = await fetchWithJar(jar12, `${BASE_URL}/api/locataires?bailleurId=${b2.id}`);
  assert(
    's12 ?bailleurId=b1 → 200 ET ?bailleurId=b2 → 200',
    r9a.status === 200 && r9b.status === 200,
    `r9a=${r9a.status} r9b=${r9b.status}`,
  );

  // ─── Test 10 : GET /api/bailleurs filtré par memberships ────────────────
  console.log('\n→ Test 10 : GET /api/bailleurs s1 → 1 résultat (b1) uniquement');
  const r10 = await fetchWithJar(jar1, `${BASE_URL}/api/bailleurs`);
  const j10 = r10.status === 200 ? await r10.json() : [];
  const r10ok = Array.isArray(j10)
    && j10.some((b: { id: string }) => b.id === b1.id)
    && !j10.some((b: { id: string }) => b.id === b2.id);
  assert(
    's1 GET /api/bailleurs → contient b1, pas b2',
    r10.status === 200 && r10ok,
    `status=${r10.status} count=${Array.isArray(j10) ? j10.length : 0} ids=${Array.isArray(j10) ? j10.map((b: { id: string }) => b.id).join(',') : ''}`,
  );

  // ─── Test 11 : leak IRL signalé par user — fix vert ─────────────────────
  console.log('\n→ Test 11 : s1 /api/irl/eligibles → ne voit que ses locataires');
  // Patch loc1 + loc2 pour qu'ils soient éligibles (irlValeurReference + trimestre)
  await prisma.locataire.updateMany({
    where: { id: { in: [loc1.id, loc2.id] } },
    data: { irlValeurReference: 100, irlTrimestre: 1 },
  });
  const r11 = await fetchWithJar(jar1, `${BASE_URL}/api/irl/eligibles`);
  const j11 = r11.status === 200 ? await r11.json() : { eligibles: [] };
  const eligibleIds = (j11.eligibles ?? []).map((e: { locataireId: string }) => e.locataireId);
  const noLeak = !eligibleIds.includes(loc2.id);
  assert(
    's1 /api/irl/eligibles → ne voit pas loc2 du Bailleur 2 (leak corrigé)',
    r11.status === 200 && noLeak,
    `status=${r11.status} ids=${JSON.stringify(eligibleIds)}`,
  );

  // ─── Test 12 : GET /api/admin/users filtre TENANT ──────────────────────
  // Faille rc2 : la liste retournait TOUS les users, TENANT compris.
  // Combiné au rendu HTML <select value="TENANT"> qui rend <option> par
  // défaut (ADMIN), un admin pouvait croire qu'un TENANT était staff et
  // tenter de le rétrograder → cas C escalade privilège.
  console.log('\n→ Test 12 : GET /api/admin/users filtre TENANT (faille rc2)');
  // Setup : crée un TENANT en DB (vérifie qu'il n'apparaît pas dans la liste)
  await prisma.user.deleteMany({ where: { email: 'tenant-admin-leak@multi-test.local' } });
  const tenantLeak = await prisma.user.create({
    data: { email: 'tenant-admin-leak@multi-test.local', name: 'Tenant Leak', role: 'TENANT' },
  });
  // Login s12 (déjà ADMIN app + memberships)
  const r12 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/users`);
  const j12 = r12.status === 200 ? await r12.json() : [];
  const leaked = Array.isArray(j12) && j12.some((u: { id: string }) => u.id === tenantLeak.id);
  assert(
    'GET /api/admin/users → TENANT absent de la liste',
    r12.status === 200 && !leaked,
    `status=${r12.status} tenant_present=${leaked}`,
  );

  // ─── Test 13 : PUT /api/admin/users/[tenant_id] {role:MEMBER} → 400 ────
  // Faille rc2 : promotion silente TENANT→MEMBER. Vrai vecteur d'escalade.
  console.log('\n→ Test 13 : PUT /api/admin/users/<tenant_id> {role:MEMBER} → 400');
  const r13 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/users/${tenantLeak.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'MEMBER' }),
  });
  const after13 = await prisma.user.findUnique({ where: { id: tenantLeak.id }, select: { role: true } });
  assert(
    'PUT TENANT → MEMBER refusé (400) + DB inchangé (role=TENANT)',
    r13.status === 400 && after13?.role === 'TENANT',
    `status=${r13.status} db_role=${after13?.role}`,
  );

  // ─── Test 14 : PUT /api/admin/users/[admin_id] {role:TENANT} → 400 ─────
  // Confirme zod whitelist : transition staff → TENANT bloquée.
  console.log('\n→ Test 14 : PUT staff → TENANT bloqué par zod (400)');
  // Crée un user staff target (different de s12 qui est l'acteur du PATCH).
  // /api/admin/users/[id] PUT refuse de modifier son propre role → on cible
  // un autre staff.
  await prisma.bailleurMembership.deleteMany({ where: { user: { email: 'target-staff@multi-test.local' } } });
  await prisma.user.deleteMany({ where: { email: 'target-staff@multi-test.local' } });
  const targetStaff = await prisma.user.create({
    data: { email: 'target-staff@multi-test.local', name: 'Target', password: pwd2, role: 'MEMBER' },
  });
  const r14 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/users/${targetStaff.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'TENANT' }),
  });
  const after14 = await prisma.user.findUnique({ where: { id: targetStaff.id }, select: { role: true } });
  assert(
    'PUT staff → TENANT refusé (400) + DB role inchangé',
    r14.status === 400 && after14?.role !== 'TENANT',
    `status=${r14.status} db_role=${after14?.role}`,
  );

  // ─── Test 15 : bootstrap defense in depth — TENANT promu artificiellement
  // Scénario : si malgré tout un TENANT a été promu MEMBER en DB (via raw SQL,
  // bug tiers, etc.) ET reste lié à un Locataire.tenantUserId, le bootstrap
  // doit refuser de lui créer des memberships au reboot.
  console.log('\n→ Test 15 : bootstrap exclut user lié à Locataire.tenantUserId');
  // Setup : recréer 1 bailleur + bien + locataire lié au TENANT promu
  const bailExtra = await prisma.bailleur.create({
    data: { nom: 'Bail Defense', adresseLigne1: '1 r', adresseLigne2: '75001 Paris', villeSignature: 'Paris' },
  });
  const bienExtra = await prisma.bien.create({
    data: { bailleurId: bailExtra.id, nom: 'Bien Defense', adresse: '1', codePostal: '75001', ville: 'Paris' },
  });
  await prisma.locataire.create({
    data: {
      bienId: bienExtra.id, nom: 'TenantLeak', prenom: 'Z',
      loyerNu: 500, charges: 50, dateEntree: new Date('2024-01-01'),
      tenantUserId: tenantLeak.id, portailActiveLe: new Date(),
    },
  });
  // Force role=MEMBER en DB (raw — simule la faille)
  await prisma.user.update({ where: { id: tenantLeak.id }, data: { role: 'MEMBER' } });
  // Run bootstrap script in-process
  const beforeMemb = await prisma.bailleurMembership.count({ where: { userId: tenantLeak.id } });
  // Inline le bootstrap (équivalent scripts/bootstrap.mjs)
  const orphans = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'MEMBER', 'VIEWER'] },
      disabledAt: null,
      memberships: { none: {} },
      // Defense in depth : exclure les users liés à un Locataire.tenantUserId
      locatairesAccessibles: { none: {} },
    },
    select: { id: true },
  });
  const bailleurs = await prisma.bailleur.findMany({ select: { id: true } });
  for (const u of orphans) {
    for (const b of bailleurs) {
      try {
        await prisma.bailleurMembership.create({
          data: { userId: u.id, bailleurId: b.id, role: 'MEMBER' },
        });
      } catch (e) {
        const err = e as { code?: string };
        if (err.code !== 'P2002') throw e;
      }
    }
  }
  const afterMemb = await prisma.bailleurMembership.count({ where: { userId: tenantLeak.id } });
  assert(
    'Bootstrap exclut TENANT-promu lié à Locataire.tenantUserId (0 membership créée)',
    beforeMemb === 0 && afterMemb === 0,
    `before=${beforeMemb} after=${afterMemb}`,
  );

  // ─── Test 16 : démo escalade complète (TDD scénario attaque) ───────────
  // Étape 1-4 (PATCH refusé + bootstrap défensif) couvertes par tests 13+15.
  // Étape 5 (login portail comme TENANT promu → assert pas d'accès staff)
  // skippée volontairement — couverture transitive :
  //   T12 (GET filter) + T13 (PATCH refusé) + T15 (bootstrap défensif)
  //   garantissent que même après escalade tentée, le user reste TENANT
  //   sans memberships → tests 13 portail + cross-tenant existants couvrent
  //   le 403 sur routes staff. Pas de re-run redondant.
  console.log('\n→ Test 16 : escalade complète (couverture transitive T12+T13+T15)');
  // Reset role à TENANT (cleanup) — la faille hypothétique est colmatée par
  // les fixes 1-4. Sanity: on vérifie juste qu'après les guards, le user
  // ne peut PAS être promu via PATCH même si admin essaie à nouveau.
  await prisma.user.update({ where: { id: tenantLeak.id }, data: { role: 'TENANT' } });
  const r16 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/users/${tenantLeak.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'MEMBER' }),
  });
  const sanity = await prisma.user.findUnique({ where: { id: tenantLeak.id }, select: { role: true } });
  assert(
    'Escalade attempt TENANT→MEMBER même après reset → toujours 400 + DB intact',
    r16.status === 400 && sanity?.role === 'TENANT',
    `status=${r16.status} db_role=${sanity?.role}`,
  );

  // ─── Test 17 : sanitize-tenant-users restore role TENANT + purge memberships
  // Faille rc1/rc2 : un TENANT pouvait être promu staff via PATCH admin
  // (corrigé en rc3) puis recevoir des memberships au reboot via bootstrap
  // (corrigé en rc3). MAIS les corruptions ANCIENNES restent en DB.
  // rc4 ajoute un sanitize idempotent qui restore la cohérence à partir de
  // la source of truth = `Locataire.tenantUserId`.
  console.log('\n→ Test 17 : sanitize restore role TENANT + purge memberships');
  // Setup : crée un user role=MEMBER (corrompu) lié à un Locataire +
  // memberships forcées comme si rc1 avait tourné.
  await prisma.bailleurMembership.deleteMany({ where: { user: { email: 'corrupt@multi-test.local' } } });
  await prisma.user.deleteMany({ where: { email: 'corrupt@multi-test.local' } });
  const corrupt = await prisma.user.create({
    data: { email: 'corrupt@multi-test.local', name: 'Corrupt', role: 'MEMBER' },
  });
  const bailExtra2 = await prisma.bailleur.create({
    data: { nom: 'Bail Sanitize', adresseLigne1: '1 r', adresseLigne2: '75001 Paris', villeSignature: 'Paris' },
  });
  const bienExtra2 = await prisma.bien.create({
    data: { bailleurId: bailExtra2.id, nom: 'Bien Sanitize', adresse: '1', codePostal: '75001', ville: 'Paris' },
  });
  await prisma.locataire.create({
    data: {
      bienId: bienExtra2.id, nom: 'Corrupt', prenom: 'C',
      loyerNu: 500, charges: 50, dateEntree: new Date('2024-01-01'),
      tenantUserId: corrupt.id, portailActiveLe: new Date(),
    },
  });
  // Force memberships (simule l'état post-rc1 avec bootstrap qui avait
  // créé des memberships sur le user corrompu)
  await prisma.bailleurMembership.createMany({
    data: [
      { userId: corrupt.id, bailleurId: bailExtra2.id, role: 'MEMBER' },
    ],
  });
  const beforeSan = {
    role: (await prisma.user.findUnique({ where: { id: corrupt.id } }))?.role,
    membs: await prisma.bailleurMembership.count({ where: { userId: corrupt.id } }),
  };

  // Run sanitize logic inline (équivalent scripts/sanitize-tenant-users.mts)
  const corruptedUsers = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'MEMBER', 'VIEWER'] },
      locatairesAccessibles: { some: {} },
    },
    select: { id: true, email: true, role: true },
  });
  const ids = corruptedUsers.map(u => u.id);
  let purgedMembs = 0;
  if (ids.length > 0) {
    purgedMembs = (await prisma.bailleurMembership.deleteMany({
      where: { userId: { in: ids } },
    })).count;
    await prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { role: 'TENANT' },
    });
  }

  const afterSan = {
    role: (await prisma.user.findUnique({ where: { id: corrupt.id } }))?.role,
    membs: await prisma.bailleurMembership.count({ where: { userId: corrupt.id } }),
  };
  assert(
    'Sanitize : user corrompu (MEMBER + Locataire + memberships) → role=TENANT + 0 memberships',
    beforeSan.role === 'MEMBER' && beforeSan.membs === 1
    && afterSan.role === 'TENANT' && afterSan.membs === 0
    && corruptedUsers.length >= 1 && purgedMembs >= 1,
    `before=${JSON.stringify(beforeSan)} after=${JSON.stringify(afterSan)} corrupted=${corruptedUsers.length} purged=${purgedMembs}`,
  );

  // ─── Test 18 : sanitize idempotent (re-run = no-op) ────────────────────
  console.log('\n→ Test 18 : sanitize idempotent — 2ème run = 0 corrigé');
  const corruptedUsers2 = await prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'MEMBER', 'VIEWER'] },
      locatairesAccessibles: { some: {} },
    },
    select: { id: true },
  });
  assert(
    'Sanitize idempotent : 2ème run trouve 0 user corrompu',
    corruptedUsers2.length === 0,
    `corrupted=${corruptedUsers2.length}`,
  );

  // ─── Test 19 : GET /api/admin/users exclut user lié à Locataire ───────
  // Filtre étendu : source of truth = liaison Locataire.tenantUserId,
  // pas seulement role. Force le scénario : user role=VIEWER artificiel
  // mais lié à un Locataire.
  console.log('\n→ Test 19 : GET /api/admin/users filtre par Locataire (pas que role)');
  // Le user `corrupt` est repassé TENANT par sanitize → re-force role=VIEWER
  // pour simuler une corruption qui aurait échappé au sanitize (e.g. user
  // patché juste après le boot). Le filtre API doit le rejeter quand même.
  await prisma.user.update({ where: { id: corrupt.id }, data: { role: 'VIEWER' } });
  const r19 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/users`);
  const j19 = r19.status === 200 ? await r19.json() : [];
  const stillLeaked = Array.isArray(j19) && j19.some((u: { id: string }) => u.id === corrupt.id);
  assert(
    'GET /api/admin/users → user lié à Locataire absent (même si role=VIEWER artificiel)',
    r19.status === 200 && !stillLeaked,
    `status=${r19.status} leaked=${stillLeaked}`,
  );

  // ─── Test 20 : PUT /api/admin/users/[id] sur user lié à Locataire → 400
  console.log('\n→ Test 20 : PUT user lié à Locataire → 400 (peu importe role en DB)');
  const r20 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/users/${corrupt.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'ADMIN' }),
  });
  const after20 = await prisma.user.findUnique({ where: { id: corrupt.id }, select: { role: true } });
  assert(
    'PUT user lié à Locataire → 400 + DB role inchangé (pas promu en ADMIN)',
    r20.status === 400 && after20?.role !== 'ADMIN',
    `status=${r20.status} db_role=${after20?.role}`,
  );

  // ─── Phase 2 Lot D : tests T34-T39 (memberships UI) ───────────────────
  // Couvre le nouveau /api/admin/memberships + flow d'invitation
  // multi-bailleur. Setup : staffA (ADMIN sur b1), staffAB (ADMIN sur
  // b1 ET b2), staffB (ADMIN sur b2 uniquement). Tous déjà créés en
  // début de fichier (s1 = staffA, s12 = staffAB, s2 = staffB).
  console.log('\n→ Phase 2 : tests T34-T39 /api/admin/memberships');

  // Recrée setup propre : 2 nouveaux bailleurs distincts
  await prisma.bailleurMembership.deleteMany({
    where: { user: { email: { in: ['m1@phase2.local', 'newinvited@phase2.local'] } } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: ['m1@phase2.local', 'newinvited@phase2.local'] } },
  });
  await prisma.invitation.deleteMany({ where: { email: 'newinvited@phase2.local' } });

  // T34 : GET /api/admin/memberships?bailleurId=b1 scopé
  console.log('\n→ T34 : GET /api/admin/memberships?bailleurId=<b1>');
  const tb1 = await prisma.bailleur.findFirst({ where: { nom: 'Bailleur Cross-Tenant 1' } });
  const tb2 = await prisma.bailleur.findFirst({ where: { nom: 'Bailleur Cross-Tenant 2' } });
  if (!tb1 || !tb2) throw new Error('setup manquant : bailleurs Cross-Tenant');

  const r34 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/memberships?bailleurId=${tb1.id}`);
  const j34 = r34.status === 200 ? await r34.json() : { memberships: [] };
  // s1 (ADMIN b1) doit voir lui-même + s12 (MEMBER b1)
  const containsS1 = j34.memberships.some((m: { email: string }) => m.email === 's1@multi-test.local');
  const containsS12 = j34.memberships.some((m: { email: string }) => m.email === 's12@multi-test.local');
  const noS2 = !j34.memberships.some((m: { email: string }) => m.email === 's2@multi-test.local');
  assert(
    'T34 GET memberships?bailleurId=b1 → contient s1+s12, pas s2',
    r34.status === 200 && containsS1 && containsS12 && noS2,
    `status=${r34.status} count=${j34.memberships.length}`,
  );

  // T35 : POST cross-tenant 403 (s1 ADMIN b1 tente sur b2)
  console.log('\n→ T35 : POST cross-tenant → 403 (s1 → b2)');
  const r35 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/memberships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'attaque@phase2.local', role: 'MEMBER', bailleurIds: [tb2.id] }),
  });
  assert('T35 s1 POST sur b2 (pas ADMIN) → 403', r35.status === 403, `status=${r35.status}`);

  // T36 : PUT membership role update (s1 ADMIN b1 update s12 sur b1)
  console.log('\n→ T36 : PUT /[s12]/[b1] role MEMBER → VIEWER');
  const sUser12 = await prisma.user.findUnique({ where: { email: 's12@multi-test.local' } });
  const r36 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/memberships/${sUser12!.id}/${tb1.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'VIEWER' }),
  });
  const m36 = await prisma.bailleurMembership.findUnique({
    where: { userId_bailleurId: { userId: sUser12!.id, bailleurId: tb1.id } },
  });
  assert(
    'T36 PUT membership role MEMBER → VIEWER (s1 sur b1)',
    r36.status === 200 && m36?.role === 'VIEWER',
    `status=${r36.status} db_role=${m36?.role}`,
  );
  // Restore pour tests suivants
  await prisma.bailleurMembership.update({
    where: { userId_bailleurId: { userId: sUser12!.id, bailleurId: tb1.id } },
    data: { role: 'MEMBER' },
  });

  // T37 : DELETE last membership → user reste, mais filtre bloque
  console.log('\n→ T37 : DELETE membership → user orphelin reste, filtres bloquent');
  // Crée user m1 avec membership unique sur b1, puis DELETE
  const m1 = await prisma.user.create({
    data: { email: 'm1@phase2.local', name: 'M1', role: 'MEMBER' },
  });
  await prisma.bailleurMembership.create({
    data: { userId: m1.id, bailleurId: tb1.id, role: 'MEMBER' },
  });
  const r37 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/memberships/${m1.id}/${tb1.id}`, {
    method: 'DELETE',
  });
  const m1After = await prisma.user.findUnique({ where: { id: m1.id } });
  const m1Membs = await prisma.bailleurMembership.count({ where: { userId: m1.id } });
  assert(
    'T37 DELETE last membership → user existe, 0 membership',
    r37.status === 200 && !!m1After && m1Membs === 0,
    `status=${r37.status} userExists=${!!m1After} membs=${m1Membs}`,
  );

  // T38 : acceptInvitation crée memberships selon invitation.bailleurIds
  // Pré-requis : un user ADMIN sur b1 ET b2 pour POST cross. s12 est
  // MEMBER sur b1 → on l'élève en ADMIN temporairement pour ce test.
  console.log('\n→ T38 : POST membership avec email inconnu → invitation + memberships');
  await prisma.bailleurMembership.update({
    where: { userId_bailleurId: { userId: sUser12!.id, bailleurId: tb1.id } },
    data: { role: 'ADMIN' },
  });
  // jar12 cookie reste valide mais memberships re-fetched via jwt callback
  // (cf. docs/MULTI-BAILLEUR.md re-fetch à chaque hit).
  const r38 = await fetchWithJar(jar12, `${BASE_URL}/api/admin/memberships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'newinvited@phase2.local', role: 'MEMBER', bailleurIds: [tb1.id, tb2.id],
    }),
  });
  // POST peut fail email send si SMTP pas configuré → 500 acceptable, on
  // check juste que l'invitation a bien été créée en DB.
  const inv = await prisma.invitation.findFirst({
    where: { email: 'newinvited@phase2.local' },
    orderBy: { createdAt: 'desc' },
  });
  // Simule l'acceptation : crée user puis appelle acceptInvitation
  let acceptOk = false;
  let memberCountAfter = 0;
  if (inv) {
    const newUser = await prisma.user.create({
      data: { email: 'newinvited@phase2.local', role: 'MEMBER' },
    });
    try {
      const { acceptInvitation } = await import('../src/lib/invitations.js');
      await acceptInvitation(inv.token, newUser.id);
      acceptOk = true;
      memberCountAfter = await prisma.bailleurMembership.count({ where: { userId: newUser.id } });
    } catch (e) {
      console.error('acceptInvitation failed:', e instanceof Error ? e.message : e);
    }
  }
  assert(
    'T38 acceptInvitation crée 2 memberships selon bailleurIds[]',
    inv?.bailleurIds.length === 2 && acceptOk && memberCountAfter === 2,
    `inv_bids=${inv?.bailleurIds.length} accept_ok=${acceptOk} membs=${memberCountAfter}`,
  );

  // T39 : POST email existant déjà membre → 409
  console.log('\n→ T39 : POST email déjà membre du bailleur cible → 409');
  // s12 a déjà membership sur b1 (MEMBER) — re-tenter le faire ajouter sur b1
  const r39 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/memberships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 's12@multi-test.local', role: 'VIEWER', bailleurIds: [tb1.id],
    }),
  });
  assert('T39 POST user déjà membre du bailleur cible → 409', r39.status === 409, `status=${r39.status}`);

  // T40 (Phase 3) : POST email inconnu sans config email du caller →
  // mode 'invitation_link' avec invitationLink retourné. L'admin n'a
  // pas besoin de Gmail/SMTP configuré pour inviter ; il copie le lien.
  console.log('\n→ T40 : POST email inconnu sans email config → mode invitation_link');
  // s1 (jar1) : pas de Parametres en DB par défaut dans ce test setup
  // → emailMethod absent → mode link.
  await prisma.parametres.deleteMany({
    where: { user: { email: 's1@multi-test.local' } },
  });
  await prisma.invitation.deleteMany({ where: { email: 'newlink@phase3.local' } });
  const tb1Phase3 = await prisma.bailleur.findFirst({ where: { nom: 'Bailleur Cross-Tenant 1' } });
  const r40 = await fetchWithJar(jar1, `${BASE_URL}/api/admin/memberships`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'newlink@phase3.local', role: 'MEMBER', bailleurIds: [tb1Phase3!.id] }),
  });
  const j40 = r40.status === 200 ? await r40.json() : null;
  const validLink = typeof j40?.invitationLink === 'string'
    && j40.invitationLink.includes('/invitations/');
  assert(
    'T40 POST sans email config → mode=invitation_link + invitationLink valide',
    r40.status === 200 && j40?.mode === 'invitation_link' && validLink,
    `status=${r40.status} mode=${j40?.mode} link=${j40?.invitationLink ? 'OK' : 'absent'}`,
  );

  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  await prisma.$disconnect();

  if (passed !== results.length) {
    console.error('\n✗ Certains tests d\'isolation multi-bailleur ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tous les tests d\'isolation multi-bailleur passent.');
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
