/**
 * Tests v3.6.1 + v3.6.2 hotfix — preview PDF adaptative mobile.
 *
 * v3.6.1 (incomplet) :
 * - Bug user iOS/Android : modale PDF s'affichait encore (iframe
 *   rendue avant que isMobile soit déterminé). Root causes :
 *   1. PdfPreviewModal seul fixé — staff /quittances utilisait
 *      Modal+<iframe> brut (PAS PdfPreviewModal).
 *   2. Hydration timing : useState(false) initial → premier render
 *      iframe → useEffect setIsMobile(true) → re-render null, mais
 *      iframe avait déjà mount et déclenché GET PDF.
 *
 * v3.6.2 fix :
 * - useIsMobile retourne { mounted, isMobile } pour gate rendu sur
 *   mounted=true (évite flash iframe pendant hydration).
 *   Détection viewport + pointer:coarse fallback.
 * - PdfPreviewModal early-return null si !mounted (avant iframe).
 * - staff /quittances bascule vers PdfPreviewModal (au lieu de
 *   Modal+iframe brut).
 * - EmailPreviewModal + apparence PdfPreview : remplacent iframe
 *   par bouton download direct sur mobile.
 *
 * T133a useIsMobile { mounted, isMobile } + matchMedia + pointer fallback
 * T133b PdfPreviewModal gate !mounted + branche mobile download
 * T133c staff /quittances utilise PdfPreviewModal (pas Modal+iframe brut)
 * T133d /portail mobile cards : bouton Aperçu retiré
 * T133e layout.tsx meta tags PWA iOS complets
 * T133f EmailPreviewModal + apparence PdfPreview : pas d'iframe mobile
 * T133g package.json version >= 3.6.2
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
  // ─── T133a useIsMobile hook ──────────────────────────────────────────
  console.log('\n→ T133a useIsMobile { mounted, isMobile } + détection robuste');
  const hookPath = path.resolve('src/lib/hooks/useIsMobile.ts');
  const hookOk = await fileExists(hookPath);
  assert('T133a1 useIsMobile.ts présent', hookOk, hookOk ? 'OK' : 'MANQUE');
  if (hookOk) {
    const src = await readFile(hookPath, 'utf-8');
    assert(
      'T133a2 useIsMobile retourne { mounted, isMobile } (gate hydration)',
      src.includes('mounted: boolean')
        && src.includes('isMobile: boolean')
        && src.includes('export function useIsMobile'),
      'OK',
    );
    assert(
      'T133a3 détection matchMedia max-width 767px',
      src.includes('matchMedia')
        && src.includes('max-width')
        && src.includes('767'),
      'OK',
    );
    assert(
      'T133a4 fallback pointer:coarse + viewport 1024px (tablettes touch)',
      src.includes('pointer: coarse')
        && src.includes('1024'),
      'OK',
    );
    assert(
      'T133a5 SSR-safe (typeof window undefined check)',
      src.includes("typeof window === 'undefined'"),
      'OK',
    );
    assert(
      'T133a6 cleanup listener resize + mediaquery change',
      src.includes('removeEventListener'),
      'OK',
    );
  }

  // ─── T133b PdfPreviewModal gate + branche mobile ──────────────────────
  console.log('\n→ T133b PdfPreviewModal gate !mounted + download mobile');
  const modalSrc = await readFile(
    path.resolve('src/components/PdfPreviewModal.tsx'),
    'utf-8',
  );
  assert(
    'T133b1 destructure { mounted, isMobile } depuis useIsMobile',
    /const\s*\{\s*mounted,\s*isMobile\s*\}\s*=\s*useIsMobile/.test(modalSrc),
    'OK',
  );
  assert(
    'T133b2 early-return null si !mounted (avant iframe)',
    modalSrc.includes('if (!mounted) return null'),
    'OK',
  );
  assert(
    'T133b3 early-return null si isMobile (iframe jamais rendue mobile)',
    modalSrc.includes('if (isMobile) return null'),
    'OK',
  );
  assert(
    "T133b4 download programmatique (createElement('a') + a.click)",
    modalSrc.includes("createElement('a')")
      && modalSrc.includes('a.click()'),
    'OK',
  );
  assert(
    'T133b5 garde-fou useRef downloadTriggered',
    modalSrc.includes('downloadTriggered')
      && modalSrc.includes('useRef'),
    'OK',
  );
  assert(
    'T133b6 commentaires hotfix v3.6.1 + v3.6.2 documentent cause',
    modalSrc.includes('v3.6.2')
      && modalSrc.includes('hydration'),
    'OK',
  );

  // ─── T133c staff /quittances utilise PdfPreviewModal ─────────────────
  console.log('\n→ T133c staff /quittances utilise PdfPreviewModal (pas Modal+iframe)');
  const staffSrc = await readFile(path.resolve('src/app/quittances/page.tsx'), 'utf-8');
  assert(
    "T133c1 import PdfPreviewModal présent",
    staffSrc.includes("from '@/components/PdfPreviewModal'"),
    'OK',
  );
  assert(
    'T133c2 plus de <iframe src=...pdf?inline=1...> dans /quittances',
    !/<iframe[\s\S]*?pdf\?inline=1/.test(staffSrc),
    'OK',
  );
  assert(
    'T133c3 utilise <PdfPreviewModal url filename onClose>',
    /PdfPreviewModal[\s\S]*?url=\{[\s\S]*?onClose=/.test(staffSrc),
    'OK',
  );

  // ─── T133d portail mobile cards Aperçu retiré ─────────────────────────
  console.log('\n→ T133d portail QuittancesList mobile cards');
  const listSrc = await readFile(
    path.resolve('src/app/portail/quittances/QuittancesList.tsx'),
    'utf-8',
  );
  const mobileSection = listSrc.match(/md:hidden[\s\S]+?{preview &&/);
  assert(
    'T133d1 section mobile cards localisée',
    mobileSection !== null,
    mobileSection ? 'OK' : 'NOT FOUND',
  );
  if (mobileSection) {
    assert(
      "T133d2 mobile cards : pas de bouton Visualiser/Aperçu",
      !mobileSection[0].includes('Visualiser')
        && !mobileSection[0].includes('view(q)'),
      'OK',
    );
    assert(
      "T133d3 mobile cards : bouton Télécharger conservé",
      mobileSection[0].includes('Télécharger'),
      'OK',
    );
  }

  // ─── T133e layout.tsx meta tags PWA iOS ───────────────────────────────
  console.log('\n→ T133e layout.tsx meta tags PWA iOS');
  const layoutSrc = await readFile(path.resolve('src/app/layout.tsx'), 'utf-8');
  assert(
    'T133e1 appleWebApp { capable, statusBarStyle, title }',
    layoutSrc.includes('appleWebApp:')
      && layoutSrc.includes('capable: true')
      && layoutSrc.includes('statusBarStyle')
      && /title:\s*'OpenQuittance'/.test(layoutSrc),
    'OK',
  );
  assert(
    "T133e2 icons.apple inclut logo-180.png",
    layoutSrc.includes("'/logo-180.png'")
      && /apple:\s*\[/.test(layoutSrc),
    'OK',
  );
  assert(
    "T133e3 manifest: '/manifest.json'",
    layoutSrc.includes("manifest: '/manifest.json'"),
    'OK',
  );

  // ─── T133f EmailPreviewModal + apparence PdfPreview : pas d'iframe mobile ─
  console.log('\n→ T133f autres modales PDF : bypass mobile');
  const emailSrc = await readFile(
    path.resolve('src/components/EmailPreviewModal.tsx'),
    'utf-8',
  );
  assert(
    'T133f1 EmailPreviewModal importe useIsMobile',
    emailSrc.includes("from '@/lib/hooks/useIsMobile'"),
    'OK',
  );
  assert(
    'T133f2 EmailPreviewModal : iframe gated derrière !isMobile',
    /isMobile\s*\?[\s\S]+?<a[\s\S]+?download/.test(emailSrc),
    'OK',
  );

  const apparenceSrc = await readFile(
    path.resolve('src/app/parametres/apparence/page.tsx'),
    'utf-8',
  );
  assert(
    'T133f3 apparence PdfPreview importe useIsMobile',
    apparenceSrc.includes("from '@/lib/hooks/useIsMobile'"),
    'OK',
  );
  assert(
    'T133f4 apparence PdfPreview : iframe gated derrière !isMobile',
    /if\s*\(\s*isMobile\s*\)\s*{[\s\S]+?Télécharger/.test(apparenceSrc),
    'OK',
  );

  // ─── T133g package.json version >= 3.6.2 ─────────────────────────────
  console.log('\n→ T133g package.json version >= 3.6.2');
  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf-8'));
  assert(
    'T133g package.json version >= "3.6.2"',
    typeof pkg.version === 'string'
      && /^3\.([7-9]|\d{2,})\.\d+$/.test(pkg.version) || /^3\.6\.[2-9]/.test(pkg.version),
    `version=${pkg.version}`,
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.6.1+v3.6.2 pdf-preview-mobile ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.6.1+v3.6.2 pdf-preview-mobile passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
