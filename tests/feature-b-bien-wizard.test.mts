/**
 * Tests v2.6.0 Feature B (Wizard nouveau logement) — backend Session 1.
 *
 * Lance : DATABASE_URL=... NEXTAUTH_SECRET=... PORTAIL_BASE_URL=... \
 *         npx tsx tests/feature-b-bien-wizard.test.mts
 *
 * Couvre :
 *   T41 POST /api/biens avec nouveaux champs (surface/typeBien/etage/DPE)
 *       → 200 + persisté en DB
 *   T42 POST typeBien hors whitelist (ex 'GROTTE') → 400
 *   T43 POST dpeClasse hors A-G (ex 'X') → 400
 *   T44 buildAnnonce() pure fonction : input → texte attendu
 *       (assertions sur les sections clés : header, loyer, DPE, contact)
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { buildAnnonce, type AnnonceAdresseChoice } from '../src/lib/annonce-template';

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

async function main() {
  console.log('→ Setup : 1 bailleur + 1 admin staff (featb)');
  await prisma.bailleurMembership.deleteMany({
    where: { user: { email: 'featb@wizard-test.local' } },
  });
  await prisma.user.deleteMany({ where: { email: 'featb@wizard-test.local' } });
  await prisma.bien.deleteMany({ where: { nom: { startsWith: 'WIZ_' } } });
  await prisma.bailleur.deleteMany({ where: { nom: 'WizardTest' } });

  const bailleur = await prisma.bailleur.create({
    data: { nom: 'WizardTest', adresseLigne1: '1 r', adresseLigne2: '75001 Paris', villeSignature: 'Paris' },
  });
  const pwd = await bcrypt.hash('TestPass1!', 10);
  const admin = await prisma.user.create({
    data: { email: 'featb@wizard-test.local', name: 'FeatB', password: pwd, role: 'ADMIN' },
  });
  await prisma.bailleurMembership.create({
    data: { userId: admin.id, bailleurId: bailleur.id, role: 'ADMIN' },
  });

  const jar = new Jar();
  await loginCredentials(jar, 'featb@wizard-test.local', 'TestPass1!');

  // ─── T41 : POST /api/biens nouveaux champs persistés ──────────────────
  console.log('\n→ T41 : POST /api/biens avec surface/typeBien/etage/DPE → 200 persisté');
  const r41 = await fetchWithJar(jar, `${BASE_URL}/api/biens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bailleurId: bailleur.id,
      nom: 'WIZ_T41',
      adresse: '12 rue du Test',
      codePostal: '75001',
      ville: 'Paris',
      surface: 42.5,
      typeBien: 'T2',
      etage: 3,
      dpeClasse: 'D',
      dpeKwh: 180,
      dpeGes: 28,
    }),
  });
  let r41ok = r41.status === 200;
  let r41id: string | null = null;
  if (r41ok) {
    const j41 = await r41.json();
    r41id = j41.id;
    const saved = r41id ? await prisma.bien.findUnique({ where: { id: r41id } }) : null;
    r41ok = !!saved
      && saved.surface === 42.5
      && saved.typeBien === 'T2'
      && saved.etage === 3
      && saved.dpeClasse === 'D'
      && saved.dpeKwh === 180
      && saved.dpeGes === 28;
  }
  assert(
    'T41 POST /api/biens nouveaux champs persistés (surface/typeBien/etage/DPE)',
    r41ok,
    `status=${r41.status} id=${r41id}`,
  );

  // ─── T42 : POST typeBien hors whitelist → 400 ─────────────────────────
  console.log('\n→ T42 : POST typeBien=GROTTE → 400');
  const r42 = await fetchWithJar(jar, `${BASE_URL}/api/biens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bailleurId: bailleur.id,
      nom: 'WIZ_T42',
      adresse: '13 rue du Test',
      codePostal: '75001',
      ville: 'Paris',
      typeBien: 'GROTTE',
    }),
  });
  assert(
    'T42 POST typeBien hors whitelist (GROTTE) → 400',
    r42.status === 400,
    `status=${r42.status}`,
  );

  // ─── T43 : POST dpeClasse hors A-G → 400 ──────────────────────────────
  console.log('\n→ T43 : POST dpeClasse=X → 400');
  const r43 = await fetchWithJar(jar, `${BASE_URL}/api/biens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bailleurId: bailleur.id,
      nom: 'WIZ_T43',
      adresse: '14 rue du Test',
      codePostal: '75001',
      ville: 'Paris',
      dpeClasse: 'X',
    }),
  });
  assert(
    'T43 POST dpeClasse hors A-G (X) → 400',
    r43.status === 400,
    `status=${r43.status}`,
  );

  // ─── T44 : buildAnnonce() pure fonction — sections clés présentes ─────
  console.log('\n→ T44 : buildAnnonce() rendu plain text avec sections attendues');
  const annonce = buildAnnonce({
    bien: {
      typeBien: 'T2',
      surface: 42.5,
      etage: 3,
      adresse: '12 rue du Test',
      complement: 'Bât. A',
      codePostal: '75019',
      ville: 'Paris',
      dpeClasse: 'D',
      dpeKwh: 180,
      dpeGes: 28,
    },
    equipements: {
      meuble: false,
      cuisineEquipee: true,
      laveLinge: true,
      ascenseur: true,
      balcon: true,
      parking: false,
      jardin: false,
      cave: true,
      chargesIncluses: false,
    },
    contact: {
      nomBailleur: 'SCI Beauregard',
      email: 'contact@beauregard.fr',
      telephone: '06 12 34 56 78',
    },
    finances: {
      loyerNu: 950,
      charges: 80,
      depotGarantie: 950,
    },
    disponibilite: '1er juin 2026',
  });
  // Sections à vérifier : header (T2 + 42.5 m² + Paris + CP), loyer
  // calculé (1 030 €), dépôt, équipements, DPE classe + valeurs,
  // contact (nom + email + tel), disponibilité.
  const checks = [
    ['header type', /T2.*42[,.]5\s*m².*Paris.*75019/],
    ['adresse + complément', /12 rue du Test — Bât\. A/],
    ['loyer + charges + total', /950\s*€.*\+\s*80\s*€.*=\s*1\s?030\s*€/],
    ['dépôt', /Dépôt de garantie\s*:\s*950\s*€/],
    ['caractéristiques header', /CARACTÉRISTIQUES/],
    ['étage + ascenseur', /3ème étage avec ascenseur/],
    ['cuisine équipée', /Cuisine équipée/],
    ['DPE complet', /DPE\s*:\s*classe D.*180 kWh\/m².*28 kgCO2/],
    ['non meublé', /Non meublé/],
    ['disponibilité', /DISPONIBILITÉ\s*:\s*1er juin 2026/],
    ['contact complet', /Contact\s*:\s*SCI Beauregard.*contact@beauregard\.fr.*06 12 34 56 78/],
  ] as const;
  const failed: string[] = [];
  for (const [label, re] of checks) {
    if (!re.test(annonce)) failed.push(label);
  }
  assert(
    `T44 buildAnnonce sections (${checks.length}) présentes : header/adresse/loyer/dépôt/caract/DPE/contact/dispo`,
    failed.length === 0,
    failed.length === 0
      ? `${annonce.split('\n').length} lignes, ${annonce.length} chars`
      : `manquant : ${failed.join(', ')}\n--- annonce ---\n${annonce}`,
  );

  // ─── T46 : PUT /api/biens/[id] update nouveaux fields → 200 persisté ──
  // Polish v2.6.1 : modale BienForm onglet Infos édite surface/typeBien/
  // étage/DPE. PUT route utilise bienSchema.partial() — patch subset OK.
  console.log('\n→ T46 : PUT /api/biens/[id] update surface/typeBien/DPE → 200');
  // Crée un bien minimal sans les fields polish puis update
  const r46create = await fetchWithJar(jar, `${BASE_URL}/api/biens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bailleurId: bailleur.id, nom: 'WIZ_T46', adresse: '46 rue', codePostal: '75001', ville: 'Paris',
    }),
  });
  const c46 = await r46create.json();
  const r46put = await fetchWithJar(jar, `${BASE_URL}/api/biens/${c46.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      surface: 38, typeBien: 'STUDIO', etage: 2, dpeClasse: 'C', dpeKwh: 120, dpeGes: 18,
    }),
  });
  const reloaded = r46put.status === 200
    ? await prisma.bien.findUnique({ where: { id: c46.id } })
    : null;
  const r46ok = r46put.status === 200
    && reloaded?.surface === 38
    && reloaded?.typeBien === 'STUDIO'
    && reloaded?.etage === 2
    && reloaded?.dpeClasse === 'C'
    && reloaded?.dpeKwh === 120
    && reloaded?.dpeGes === 18;
  assert(
    'T46 PUT /api/biens/[id] update partial nouveaux fields → 200 + persisté',
    r46ok,
    `put_status=${r46put.status} surface=${reloaded?.surface} typeBien=${reloaded?.typeBien}`,
  );

  // ─── T48 : PUT /api/biens/[id] avec annonceMeta JSON → persisté ──────
  console.log('\n→ T48 : PUT annonceMeta JSON → persisté en DB');
  const r48create = await fetchWithJar(jar, `${BASE_URL}/api/biens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bailleurId: bailleur.id, nom: 'WIZ_T48', adresse: '48 rue', codePostal: '75001', ville: 'Paris',
    }),
  });
  const c48 = await r48create.json();
  const meta = {
    equipements: { meuble: true, cuisineEquipee: true, laveLinge: false, ascenseur: true,
                   balcon: false, parking: false, jardin: false, cave: false, chargesIncluses: true },
    finances: { loyerNu: 800, charges: 50, depotGarantie: 800 },
    contact: { nomBailleur: 'Test', email: 't@x.com', telephone: '0612345678' },
    disponibilite: 'immédiate',
    adresseChoice: { includeAdresse: false, includeSecteur: true, secteurText: 'Belleville' },
  };
  const r48put = await fetchWithJar(jar, `${BASE_URL}/api/biens/${c48.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ annonceMeta: meta, annonceTexte: 'preview' }),
  });
  const reloaded48 = r48put.status === 200
    ? await prisma.bien.findUnique({ where: { id: c48.id } })
    : null;
  const persistedMeta = reloaded48?.annonceMeta as typeof meta | null;
  const r48ok = r48put.status === 200
    && persistedMeta != null
    && persistedMeta.equipements?.meuble === true
    && persistedMeta.finances?.loyerNu === 800
    && persistedMeta.adresseChoice?.includeSecteur === true
    && persistedMeta.adresseChoice?.secteurText === 'Belleville'
    && reloaded48?.annonceTexte === 'preview';
  assert(
    'T48 PUT annonceMeta JSON persisté en DB (équipements + finances + adresseChoice)',
    r48ok,
    `put_status=${r48put.status} hasMeta=${!!persistedMeta} loyer=${persistedMeta?.finances?.loyerNu}`,
  );

  // ─── T49 : reload Bien → annonceMeta retourné par GET ─────────────────
  console.log('\n→ T49 : GET /api/biens reload retourne annonceMeta');
  const r49 = await fetchWithJar(jar, `${BASE_URL}/api/biens?bailleurId=${bailleur.id}`);
  const list49 = await r49.json();
  const found49 = Array.isArray(list49) ? list49.find((b: { id: string }) => b.id === c48.id) : null;
  const r49ok = r49.status === 200
    && found49 != null
    && found49.annonceMeta?.equipements?.meuble === true
    && found49.annonceMeta?.adresseChoice?.secteurText === 'Belleville';
  assert(
    'T49 GET /api/biens retourne annonceMeta hydratable côté client',
    r49ok,
    `status=${r49.status} hasMeta=${!!found49?.annonceMeta} secteur=${found49?.annonceMeta?.adresseChoice?.secteurText}`,
  );

  // ─── T50 : buildAnnonce 4 combinaisons adresseChoice ──────────────────
  console.log('\n→ T50 : buildAnnonce adresseChoice — 4 combinaisons');
  const baseArgs = {
    bien: {
      typeBien: 'T2' as const,
      surface: 42, etage: 2,
      adresse: '12 rue du Test', complement: 'Bât. A',
      codePostal: '75019', ville: 'Paris',
      dpeClasse: 'D' as const, dpeKwh: 180, dpeGes: 28,
    },
    equipements: {
      meuble: false, cuisineEquipee: false, laveLinge: false, ascenseur: false,
      balcon: false, parking: false, jardin: false, cave: false, chargesIncluses: false,
    },
    contact: { nomBailleur: 'X', email: null, telephone: null },
    finances: { loyerNu: 800, charges: 50, depotGarantie: null },
    disponibilite: null,
  };
  const cAucun: AnnonceAdresseChoice = { includeAdresse: false, includeSecteur: false, secteurText: '' };
  const cAdresse: AnnonceAdresseChoice = { includeAdresse: true, includeSecteur: false, secteurText: '' };
  const cSecteur: AnnonceAdresseChoice = { includeAdresse: false, includeSecteur: true, secteurText: 'Belleville' };
  const cBoth: AnnonceAdresseChoice = { includeAdresse: true, includeSecteur: true, secteurText: 'Belleville' };
  const a1 = buildAnnonce({ ...baseArgs, adresseChoice: cAucun });
  const a2 = buildAnnonce({ ...baseArgs, adresseChoice: cAdresse });
  const a3 = buildAnnonce({ ...baseArgs, adresseChoice: cSecteur });
  const a4 = buildAnnonce({ ...baseArgs, adresseChoice: cBoth });
  const t50ok =
    !a1.includes('12 rue du Test') && !a1.includes('Secteur')
    && a2.includes('12 rue du Test') && !a2.includes('Secteur')
    && !a3.includes('12 rue du Test') && a3.includes('Secteur : Belleville')
    && a4.includes('12 rue du Test') && a4.includes('Secteur : Belleville')
    // header ville (CP) toujours présent dans les 4
    && [a1, a2, a3, a4].every(s => s.includes('Paris (75019)'));
  assert(
    'T50 buildAnnonce 4 combinaisons adresseChoice (aucun / adresse / secteur / both)',
    t50ok,
    `aucun=${!a1.includes('12 rue')} adresse=${a2.includes('12 rue')} secteur=${a3.includes('Belleville')} both=${a4.includes('Belleville')}`,
  );

  // Cleanup
  await prisma.bien.deleteMany({ where: { nom: { startsWith: 'WIZ_' } } });
  await prisma.bailleurMembership.deleteMany({
    where: { user: { email: 'featb@wizard-test.local' } },
  });
  await prisma.user.deleteMany({ where: { email: 'featb@wizard-test.local' } });
  await prisma.bailleur.deleteMany({ where: { nom: 'WizardTest' } });

  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  await prisma.$disconnect();
  if (passed !== results.length) {
    console.error('\n✗ Tests Feature B backend ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests Feature B backend passent.');
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
