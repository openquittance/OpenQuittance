/**
 * Tests v3.2.0-rc3 — Phase 3 Session 3 : UI Paramètres > Intégrations.
 *
 * T122a fichiers UI présents + markers (page + Form + Sidebar entrée Plug)
 * T122b ADMIN gating (fallback shield si non-admin)
 * T122c source badge (db / env legacy / none) rendu correctement
 * T122d warnings effet immédiat Gmail vs restart Google login
 * T122e route /api/parametres/integrations préserve `***` pour secrets
 *       non-touchés (régression rc11 pattern)
 *
 * Pure tests — file content assertions + Zod direct, pas de SSR
 * (nécessiterait Next dev server + auth ADMIN session).
 */

import { readFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const { integrationsConfigSchema } = await import('../src/lib/validation.ts');

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  // ─── T122a fichiers UI + markers ──────────────────────────────────────
  console.log('\n→ T122a fichiers UI Intégrations + markers');

  const pagePath = path.resolve('src/app/parametres/integrations/page.tsx');
  const formPath = path.resolve('src/app/parametres/integrations/IntegrationsForm.tsx');

  for (const p of [pagePath, formPath]) {
    const ok = await fileExists(p);
    assert(`T122a fichier présent : ${path.basename(p)}`, ok, ok ? 'OK' : 'MANQUE');
  }

  const pageSrc = await readFile(pagePath, 'utf-8');
  const formSrc = await readFile(formPath, 'utf-8');

  const pageOk = pageSrc.includes("'use client'")
    && pageSrc.includes('useSession')
    && pageSrc.includes('AppShell')
    && pageSrc.includes('IntegrationsForm')
    && pageSrc.includes("session?.user?.role === 'ADMIN'")
    && pageSrc.includes('/api/parametres/integrations')
    && pageSrc.includes('Intégrations');
  assert(
    'T122a1 page.tsx : useSession + ADMIN gating + AppShell + IntegrationsForm',
    pageOk,
    'OK',
  );

  const formMarkers = [
    'Google OAuth (login utilisateurs + Gmail API)',
    'Client ID',
    'Client Secret',
    'Google Cloud Console',
    'console.cloud.google.com',
    "'***'",
    'clientIdDirty',
    'clientSecretDirty',
    'Configuré via UI',
    'Configuré via .env (legacy)',
    'Non configuré',
    'Gmail API',
    'immédiatement',
    'Login Google',
    'Redémarrage du container',
    '/api/auth/callback/google',
    '/api/parametres/integrations',
    'Enregistrer',
  ];
  const missing = formMarkers.filter(m => !formSrc.includes(m));
  assert(
    'T122a2 IntegrationsForm.tsx contient tous les markers UI (18 markers)',
    missing.length === 0,
    missing.length === 0 ? `${formMarkers.length}/${formMarkers.length}` : `manquants : ${missing.join(', ')}`,
  );

  // ─── T122b ADMIN gating ───────────────────────────────────────────────
  console.log('\n→ T122b ADMIN gating fallback shield');
  assert(
    'T122b page.tsx fallback shield si non-admin',
    pageSrc.includes('Shield')
      && pageSrc.includes('Accès ADMIN requis')
      && pageSrc.includes('!isAdmin'),
    'OK',
  );

  // ─── T122c source badge rendering ─────────────────────────────────────
  console.log('\n→ T122c source badge db/env/none');
  assert(
    'T122c IntegrationsForm gère 3 sources (db/env/none) avec couleurs distinctes',
    formSrc.includes("source === 'db'")
      && formSrc.includes("source === 'env'")
      && formSrc.includes('green-100')
      && formSrc.includes('yellow-100'),
    'OK',
  );

  // ─── T122d warnings restart container ─────────────────────────────────
  console.log('\n→ T122d warnings Gmail immédiat vs restart Google login');
  assert(
    'T122d2 warnings explicites (Gmail immédiat + Google login restart)',
    formSrc.includes('Gmail API')
      && formSrc.includes('immédiatement')
      && formSrc.includes('Login Google')
      && formSrc.includes('Redémarrage du container'),
    'OK',
  );

  // ─── T122e Sidebar entrée Intégrations Plug ───────────────────────────
  console.log('\n→ T122e Sidebar : entrée /parametres/integrations Plug icon');
  const sidebarSrc = await readFile(path.resolve('src/components/layout/Sidebar.tsx'), 'utf-8');
  assert(
    'T122e1 Sidebar : entrée /parametres/integrations + label Intégrations + Plug icon import',
    sidebarSrc.includes("href: '/parametres/integrations'")
      && sidebarSrc.includes("label: 'Intégrations'")
      && /import.*Plug.*from 'lucide-react'/s.test(sidebarSrc),
    'OK',
  );

  // Items pré-existants intacts
  const expectedExisting = [
    "label: 'Tableau de bord'",
    "label: 'Bailleurs'",
    "label: 'Backup'",
    "label: 'Indexation IRL'",
    "label: 'Paramètres'",
    "label: 'Sécurité'",
  ];
  const sidebarMissing = expectedExisting.filter(l => !sidebarSrc.includes(l));
  assert(
    'T122e2 Sidebar items existants intacts (6 critiques)',
    sidebarMissing.length === 0,
    sidebarMissing.length === 0 ? 'OK' : `manquants : ${sidebarMissing.join(', ')}`,
  );

  // ─── T122f régression Zod accepte '***' (rc11 pattern) ────────────────
  console.log('\n→ T122f régression Zod sentinelle *** pour Google secrets');
  {
    const r = integrationsConfigSchema.safeParse({
      googleClientId: '***',
      googleClientSecret: '***',
    });
    assert(
      'T122f sentinelle *** acceptée (préservation valeur DB)',
      r.success,
      r.success ? 'OK' : `error=${JSON.stringify(r.error.issues)}`,
    );
  }

  // ─── T122g cohérence type IntegrationsConfig UI ↔ route handler ───────
  console.log('\n→ T122g cohérence types UI ↔ route handler');
  const routeSrc = await readFile(
    path.resolve('src/app/api/parametres/integrations/route.ts'),
    'utf-8',
  );
  const fields = ['googleClientId', 'googleClientSecret', 'source'];
  const inForm = fields.filter(f => formSrc.includes(f));
  const inRoute = fields.filter(f => routeSrc.includes(f));
  assert(
    'T122g les 3 champs (clientId + secret + source) présents dans Form + route',
    inForm.length === 3 && inRoute.length === 3,
    `form=${inForm.length} route=${inRoute.length}`,
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.2.0-rc3 integrations-ui ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.2.0-rc3 integrations-ui passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
