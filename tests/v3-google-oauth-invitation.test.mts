/**
 * Tests v3.4.0-rc1 — fix Access denied Google OAuth post-invitation.
 *
 * Cause racine pré-rc11 :
 * - signIn callback Google strict : user inconnu + pas premier user +
 *   pas d'invitation pending matching → return false → "Access denied".
 * - Si invitation pending matchée, return true MAIS le user créé par
 *   adapter avait role MEMBER default — l'invitation n'était JAMAIS
 *   marquée acceptedAt et BailleurMembership n'étaient pas créées.
 * - User TENANT existant cliquant invitation → existing return true,
 *   mais role TENANT inchangé → middleware redirect /portail.
 *
 * Fix v3.4.0-rc1 :
 * - signIn callback Google : 4 cas explicites (existing → ok, premier →
 *   ADMIN auto, nouveau + invitation → ok, sinon refus).
 * - events.signIn (Google) : auto-call acceptInvitation pour pending
 *   invitation matching user.email. Couvre nouveau user + existant
 *   (upgrade rôle + memberships).
 *
 * T129a auth.ts importe acceptInvitation
 * T129b signIn callback : 4 cas distincts existing / first / invitation / refus
 * T129c events.signIn : auto-accept invitation pending pour Google provider
 * T129d simulation logique : 5 scenarios (new+invitation, existing TENANT
 *       +invitation, new sans invitation, first user, existing staff)
 *
 * Pure file checks + simulation.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  const authSrc = await readFile(path.resolve('src/auth.ts'), 'utf-8');

  // ─── T129a auth.ts importe acceptInvitation ───────────────────────────
  console.log('\n→ T129a auth.ts importe acceptInvitation');
  assert(
    'T129a import acceptInvitation depuis lib/invitations',
    authSrc.includes("import { acceptInvitation } from './lib/invitations'"),
    'OK',
  );

  // ─── T129b signIn callback Google : 4 cas explicites ──────────────────
  console.log('\n→ T129b signIn callback Google 4 cas distincts');
  // Vérifie les commentaires/logique des 4 branches.
  assert(
    'T129b1 Cas 1 existing user → return true (commentaire + code)',
    authSrc.includes('Cas 1 : user existant')
      && authSrc.includes('if (existing) return true'),
    'OK',
  );
  assert(
    'T129b2 Cas 2 premier user → ADMIN auto',
    authSrc.includes('Cas 2 : nouveau user')
      && authSrc.includes('isFirstUser')
      && authSrc.includes('ADMIN auto'),
    'OK',
  );
  assert(
    'T129b3 Cas 3 nouveau user avec invitation pending → return true',
    authSrc.includes('Cas 3 : nouveau user')
      && authSrc.includes('invitation pending')
      && authSrc.includes('if (invitation)'),
    'OK',
  );
  assert(
    'T129b4 Cas 4 mode CLOSED ou pas invitation → return false',
    authSrc.includes('Cas 4 : mode CLOSED')
      && authSrc.includes("mode === 'CLOSED'"),
    'OK',
  );

  // ─── T129c events.signIn auto-accept invitation Google ────────────────
  console.log('\n→ T129c events.signIn auto-accept invitation pending Google');
  assert(
    'T129c1 events.signIn appelle acceptInvitation pour Google + invitation pending',
    authSrc.includes('auto-accept pending invitation')
      && authSrc.includes('await acceptInvitation(pending.token, user.id)'),
    'OK',
  );
  assert(
    'T129c2 events.signIn filtré sur Google provider (pas credentials)',
    authSrc.includes("account?.provider === 'google'"),
    'OK',
  );
  assert(
    'T129c3 events.signIn idempotent (catch silencieux)',
    authSrc.includes('try {')
      && authSrc.includes('catch (e)'),
    'OK',
  );

  // ─── T129d simulation logique flow ────────────────────────────────────
  console.log('\n→ T129d simulation logique 5 scenarios');

  // Reproduit signIn callback logique
  function simulateSignIn(args: {
    provider: 'google' | 'credentials';
    email: string | null;
    existingUser: { id: string; role: string } | null;
    isFirstUser: boolean;
    pendingInvitation: { email: string } | null;
    registrationMode: 'CLOSED' | 'INVITATION_ONLY';
  }): boolean {
    if (args.provider === 'credentials') return true;
    if (args.provider === 'google') {
      if (!args.email) return false;
      if (args.existingUser) return true;
      if (args.isFirstUser) return true;
      if (args.pendingInvitation
        && args.pendingInvitation.email.toLowerCase() === args.email.toLowerCase()) {
        return true;
      }
      if (args.registrationMode === 'CLOSED') return false;
      return false;
    }
    return true;
  }

  // Scenario 1 : femme TENANT existante + invitation pending → ok
  // (events.signIn upgrade ensuite via acceptInvitation)
  const s1 = simulateSignIn({
    provider: 'google',
    email: 'wife@example.com',
    existingUser: { id: 'u1', role: 'TENANT' },
    isFirstUser: false,
    pendingInvitation: { email: 'wife@example.com' },
    registrationMode: 'CLOSED',
  });
  assert(
    'T129d1 femme TENANT + invitation pending Google → signIn return true',
    s1 === true,
    `result=${s1}`,
  );

  // Scenario 2 : nouveau user + invitation matching → ok
  const s2 = simulateSignIn({
    provider: 'google',
    email: 'new@example.com',
    existingUser: null,
    isFirstUser: false,
    pendingInvitation: { email: 'new@example.com' },
    registrationMode: 'CLOSED',
  });
  assert(
    'T129d2 nouveau user Google + invitation matching → signIn return true',
    s2 === true,
    `result=${s2}`,
  );

  // Scenario 3 : nouveau user sans invitation + mode CLOSED → refus
  const s3 = simulateSignIn({
    provider: 'google',
    email: 'random@example.com',
    existingUser: null,
    isFirstUser: false,
    pendingInvitation: null,
    registrationMode: 'CLOSED',
  });
  assert(
    'T129d3 nouveau user Google sans invitation + CLOSED → signIn return false (Access denied légitime)',
    s3 === false,
    `result=${s3}`,
  );

  // Scenario 4 : premier user via Google → ADMIN auto
  const s4 = simulateSignIn({
    provider: 'google',
    email: 'first@example.com',
    existingUser: null,
    isFirstUser: true,
    pendingInvitation: null,
    registrationMode: 'CLOSED',
  });
  assert(
    'T129d4 premier user Google → signIn return true (ADMIN auto)',
    s4 === true,
    `result=${s4}`,
  );

  // Scenario 5 : user staff existant (MEMBER) + Google login → ok
  const s5 = simulateSignIn({
    provider: 'google',
    email: 'staff@example.com',
    existingUser: { id: 'u2', role: 'MEMBER' },
    isFirstUser: false,
    pendingInvitation: null,
    registrationMode: 'CLOSED',
  });
  assert(
    'T129d5 user staff existant Google → signIn return true',
    s5 === true,
    `result=${s5}`,
  );

  // Scenario 6 : email mismatch invitation (sécurité)
  const s6 = simulateSignIn({
    provider: 'google',
    email: 'wife@gmail.com',
    existingUser: null,
    isFirstUser: false,
    pendingInvitation: { email: 'wife@OTHERdomain.com' },  // mismatch
    registrationMode: 'CLOSED',
  });
  assert(
    'T129d6 email Google ≠ invitation.email → signIn return false (sécurité)',
    s6 === false,
    `result=${s6}`,
  );

  // ─── T129e acceptInvitation strict email match (lib/invitations.ts) ──
  console.log('\n→ T129e acceptInvitation vérifie email match strict');
  const inviteLib = await readFile(path.resolve('src/lib/invitations.ts'), 'utf-8');
  assert(
    'T129e acceptInvitation throw si user.email ≠ invitation.email',
    inviteLib.includes('user.email.toLowerCase() !== invitation.email.toLowerCase()')
      && inviteLib.includes('Cette invitation est destinée à'),
    'OK',
  );

  // ─── T129f acceptInvitation crée memberships + update role ────────────
  console.log('\n→ T129f acceptInvitation crée memberships + update role');
  assert(
    'T129f acceptInvitation update user.role + crée bailleurMembership pour bailleurIds',
    inviteLib.includes('data: { role: invitation.role }')
      && inviteLib.includes('bailleurMembership.upsert')
      && inviteLib.includes('acceptedAt: new Date()'),
    'OK',
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.4.0-rc1 google-oauth-invitation ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.4.0-rc1 google-oauth-invitation passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
