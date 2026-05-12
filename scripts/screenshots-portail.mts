/**
 * Screenshots Lot B portail :
 *   1. Email d'invitation rendu en HTML "comme dans Gmail desktop / mobile"
 *   2. Page /portail/login dans ses 3 états (form, sent, rate-limited)
 *   3. Page /portail (placeholder Lot B, post-auth)
 *
 * Lance : npx tsx scripts/screenshots-portail.mts
 *
 * IMPORTANT : ces captures simulent un client de mail "neutre" (iframe
 * vierge avec viewport contraint). Gmail/Outlook peuvent modifier le
 * rendu (suppression de classes CSS, conversion d'images en pièces jointes
 * inline, dark mode override). Pour validation réelle, envoyez-vous l'email
 * depuis l'app et inspectez chez vous.
 */

import { chromium, type Browser, type Page } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3800';
const OUT_DIR = path.resolve('docs/screenshots/portail');

// Viewports simulés
const GMAIL_DESKTOP = { width: 800, height: 700 };   // panneau central Gmail
const MOBILE = { width: 375, height: 740 };

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

async function shoot(page: Page, name: string) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`✓ ${name}`);
}

// ─── 1. Email d'invitation ────────────────────────────────────────────────────

async function buildSampleEmailHtml(): Promise<string> {
  // On importe dynamiquement la lib lib/email/portail (côté Node) pour
  // appeler buildHtmlBody… qui est interne. Pour rester simple et
  // découplé, on ré-exporte un sample via un module dédié.
  // Ici on duplique un MINIMUM (le template évolue rarement).
  const verifyUrl = 'https://quittances.exemple.fr/portail/login/verify?token=fake_demo_token';
  const greeting = 'Bonjour Camille,';
  const bailleurNom = 'SCI Beauregard';
  const adresseBien = '47 boulevard de la Villette, 75019 Paris';
  const phoneLine = '06 12 34 56 78';

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px;background:#fff;">
  <p style="font-size:16px;margin:0 0 16px;"><strong>${greeting}</strong></p>
  <p style="margin:0 0 16px;">
    ${bailleurNom} a mis en place un espace en ligne sur lequel
    vous retrouverez toutes vos quittances de loyer.
  </p>
  <p style="margin:0 0 16px;">
    Vous pouvez les consulter et les télécharger à tout moment, sans avoir
    besoin de demander.
  </p>
  <p style="margin:0 0 24px;color:#555;font-size:14px;">
    Cet espace concerne votre logement situé au <strong>${adresseBien}</strong>.
  </p>
  <p style="text-align:center;margin:24px 0;">
    <a href="${verifyUrl}"
       style="display:inline-block;background:#2b2540;color:#ffffff;text-decoration:none;
              padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">
      Accéder à mon espace →
    </a>
  </p>
  <p style="font-size:13px;color:#666;margin:0 0 16px;font-style:italic;">
    Le lien ci-dessus est valable 15 minutes. Une fois connecté, votre accès
    reste valide pendant 30 jours sans avoir à se reconnecter. Passé ce délai,
    vous pourrez demander un nouveau lien depuis la page de connexion.
  </p>
  <p style="font-size:13px;color:#666;margin:0 0 24px;">
    Si vous n'avez pas demandé cet accès, vous pouvez ignorer ce message
    en toute sécurité. Pour ne plus recevoir ces emails, contactez
    directement votre bailleur qui pourra désactiver l'accès.
  </p>
  <hr style="border:none;border-top:1px solid #e6e0e2;margin:24px 0;">
  <p style="margin:0;color:#333;">
    Cordialement,<br>
    <strong>${bailleurNom}</strong>
    <br><span style="color:#666;font-size:14px;">Téléphone : ${phoneLine}</span>
  </p>
  <p style="font-size:11px;color:#999;margin:32px 0 0;">
    Propulsé par <a href="https://github.com/grx14/quittances-app"
       style="color:#999;">Quittances</a>, application open-source de gestion locative.
  </p>
</body></html>`;
}

async function captureEmail(browser: Browser) {
  const html = await buildSampleEmailHtml();

  // Desktop ("comme dans Gmail panneau central")
  for (const [label, viewport] of [
    ['email-desktop.png', GMAIL_DESKTOP],
    ['email-mobile.png', MOBILE],
  ] as const) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    // Page vierge style Gmail : fond gris, conteneur blanc
    await page.setContent(`
      <!DOCTYPE html><html><head><meta charset="UTF-8">
      <style>body{background:#f6f8fc;margin:0;padding:24px;font-family:sans-serif}</style>
      </head><body>
      <div style="background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">
        <div style="background:#f6f8fc;padding:12px 24px;border-bottom:1px solid #eee;font-size:13px;color:#333;">
          <div style="display:flex;justify-content:space-between;">
            <strong>SCI Beauregard</strong>
            <span style="color:#999">11:42 (il y a 2 min)</span>
          </div>
          <div style="font-size:14px;font-weight:500;margin-top:6px;">
            Vos quittances de loyer sont disponibles en ligne — SCI Beauregard
          </div>
          <div style="color:#666;margin-top:4px;font-size:12px;">à camille.lefevre@example.fr</div>
        </div>
        <iframe srcdoc="${html.replace(/"/g, '&quot;')}"
                style="width:100%;height:${viewport.height - 220}px;border:0;"></iframe>
      </div>
      </body></html>
    `);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await shoot(page, label);
    await ctx.close();
  }
}

// ─── 2. Page /portail/login ──────────────────────────────────────────────────

async function captureLoginPage(browser: Browser) {
  // État 1 : form vierge (desktop + mobile)
  for (const [label, viewport] of [
    ['login-form-desktop.png', GMAIL_DESKTOP],
    ['login-form-mobile.png', MOBILE],
  ] as const) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/portail/login`);
    await page.waitForLoadState('networkidle');
    await shoot(page, label);
    await ctx.close();
  }

  // État 2 : "Email envoyé" (après submit)
  for (const [label, viewport] of [
    ['login-sent-desktop.png', GMAIL_DESKTOP],
    ['login-sent-mobile.png', MOBILE],
  ] as const) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/portail/login`);
    await page.fill('input[type="email"]', `demo+${label}@example.com`);
    await page.click('button[type="submit"]');
    await page.waitForSelector('text=Email envoyé', { timeout: 15000 });
    await page.waitForTimeout(300);
    await shoot(page, label);
    await ctx.close();
  }

  // État 3 : Rate limit (4 envois rapides)
  const ctxRl = await browser.newContext({ viewport: GMAIL_DESKTOP });
  const pageRl = await ctxRl.newPage();
  await pageRl.goto(`${BASE_URL}/portail/login`);
  // 4 submits sur la même adresse pour dépasser la limite 3/h
  const targetEmail = `ratelimit-test-${Date.now()}@example.com`;
  for (let i = 0; i < 4; i++) {
    // Le state passe en "sent" après le 1er submit, donc on doit cliquer
    // "Renvoyer un lien" pour revenir au formulaire
    if (i > 0) {
      await pageRl.click('text=Renvoyer un lien').catch(() => {});
    }
    await pageRl.fill('input[type="email"]', targetEmail);
    await pageRl.click('button[type="submit"]');
    await pageRl.waitForTimeout(400);
  }
  await pageRl.waitForTimeout(800);
  // Le toast d'erreur "Trop de demandes" doit être visible
  await shoot(pageRl, 'login-ratelimit-desktop.png');
  await ctxRl.close();
}

// ─── 3. Page /portail (post-auth, placeholder Lot B) ────────────────────────

async function capturePortailHome(browser: Browser, magicToken: string) {
  // Login via le navigateur Playwright : on visite l'URL de verify, qui
  // redirige automatiquement à travers /api/auth/callback/magic-link puis
  // /portail. Playwright gère cookies + redirects transparents.
  const ctx = await browser.newContext({ viewport: GMAIL_DESKTOP });
  const page = await ctx.newPage();
  const verifyUrl = `${BASE_URL}/api/portail/login/verify?token=${magicToken}`;
  await page.goto(verifyUrl);
  await page.waitForLoadState('networkidle');
  // À ce stade on devrait être sur /portail
  if (!page.url().includes('/portail') || page.url().includes('/login')) {
    console.warn(`  (avertissement) après verify, URL = ${page.url()}`);
  }
  await page.waitForTimeout(500);
  await shoot(page, 'portail-home-desktop.png');

  // Mobile aussi
  const ctxM = await browser.newContext({ viewport: MOBILE });
  const pageM = await ctxM.newPage();
  // Pour mobile on doit re-générer un token (le précédent a été consommé)
  // → on appelle generateMagicLink à nouveau côté Node
  // (signature du caller : on retourne le token utilisé)
  await ctxM.close();
  await ctx.close();
}

async function capturePortailHomeMobile(browser: Browser, magicToken: string) {
  const ctx = await browser.newContext({ viewport: MOBILE, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const verifyUrl = `${BASE_URL}/api/portail/login/verify?token=${magicToken}`;
  await page.goto(verifyUrl);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await shoot(page, 'portail-home-mobile.png');
  await ctx.close();
}

async function capturePortailQuittancesList(browser: Browser, magicToken: string) {
  // Page /portail/quittances avec table desktop + cartes mobile
  for (const [label, viewport, isMobile] of [
    ['portail-quittances-desktop.png', GMAIL_DESKTOP, false],
    ['portail-quittances-mobile.png', MOBILE, true],
  ] as const) {
    const ctx = await browser.newContext(
      isMobile ? { viewport, isMobile: true, hasTouch: true } : { viewport },
    );
    const page = await ctx.newPage();
    await page.goto(`${BASE_URL}/api/portail/login/verify?token=${magicToken}`);
    await page.waitForLoadState('networkidle');
    await page.goto(`${BASE_URL}/portail/quittances`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await shoot(page, label);
    await ctx.close();
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  // Vérif stack
  const ping = await fetch(`${BASE_URL}/portail/login`).catch(() => null);
  if (!ping?.ok) {
    throw new Error(`Stack v2 indisponible sur ${BASE_URL}.`);
  }

  // Pour la capture portail-home, on a besoin d'un TENANT loggué via magic
  // link. Étapes : seed un locataire avec portail actif via Prisma, génère
  // un magic link, consomme via fetch, récupère le cookie session.
  const { PrismaClient } = await import('@prisma/client');
  const bcrypt = (await import('bcryptjs')).default;
  const prisma = new PrismaClient();

  // Reset minimal
  await prisma.user.deleteMany({ where: { email: { in: ['admin-snap@x.com', 'tenant-snap@x.com'] } } });
  await prisma.appConfig.upsert({ where: { id: 'singleton' }, update: {}, create: { id: 'singleton' } });

  const adminPwd = await bcrypt.hash('AdminPass1!', 10);
  const admin = await prisma.user.create({
    data: { email: 'admin-snap@x.com', name: 'Admin Snap', password: adminPwd, role: 'ADMIN' },
  });
  const tenant = await prisma.user.create({
    data: { email: 'tenant-snap@x.com', name: 'Camille Lefèvre', role: 'TENANT' },
  });
  const bailleur = await prisma.bailleur.upsert({
    where: { id: 'snap-bailleur' }, update: {},
    create: {
      id: 'snap-bailleur', nom: 'SCI Beauregard',
      adresseLigne1: '12 rue des Tilleuls', adresseLigne2: '75019 Paris',
      villeSignature: 'Paris', pdfCouleur: '#2b2540', pdfPolice: 'Helvetica',
      telephone: '06 12 34 56 78',
    },
  });
  const bien = await prisma.bien.upsert({
    where: { id: 'snap-bien' }, update: {},
    create: {
      id: 'snap-bien', bailleurId: bailleur.id, nom: 'Studio Belleville',
      adresse: '47 boulevard de la Villette', codePostal: '75019', ville: 'Paris',
    },
  });
  const locataire = await prisma.locataire.upsert({
    where: { id: 'snap-loc' },
    update: { tenantUserId: tenant.id, portailActiveLe: new Date(), portailActif: true },
    create: {
      id: 'snap-loc', bienId: bien.id, nom: 'Lefèvre', prenom: 'Camille',
      email: 'tenant-snap@x.com',
      loyerNu: 950, charges: 80, dateEntree: new Date('2024-09-01'),
      tenantUserId: tenant.id, portailActiveLe: new Date(), portailActif: true,
    },
  });

  // Crée 5 quittances (5 derniers mois) pour avoir une vraie liste
  await prisma.quittance.deleteMany({ where: { locataireId: locataire.id } });
  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 5);
    await prisma.quittance.create({
      data: {
        locataireId: locataire.id,
        mois: d.getMonth() + 1,
        annee: d.getFullYear(),
        loyerNu: 950, charges: 80, montantTotal: 1030,
        datePaiement: d,
        dateEmission: new Date(d.getFullYear(), d.getMonth(), 1),
      },
    });
  }

  // Génère 4 magic links (home desktop, home mobile, list desktop, list mobile)
  const { generateMagicLink } = await import('../src/lib/portail-magic.js').catch(async () =>
    await import('../src/lib/portail-magic'),
  );
  const { token: tokenDesktop } = await generateMagicLink({ tenantUserId: tenant.id });
  const { token: tokenMobile } = await generateMagicLink({ tenantUserId: tenant.id });
  const { token: tokenListDesktop } = await generateMagicLink({ tenantUserId: tenant.id });
  const { token: tokenListMobile } = await generateMagicLink({ tenantUserId: tenant.id });

  const browser = await chromium.launch();
  try {
    console.log('→ Email rendering (desktop + mobile)…');
    await captureEmail(browser);
    console.log('→ /portail/login (form + sent + ratelimit)…');
    await captureLoginPage(browser);
    console.log('→ /portail post-auth (desktop + mobile)…');
    await capturePortailHome(browser, tokenDesktop);
    await capturePortailHomeMobile(browser, tokenMobile);
    console.log('→ /portail/quittances (desktop + mobile)…');
    // Petit hack : capturePortailQuittancesList prend 1 token, fait desktop + mobile
    // → on lui passe les 2 tokens via wrapper inline
    const ctxD = await browser.newContext({ viewport: GMAIL_DESKTOP });
    const pageD = await ctxD.newPage();
    await pageD.goto(`${BASE_URL}/api/portail/login/verify?token=${tokenListDesktop}`);
    await pageD.waitForLoadState('networkidle');
    await pageD.goto(`${BASE_URL}/portail/quittances`);
    await pageD.waitForLoadState('networkidle');
    await pageD.waitForTimeout(500);
    await shoot(pageD, 'portail-quittances-desktop.png');
    await ctxD.close();

    const ctxM = await browser.newContext({ viewport: MOBILE, isMobile: true, hasTouch: true });
    const pageM = await ctxM.newPage();
    await pageM.goto(`${BASE_URL}/api/portail/login/verify?token=${tokenListMobile}`);
    await pageM.waitForLoadState('networkidle');
    await pageM.goto(`${BASE_URL}/portail/quittances`);
    await pageM.waitForLoadState('networkidle');
    await pageM.waitForTimeout(500);
    await shoot(pageM, 'portail-quittances-mobile.png');
    await ctxM.close();
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }

  // Génère aussi le HTML brut pour inspection manuelle
  const rawHtml = await buildSampleEmailHtml();
  await writeFile(path.join(OUT_DIR, 'email-raw.html'), rawHtml);
  console.log(`✓ email-raw.html (HTML brut pour inspection)`);

  console.log(`\nTerminé. Fichiers dans ${OUT_DIR}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
