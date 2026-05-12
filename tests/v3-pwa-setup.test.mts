/**
 * Tests v3.5.0-rc1 — PWA setup.
 *
 * T131a manifest.json présent + valide (name, start_url, display,
 *       theme_color, icons array)
 * T131b sw.js présent + handlers install/activate/fetch
 * T131c PwaInstaller.tsx Client Component register SW
 * T131d layout.tsx référence manifest + viewport themeColor +
 *       appleWebApp + PwaInstaller mount
 * T131e icons PNG générés (192, 512, maskable 192/512, 180)
 * T131f scripts/gen-pwa-icons.mjs présent + npm script
 *
 * Pure file checks.
 */

import { readFile, access } from 'node:fs/promises';
import path from 'node:path';

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  // ─── T131a manifest.json ──────────────────────────────────────────────
  console.log('\n→ T131a public/manifest.json présent + valide');
  const manifestOk = await fileExists(path.resolve('public/manifest.json'));
  assert('T131a1 manifest.json présent', manifestOk, manifestOk ? 'OK' : 'MANQUE');

  if (manifestOk) {
    const manifest = JSON.parse(
      await readFile(path.resolve('public/manifest.json'), 'utf-8'),
    );
    assert(
      'T131a2 name + short_name + start_url + display=standalone',
      manifest.name === 'OpenQuittance'
        && typeof manifest.short_name === 'string'
        && manifest.start_url === '/'
        && manifest.display === 'standalone',
      `display=${manifest.display}`,
    );
    assert(
      'T131a3 theme_color #2563eb + background_color #ffffff',
      manifest.theme_color === '#2563eb'
        && manifest.background_color === '#ffffff',
      'OK',
    );
    assert(
      'T131a4 icons array contient au moins 4 entrées (192/512 any + maskable)',
      Array.isArray(manifest.icons) && manifest.icons.length >= 4,
      `count=${manifest.icons?.length}`,
    );
    const hasMaskable = manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable');
    assert(
      'T131a5 icons inclut purpose=maskable',
      hasMaskable,
      'OK',
    );
  }

  // ─── T131b sw.js ──────────────────────────────────────────────────────
  console.log('\n→ T131b public/sw.js handlers install/activate/fetch');
  const swOk = await fileExists(path.resolve('public/sw.js'));
  assert('T131b1 sw.js présent', swOk, swOk ? 'OK' : 'MANQUE');
  if (swOk) {
    const sw = await readFile(path.resolve('public/sw.js'), 'utf-8');
    assert(
      'T131b2 sw.js contient install + activate + fetch handlers',
      sw.includes("addEventListener('install'")
        && sw.includes("addEventListener('activate'")
        && sw.includes("addEventListener('fetch'"),
      'OK',
    );
    assert(
      'T131b3 sw.js skipWaiting + clients.claim (activation immédiate)',
      sw.includes('skipWaiting')
        && sw.includes('clients.claim'),
      'OK',
    );
  }

  // ─── T131c PwaInstaller Client Component ──────────────────────────────
  console.log('\n→ T131c PwaInstaller.tsx register SW');
  const installerOk = await fileExists(path.resolve('src/components/PwaInstaller.tsx'));
  assert('T131c1 PwaInstaller.tsx présent', installerOk, 'OK');
  if (installerOk) {
    const src = await readFile(path.resolve('src/components/PwaInstaller.tsx'), 'utf-8');
    assert(
      'T131c2 use client + useEffect + navigator.serviceWorker.register(/sw.js)',
      src.includes("'use client'")
        && src.includes('useEffect')
        && src.includes("navigator.serviceWorker.register('/sw.js')"),
      'OK',
    );
  }

  // ─── T131d layout.tsx references ──────────────────────────────────────
  console.log('\n→ T131d layout.tsx manifest + viewport + appleWebApp + PwaInstaller');
  const layoutSrc = await readFile(path.resolve('src/app/layout.tsx'), 'utf-8');
  assert(
    'T131d1 layout.tsx metadata.manifest = "/manifest.json"',
    layoutSrc.includes("manifest: '/manifest.json'"),
    'OK',
  );
  assert(
    'T131d2 layout.tsx exporte viewport avec themeColor #2563eb',
    layoutSrc.includes('export const viewport')
      && layoutSrc.includes("themeColor: '#2563eb'"),
    'OK',
  );
  assert(
    'T131d3 layout.tsx appleWebApp capable + statusBarStyle',
    layoutSrc.includes('appleWebApp:')
      && layoutSrc.includes('capable: true')
      && layoutSrc.includes('statusBarStyle'),
    'OK',
  );
  assert(
    'T131d4 layout.tsx mount <PwaInstaller />',
    layoutSrc.includes('PwaInstaller')
      && layoutSrc.includes('<PwaInstaller />'),
    'OK',
  );
  assert(
    'T131d5 layout.tsx icons inclut PNG 192 + 512 + Apple 180',
    layoutSrc.includes("'/logo-192.png'")
      && layoutSrc.includes("'/logo-512.png'")
      && layoutSrc.includes("'/logo-180.png'"),
    'OK',
  );

  // ─── T131e icons PNG générés ──────────────────────────────────────────
  console.log('\n→ T131e icons PNG générés dans public/');
  for (const f of ['logo-192.png', 'logo-512.png', 'logo-maskable-192.png', 'logo-maskable-512.png', 'logo-180.png']) {
    const ok = await fileExists(path.resolve('public', f));
    assert(`T131e public/${f}`, ok, ok ? 'OK' : 'MANQUE — `npm run gen:pwa-icons` à relancer');
  }

  // ─── T131f script gen-pwa-icons ──────────────────────────────────────
  console.log('\n→ T131f scripts/gen-pwa-icons.mjs + npm script');
  const scriptOk = await fileExists(path.resolve('scripts/gen-pwa-icons.mjs'));
  assert('T131f1 scripts/gen-pwa-icons.mjs présent', scriptOk, 'OK');
  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf-8'));
  assert(
    'T131f2 package.json scripts.gen:pwa-icons',
    typeof pkg.scripts?.['gen:pwa-icons'] === 'string',
    `value=${pkg.scripts?.['gen:pwa-icons']}`,
  );
  assert(
    'T131f3 package.json devDependencies.sharp',
    typeof pkg.devDependencies?.sharp === 'string',
    `value=${pkg.devDependencies?.sharp}`,
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.5.0-rc1 pwa-setup ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.5.0-rc1 pwa-setup passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
