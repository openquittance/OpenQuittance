/**
 * Tests v3.7.1 — documentation complète avant push public.
 *
 * Phase 6 Session 1bis : audit doc révèle 7 trous. Création de 5
 * nouveaux docs (+ refresh README + galerie screenshots).
 *
 * T138a 5 nouveaux docs présents :
 *       USER-GUIDE.md, API.md, ARCHITECTURE.md, FAQ.md, GLOSSAIRE.md
 *       (+ SCREENSHOTS.md = 6e)
 * T138b README.md contient liens vers chaque nouveau doc
 * T138c Pas de PII/secret dans nouvelle doc :
 *       - pas d'email perso
 *       - pas de PAT/token GitHub en clair
 *       - pas de mot de passe / clé chiffrement
 * T138d README.md badge version 3.7.x
 * T138e README.md repo URL openquittance/OpenQuittance (pas grx14)
 * T138f docs/SCREENSHOTS.md liste écrans à capturer + galerie
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
  // ─── T138a 5+1 nouveaux docs présents ────────────────────────────────
  console.log('\n→ T138a docs USER-GUIDE + API + ARCHITECTURE + FAQ + GLOSSAIRE + SCREENSHOTS');
  const newDocs = [
    'docs/USER-GUIDE.md',
    'docs/API.md',
    'docs/ARCHITECTURE.md',
    'docs/FAQ.md',
    'docs/GLOSSAIRE.md',
    'docs/SCREENSHOTS.md',
  ];
  for (const doc of newDocs) {
    const ok = await fileExists(path.resolve(doc));
    assert(`T138a ${doc} présent`, ok, ok ? 'OK' : 'MANQUE');
    if (ok) {
      // Vérifie taille minimale (≥ 500 octets = vrai contenu).
      const src = await readFile(path.resolve(doc), 'utf-8');
      assert(
        `T138a ${doc} taille ≥ 500 octets`,
        src.length >= 500,
        `${src.length} octets`,
      );
    }
  }

  // ─── T138b README links vers chaque nouveau doc ──────────────────────
  console.log('\n→ T138b README.md liens vers chaque nouveau doc');
  const readme = await readFile(path.resolve('README.md'), 'utf-8');
  const links = [
    ['USER-GUIDE.md', 'docs/USER-GUIDE.md'],
    ['API.md', 'docs/API.md'],
    ['ARCHITECTURE.md', 'docs/ARCHITECTURE.md'],
    ['FAQ.md', 'docs/FAQ.md'],
    ['GLOSSAIRE.md', 'docs/GLOSSAIRE.md'],
    ['SCREENSHOTS.md', 'docs/SCREENSHOTS.md'],
  ];
  for (const [name, link] of links) {
    assert(
      `T138b README link ${name}`,
      readme.includes(`(${link})`),
      'OK',
    );
  }

  // ─── T138c Pas de PII/secret dans la nouvelle doc ────────────────────
  console.log('\n→ T138c pas de PII/secret dans nouvelle doc');
  // Pattern PAT GitHub : ghp_ + 36 alphanum
  const ghPatRegex = /ghp_[A-Za-z0-9]{36}/;
  // Mots-clés secrets sensibles
  for (const doc of newDocs) {
    const src = await readFile(path.resolve(doc), 'utf-8');
    assert(
      `T138c ${doc} : pas de PAT GitHub en clair`,
      !ghPatRegex.test(src),
      'OK',
    );
    assert(
      `T138c ${doc} : pas d'email perso @gmail/@hotmail/@yahoo`,
      !/[\w.+-]+@(gmail|hotmail|yahoo|outlook|protonmail)\.(com|fr)/i.test(src),
      'OK',
    );
    // Pas de chaîne longue base64 (clé chiffrement potentielle).
    // Strip code blocks + URLs (false positives sur URLs github
    // longues, identifiants de routes, etc.).
    const stripped = src
      .replace(/`[^`]*`/g, '')             // inline code
      .replace(/```[\s\S]*?```/g, '')       // fenced code
      .replace(/https?:\/\/\S+/g, '')       // URLs
      .replace(/\([^)]*\.md[^)]*\)/g, ''); // markdown links to docs
    assert(
      `T138c ${doc} : pas de clé base64 longue (≥ 40 chars consécutifs)`,
      !/[A-Za-z0-9+/]{40,}={0,2}/.test(stripped),
      'OK',
    );
  }

  // ─── T138d README badge version 3.7.x ─────────────────────────────────
  console.log('\n→ T138d README badge version 3.7.x');
  assert(
    'T138d badge version-3.7',
    /version-3\.7\.\d+/.test(readme),
    'OK',
  );

  // ─── T138e README repo URL openquittance/OpenQuittance ───────────────
  console.log('\n→ T138e README repo URL openquittance/OpenQuittance (pas grx14)');
  assert(
    'T138e1 README contient openquittance/OpenQuittance',
    readme.includes('openquittance/OpenQuittance'),
    'OK',
  );
  // grx14/quittances-app peut rester dans le CHANGELOG (historique) mais
  // pas dans le README de référence.
  assert(
    'T138e2 README ne référence plus grx14/quittances-app',
    !readme.includes('grx14/quittances-app'),
    'OK',
  );

  // ─── T138f SCREENSHOTS.md galerie + liste à capturer ─────────────────
  console.log('\n→ T138f SCREENSHOTS.md galerie + liste écrans à capturer');
  const screenshots = await readFile(
    path.resolve('docs/SCREENSHOTS.md'),
    'utf-8',
  );
  assert(
    'T138f1 SCREENSHOTS référence 01-dashboard.png + 08-mobile',
    screenshots.includes('01-dashboard.png')
      && screenshots.includes('08-mobile-dashboard.png'),
    'OK',
  );
  assert(
    'T138f2 SCREENSHOTS liste écrans à capturer (mobile cards v3.6.2 + dark mode)',
    screenshots.includes('mobile cards')
      && screenshots.includes('dark mode'),
    'OK',
  );

  // ─── T138g package.json version >= 3.7.1 ─────────────────────────────
  console.log('\n→ T138g package.json version >= 3.7.1');
  const pkg = JSON.parse(await readFile(path.resolve('package.json'), 'utf-8'));
  assert(
    'T138g package.json version >= "3.7.1"',
    typeof pkg.version === 'string'
      && (/^3\.([89]|\d{2,})\.\d+$/.test(pkg.version) || /^3\.7\.[1-9]\d*/.test(pkg.version)),
    `version=${pkg.version}`,
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.7.1 docs-complete ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.7.1 docs-complete passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
