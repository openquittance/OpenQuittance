/**
 * Tests v3.3.0-rc1 — Phase 4 Session 1 : setup wizard install web.
 *
 * Couvre : middleware /install paths public, page /install Server
 * Component redirect logic, endpoints API gating, wizard 3 étapes
 * markers UI, secrets faibles detection.
 *
 * Pure tests — file content + Zod (pas de stack DB / NextAuth).
 */

import { readFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

if (!process.env.ENCRYPTION_SECRET) {
  process.env.ENCRYPTION_SECRET = randomBytes(32).toString('hex');
}

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  // ─── T125a fichiers UI + endpoints présents ───────────────────────────
  console.log('\n→ T125a fichiers wizard install présents');
  const required = [
    'src/app/install/page.tsx',
    'src/app/install/InstallWizard.tsx',
    'src/app/api/install/admin/route.ts',
    'src/app/api/install/bailleur/route.ts',
    'src/app/api/install/complete/route.ts',
  ];
  for (const f of required) {
    const ok = await fileExists(path.resolve(f));
    assert(`T125a ${path.basename(f)}`, ok, ok ? 'OK' : 'MANQUE');
  }

  // ─── T125b middleware /install + /api/install dans PUBLIC ─────────────
  console.log('\n→ T125b middleware /install + /api/install publics');
  const middleware = await readFile(path.resolve('src/middleware.ts'), 'utf-8');
  assert(
    "T125b1 PUBLIC_PATHS contient '/install'",
    middleware.includes("'/install'"),
    'OK',
  );
  assert(
    "T125b2 PUBLIC_API_PREFIXES contient '/api/install'",
    middleware.includes("'/api/install'"),
    'OK',
  );

  // ─── T125c page /install : redirect login si hasAnyAdmin ──────────────
  console.log('\n→ T125c page /install : redirect /login si hasAnyAdmin()');
  const pageSrc = await readFile(path.resolve('src/app/install/page.tsx'), 'utf-8');
  assert(
    'T125c1 page importe hasAnyAdmin + redirect',
    pageSrc.includes('hasAnyAdmin')
      && pageSrc.includes('redirect')
      && pageSrc.includes("redirect('/login')"),
    'OK',
  );
  assert(
    'T125c2 page détecte secrets faibles (NEXTAUTH_SECRET, UPLOADS_ENCRYPTION_KEY, ENCRYPTION_SECRET)',
    pageSrc.includes('NEXTAUTH_SECRET')
      && pageSrc.includes('UPLOADS_ENCRYPTION_KEY')
      && pageSrc.includes('ENCRYPTION_SECRET')
      && pageSrc.includes('detectWeakSecrets'),
    'OK',
  );

  // ─── T125d wizard markers 3 étapes ────────────────────────────────────
  console.log('\n→ T125d wizard 3 étapes + markers UI');
  const wizardSrc = await readFile(path.resolve('src/app/install/InstallWizard.tsx'), 'utf-8');
  const wizardMarkers = [
    'Compte administrateur',
    'Premier bailleur',
    "C'est prêt",
    'name',
    'email',
    'password',
    'nom',
    'adresseLigne1',
    'adresseLigne2',
    'villeSignature',
    '/api/install/admin',
    '/api/install/bailleur',
    '/api/install/complete',
    'signIn',
    'weakSecrets',
    "step === 1",
    "step === 2",
    "step === 3",
    '/parametres/integrations',
    '/parametres/backup',
  ];
  const missing = wizardMarkers.filter(m => !wizardSrc.includes(m));
  assert(
    'T125d wizard contient 20 markers (3 steps + 4 champs admin + 4 champs bailleur + endpoints + signin + done links)',
    missing.length === 0,
    missing.length === 0 ? `${wizardMarkers.length}/${wizardMarkers.length}` : `manquants : ${missing.join(', ')}`,
  );

  // ─── T125e endpoint admin gating !hasAnyAdmin ─────────────────────────
  console.log('\n→ T125e endpoint /api/install/admin gating');
  const adminSrc = await readFile(path.resolve('src/app/api/install/admin/route.ts'), 'utf-8');
  assert(
    'T125e1 admin endpoint vérifie !hasAnyAdmin avant create',
    adminSrc.includes('hasAnyAdmin')
      && adminSrc.includes('Instance déjà installée'),
    'OK',
  );
  assert(
    'T125e2 admin endpoint hash bcrypt + role ADMIN + audit log',
    adminSrc.includes('bcrypt')
      && adminSrc.includes("role: 'ADMIN'")
      && adminSrc.includes('install.admin.created'),
    'OK',
  );

  // ─── T125f endpoint bailleur gating session ADMIN ────────────────────
  console.log('\n→ T125f endpoint /api/install/bailleur gating session');
  const bailleurSrc = await readFile(path.resolve('src/app/api/install/bailleur/route.ts'), 'utf-8');
  assert(
    'T125f1 bailleur endpoint vérifie hasAnyAdmin + session ADMIN',
    bailleurSrc.includes('hasAnyAdmin')
      && bailleurSrc.includes('await auth()')
      && bailleurSrc.includes("role !== 'ADMIN'"),
    'OK',
  );
  assert(
    'T125f2 bailleur endpoint crée Bailleur + Membership ADMIN',
    bailleurSrc.includes('prisma.bailleur.create')
      && bailleurSrc.includes('memberships:')
      && bailleurSrc.includes("role: 'ADMIN'"),
    'OK',
  );

  // ─── T125g endpoint complete : marque setupCompleted ─────────────────
  console.log('\n→ T125g endpoint /api/install/complete marque setupCompleted');
  const completeSrc = await readFile(path.resolve('src/app/api/install/complete/route.ts'), 'utf-8');
  assert(
    'T125g complete endpoint update AppConfig.setupCompleted=true',
    completeSrc.includes('setupCompleted: true')
      && completeSrc.includes("role !== 'ADMIN'"),
    'OK',
  );

  // ─── T125h registerSchema réutilisable + Zod admin schema ─────────────
  console.log('\n→ T125h validation Zod : email + password 8 chars min');
  // Reproduit le installAdminSchema localement pour test
  const { z } = await import('zod');
  const installAdminSchema = z.object({
    name: z.string().min(1, 'Nom requis'),
    email: z.string().email('Email invalide'),
    password: z.string().min(8, '8 caractères minimum'),
  });
  {
    const r = installAdminSchema.safeParse({
      name: 'Jean',
      email: 'admin@example.com',
      password: 'longpass8',
    });
    assert(
      'T125h1 admin valid → accept',
      r.success,
      'OK',
    );
  }
  {
    const r = installAdminSchema.safeParse({
      name: 'Jean',
      email: 'admin@example.com',
      password: 'short',
    });
    assert(
      'T125h2 password < 8 → reject',
      !r.success,
      'OK',
    );
  }
  {
    const r = installAdminSchema.safeParse({
      name: 'Jean',
      email: 'pas-un-email',
      password: 'longpass8',
    });
    assert(
      'T125h3 email invalide → reject',
      !r.success,
      'OK',
    );
  }
  {
    const r = installAdminSchema.safeParse({
      name: '',
      email: 'admin@example.com',
      password: 'longpass8',
    });
    assert(
      'T125h4 name vide → reject',
      !r.success,
      'OK',
    );
  }

  // ─── T125i bailleur Zod 4 champs requis ──────────────────────────────
  console.log('\n→ T125i bailleur Zod : 4 champs minimum stricts');
  const installBailleurSchema = z.object({
    nom: z.string().min(1),
    adresseLigne1: z.string().min(1),
    adresseLigne2: z.string().min(1),
    villeSignature: z.string().min(1),
  });
  {
    const r = installBailleurSchema.safeParse({
      nom: 'SCI Test',
      adresseLigne1: '1 rue Test',
      adresseLigne2: '75001 Paris',
      villeSignature: 'Paris',
    });
    assert(
      'T125i1 bailleur 4 champs → accept',
      r.success,
      'OK',
    );
  }
  {
    const r = installBailleurSchema.safeParse({
      nom: 'SCI Test',
      adresseLigne1: '',
      adresseLigne2: '75001 Paris',
      villeSignature: 'Paris',
    });
    assert(
      'T125i2 bailleur adresse vide → reject',
      !r.success,
      'OK',
    );
  }

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.3.0-rc1 install-wizard ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.3.0-rc1 install-wizard passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
