/**
 * Capture automatique des screenshots du README via Playwright.
 *
 * Pré-requis : la stack `quittances-v2` tourne sur http://localhost:3800
 * avec la DB vide (cf. docker-compose -p quittances-v2 -f .../docker-compose.v2.yml).
 *
 * Lance : npx tsx scripts/screenshots.mts
 *
 * Le script :
 *  1. Crée un compte ADMIN factice avec données de démo
 *  2. Configure un bailleur, un bien, un locataire indexé IRL
 *  3. Génère une quittance + un courrier IRL pour avoir du contenu
 *  4. Capture chaque page clé en 1600×1000 (desktop) et 375×800 (mobile)
 */

import { chromium, type Browser, type Page } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = 'http://localhost:3800';
const OUT_DIR = path.resolve('docs/screenshots');
const VIEWPORT_DESKTOP = { width: 1600, height: 1000 };
const VIEWPORT_MOBILE = { width: 375, height: 812 };

interface SeedResult {
  email: string;
  password: string;
  bailleurId: string;
  bienId: string;
  locataireId: string;
}

// Mini cookie-jar : préserve tous les cookies entre les fetches du seed.
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

async function seedDemoData(): Promise<SeedResult> {
  const password = 'DemoPass1234!';
  const email = `demo-${Date.now()}@quittances.local`;
  const jar = new Jar();

  const fetchWithJar = async (url: string, init: RequestInit = {}) => {
    const r = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Cookie: jar.header() },
      redirect: 'manual',
    });
    jar.ingest(r.headers.getSetCookie?.() ?? []);
    return r;
  };

  // Register
  const reg = await fetchWithJar(`${BASE_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Marie Dupont', email, password }),
  });
  const regJson = await reg.json();
  if (!reg.ok) throw new Error('register: ' + JSON.stringify(regJson));

  // Login : GET csrf (set le cookie), puis POST credentials avec le même cookie
  const csrfResp = await fetchWithJar(`${BASE_URL}/api/auth/csrf`);
  const csrf = await csrfResp.json();
  const login = await fetchWithJar(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password, csrfToken: csrf.csrfToken }).toString(),
  });
  if (login.status !== 302 || (login.headers.get('location') ?? '').includes('error=')) {
    throw new Error('login failed: ' + login.status + ' → ' + login.headers.get('location'));
  }

  const authFetch = (url: string, init: RequestInit = {}) =>
    fetchWithJar(url, {
      ...init,
      headers: { ...(init.headers ?? {}), 'Content-Type': 'application/json' },
    });

  // Bailleur (sans logo/signature pour cette démo, mais avec couleur charte)
  const bailleur = await authFetch(`${BASE_URL}/api/bailleurs`, {
    method: 'POST',
    body: JSON.stringify({
      nom: 'SCI Beauregard',
      rcs: '948 553 271 RCS Paris',
      adresseLigne1: '12 rue des Tilleuls',
      adresseLigne2: '75019 Paris',
      villeSignature: 'Paris',
      pdfCouleur: '#1a3a5c',
      pdfPolice: 'Helvetica',
      actif: true,
    }),
  }).then(r => r.json());

  const bien = await authFetch(`${BASE_URL}/api/biens`, {
    method: 'POST',
    body: JSON.stringify({
      bailleurId: bailleur.id,
      nom: 'Studio Belleville',
      adresse: '47 boulevard de la Villette',
      codePostal: '75019',
      ville: 'Paris',
      complement: '4ème étage, lot 12',
      actif: true,
    }),
  }).then(r => r.json());

  const locataire = await authFetch(`${BASE_URL}/api/locataires`, {
    method: 'POST',
    body: JSON.stringify({
      bienId: bien.id,
      nom: 'Lefèvre',
      prenom: 'Camille',
      email: 'camille.lefevre@example.fr',
      telephone: '06 12 34 56 78',
      loyerNu: 950,
      charges: 80,
      montantDepotGarantie: 950,
      irlTrimestre: 1,
      irlValeurReference: 145.47,
      dateEntree: '2024-09-01',
      actif: true,
    }),
  }).then(r => r.json());

  // Saisie IRL manuelle pour avoir des données dans la liste
  for (const ind of [
    { annee: 2024, trimestre: 1, valeur: 143.46, variation: 3.5 },
    { annee: 2024, trimestre: 4, valeur: 144.64, variation: 1.93 },
    { annee: 2025, trimestre: 1, valeur: 145.47, variation: 1.40 },
    { annee: 2025, trimestre: 4, valeur: 145.78, variation: 0.79 },
    { annee: 2026, trimestre: 1, valeur: 146.60, variation: 0.78 },
  ]) {
    await authFetch(`${BASE_URL}/api/irl/indices`, {
      method: 'POST',
      body: JSON.stringify(ind),
    });
  }

  // Une révision IRL appliquée pour avoir un historique
  await authFetch(`${BASE_URL}/api/irl/revisions`, {
    method: 'POST',
    body: JSON.stringify({
      locataireId: locataire.id,
      irlNouveau: 146.60,
      trimestre: 1,
      dateEffet: '2025-09-01',
      apply: true,
    }),
  });

  // Quittances pour 3 derniers mois
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    await authFetch(`${BASE_URL}/api/quittances/generer-mois`, {
      method: 'POST',
      body: JSON.stringify({
        bailleurId: bailleur.id,
        mois: d.getMonth() + 1,
        annee: d.getFullYear(),
        datePaiement: new Date(d.getFullYear(), d.getMonth(), 5).toISOString().slice(0, 10),
        dateEmission: d.toISOString().slice(0, 10),
      }),
    });
  }

  return { email, password, bailleurId: bailleur.id, bienId: bien.id, locataireId: locataire.id };
}

async function loginUI(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 });
}

async function shoot(page: Page, name: string) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`✓ ${name}`);
}

async function captureDesktop(browser: Browser, seed: SeedResult) {
  const ctx = await browser.newContext({ viewport: VIEWPORT_DESKTOP });
  const page = await ctx.newPage();
  await loginUI(page, seed.email, seed.password);

  // 01 Dashboard
  await page.waitForLoadState('networkidle');
  await shoot(page, '01-dashboard.png');

  // 04 IRL
  await page.goto(`${BASE_URL}/parametres/irl`);
  await page.waitForLoadState('networkidle');
  // Attendre que la sync auto se lance et que les indices soient affichés
  await page.waitForTimeout(2000);
  await shoot(page, '04-irl-revisions.png');

  // 05 Audit log
  await page.goto(`${BASE_URL}/parametres/journal`);
  await page.waitForLoadState('networkidle');
  await shoot(page, '05-audit-log.png');

  // 07 Documents
  await page.goto(`${BASE_URL}/documents`);
  await page.waitForLoadState('networkidle');
  await shoot(page, '07-documents.png');

  // 02 Quittance PDF — on utilise la modale d'aperçu sur Documents
  // (clique sur 'Avis d'échéance' du locataire affiché)
  const avisBtn = page.locator('button', { hasText: "Avis d'échéance" }).first();
  if (await avisBtn.count()) {
    await avisBtn.click();
    await page.waitForTimeout(2000); // laisse l'iframe charger le PDF
    await shoot(page, '02-quittance-pdf.png');
    await page.keyboard.press('Escape');
  }

  // 03 Wizard onboarding — on s'inscrit avec un nouveau compte vierge
  // pour avoir le wizard sans données. On le fait dans un contexte séparé.
  await ctx.close();
}

async function captureWizard(browser: Browser, mainSeed: SeedResult) {
  // Pour le wizard à l'étape 1, on doit avoir un compte SANS données.
  // Marie Dupont (mainSeed) est ADMIN → elle peut créer un user direct via
  // /api/admin/users sans bypasser le mode CLOSED.
  const ctx = await browser.newContext({ viewport: VIEWPORT_DESKTOP });
  const page = await ctx.newPage();

  // Login comme Marie pour utiliser sa session admin
  await loginUI(page, mainSeed.email, mainSeed.password);

  // Création du wizard user via l'API admin (utilise le cookie de session)
  const wizardEmail = `wizard-${Date.now()}@quittances.local`;
  const wizardPassword = 'WizardPass1234!';
  const created = await page.request.post(`${BASE_URL}/api/admin/users`, {
    data: { email: wizardEmail, name: 'Wizard Demo', password: wizardPassword, role: 'MEMBER' },
  });
  if (!created.ok()) throw new Error('wizard user create: ' + await created.text());

  // Switch sur le contexte du wizard user
  await ctx.close();
  const wctx = await browser.newContext({ viewport: VIEWPORT_DESKTOP });
  const wpage = await wctx.newPage();
  await loginUI(wpage, wizardEmail, wizardPassword);
  await wpage.goto(`${BASE_URL}/onboarding`);
  await wpage.waitForLoadState('networkidle');
  await wpage.waitForTimeout(800);
  await shoot(wpage, '03-wizard-onboarding.png');

  // 06 2FA setup
  await wpage.goto(`${BASE_URL}/profil/securite`);
  await wpage.waitForLoadState('networkidle');
  await wpage.click('button:has-text("Activer le 2FA")');
  await wpage.waitForTimeout(1500); // attendre le QR code
  await shoot(wpage, '06-2fa-setup.png');

  await wctx.close();
}

async function captureMobile(browser: Browser, seed: SeedResult) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT_MOBILE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  });
  const page = await ctx.newPage();
  await loginUI(page, seed.email, seed.password);
  await page.waitForLoadState('networkidle');
  await shoot(page, '08-mobile-dashboard.png');
  await ctx.close();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log('→ Vérif que la stack v2 répond…');
  const ping = await fetch(`${BASE_URL}/login`, { redirect: 'manual' }).catch(() => null);
  if (!ping?.ok) {
    throw new Error(
      `La stack v2 n'est pas joignable sur ${BASE_URL}. Lance d'abord :\n`
      + `  docker compose -p quittances-v2 -f /tmp/docker-compose.v2.yml up -d`,
    );
  }

  console.log('→ Seed des données de démo…');
  const seed = await seedDemoData();
  console.log(`  user créé : ${seed.email}`);

  const browser = await chromium.launch();
  try {
    console.log('→ Captures desktop…');
    await captureDesktop(browser, seed);
    console.log('→ Captures wizard / 2FA…');
    await captureWizard(browser, seed);
    console.log('→ Captures mobile…');
    await captureMobile(browser, seed);
  } finally {
    await browser.close();
  }
  console.log(`\nTerminé. Captures dans ${OUT_DIR}/`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
