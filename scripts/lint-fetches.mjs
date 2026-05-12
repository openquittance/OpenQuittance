#!/usr/bin/env node
/**
 * Lint anti-régression : tout `fetch('/api/<route>')` côté client qui
 * cible une route LISTE scopée bailleur DOIT passer `bailleurId` (en
 * query string OU dans le body JSON.stringify). Cf. docs/MULTI-BAILLEUR.md
 * "Côté client".
 *
 * Cause d'origine (Lot D D.6) : bug rc1 où `parametres/irl/page.tsx:71`
 * faisait `fetch('/api/locataires')` sans bailleurId → 400 silencieux pour
 * les users multi-membership → page Indexation IRL vide.
 *
 * Approche : strict deny-list des **routes liste** qui exigent
 * bailleurId. Les routes par id (ex `/api/biens/[id]`) sont validées
 * serveur via composite filter — pas besoin côté client.
 *
 * Skip explicite via commentaire `// lint-fetches: skip — <raison>`
 * sur la ligne qui contient le fetch.
 *
 * Exit 1 si match. Lance : node scripts/lint-fetches.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';

// Routes LISTE qui exigent bailleurId côté client (en query OU body).
// Match strict sur le path complet (sans trailing slash/segments).
// Ne couvre PAS les routes [id] qui sont validées via composite serveur.
const SCOPED_LIST_ROUTES = new Set([
  'biens',
  'locataires',
  'quittances',
  'dashboard',
  'dashboard/alertes',
  'exports/pdf',
  'exports/xml',
  'quittances/preview-mois',
  'quittances/generer-mois',
  'quittances/envoyer-mois',
]);

const violations = [];

function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (e === 'node_modules' || e.startsWith('.')) continue;
      walk(p);
    } else if (e.endsWith('.tsx') || e.endsWith('.ts')) {
      check(p);
    }
  }
}

function check(file) {
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match fetch('/api/...') ou fetch(`/api/...`) — extrait le path jusqu'au
    // 1er caractère qui n'est pas un segment (?, ', ", `, espace, parenthèse).
    const m = line.match(/fetch\(['"`]\/api\/([^'"`?\s)]+)/);
    if (!m) continue;
    const path = m[1];
    // Skip si commentaire explicite sur la même ligne ou la précédente
    if (line.includes('lint-fetches: skip')) continue;
    if (i > 0 && lines[i - 1].includes('lint-fetches: skip')) continue;
    // Strip trailing slash
    const cleanPath = path.replace(/\/$/, '');
    // Match strict : si le path n'est PAS dans la deny-list, passer
    if (!SCOPED_LIST_ROUTES.has(cleanPath)) continue;
    // Match : check bailleurId dans 5 lignes (query string ou body)
    const window = lines.slice(i, Math.min(i + 5, lines.length)).join(' ');
    if (window.includes('bailleurId')) continue;
    violations.push({ file, line: i + 1, code: line.trim().slice(0, 100), path: cleanPath });
  }
}

walk(ROOT);

if (violations.length === 0) {
  console.log('✓ lint-fetches : aucune violation. Toutes les routes liste scopées passent bailleurId.');
  process.exit(0);
}

console.error(`✗ lint-fetches : ${violations.length} violation(s) trouvée(s) :\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    /api/${v.path}`);
  console.error(`    ${v.code}`);
  console.error('');
}
console.error('Fix : passer `?bailleurId=${active.id}` OU body `{ bailleurId }` OU ajouter');
console.error('commentaire `// lint-fetches: skip — <raison>` si réellement justifié.');
process.exit(1);
