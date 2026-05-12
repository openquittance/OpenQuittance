/**
 * Test unitaire isolé du helper `withBailleurScope` (Lot C bis rc2).
 *
 * Cible le bug latent : si l'UI fait `?bailleurId=` (string vide via
 * template literal) ou `?bailleurId=   ` (whitespace), on doit traiter
 * comme "non fourni" (fallback ou 400 multi), pas comme valeur invalide
 * (403 "Accès refusé" trompeur).
 *
 * 1 cas testé : string vide → comportement identique à null.
 *
 * Lance : npx tsx tests/multi-bailleur-helpers.test.mts
 */

import { withBailleurScope, ScopeError } from '../src/lib/multi-bailleur.js';

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

const sessionMono = {
  user: {
    id: 'u1',
    email: 'u1@test',
    role: 'ADMIN' as const,
    memberships: [{ bailleurId: 'b1', role: 'ADMIN' as const }],
  },
};

const sessionMulti = {
  user: {
    id: 'u2',
    email: 'u2@test',
    role: 'ADMIN' as const,
    memberships: [
      { bailleurId: 'b1', role: 'ADMIN' as const },
      { bailleurId: 'b2', role: 'ADMIN' as const },
    ],
  },
};

console.log('→ Test withBailleurScope guard string vide');

// Cas string vide + 1 membership → fallback (comme null)
try {
  const scope = withBailleurScope(sessionMono as never, '');
  assert('"" + 1 membership → fallback (pas 403)', scope.bailleurId === 'b1');
} catch (e) {
  if (e instanceof ScopeError) {
    assert('"" + 1 membership → fallback (pas 403)', false, `throw ScopeError ${e.response.status}`);
  } else {
    throw e;
  }
}

// Cas string vide + multi-membership → 400 (comme null)
try {
  withBailleurScope(sessionMulti as never, '');
  assert('"" + multi-membership → 400 (pas 403)', false, 'no throw');
} catch (e) {
  if (e instanceof ScopeError) {
    assert('"" + multi-membership → 400 (pas 403)', e.response.status === 400, `status=${e.response.status}`);
  } else {
    throw e;
  }
}

// Cas whitespace → idem null
try {
  const scope = withBailleurScope(sessionMono as never, '   ');
  assert('"   " (whitespace) + 1 membership → fallback', scope.bailleurId === 'b1');
} catch {
  assert('"   " (whitespace) + 1 membership → fallback', false, 'throw');
}

console.log('\nRésumé :');
const passed = results.filter(r => r.ok).length;
console.log(`  ${passed}/${results.length} tests passent`);
if (passed !== results.length) process.exit(1);
console.log('\n✓ Guard string vide OK.');
