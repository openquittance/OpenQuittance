/**
 * Tests E2E email léger / classique selon les toggles Phase 1.
 *
 * Lance : DATABASE_URL=... NEXTAUTH_SECRET=... npx tsx tests/email-leger.test.mts
 *
 * Cible le contrat : si Locataire.portailActif=true ET partageQuittances=true,
 * `buildQuittanceEmail` doit produire un email léger (pas de PDF en PJ,
 * sujet court, lien vers /portail). Sinon comportement classique.
 *
 * Approche : tests unitaires sur la pure fonction `buildQuittanceEmail`
 * exportée depuis lib/email/index.ts. Pas besoin de mock sender — on
 * vérifie le retour directement (subject + bodies + pdfBuffer présent/absent).
 */

import { PrismaClient } from '@prisma/client';
import { buildQuittanceEmail } from '../src/lib/email/index.js';

const prisma = new PrismaClient();

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

async function main() {
  process.env.NEXTAUTH_URL = 'http://localhost:3800';

  console.log('→ Setup : 1 bailleur + 1 locataire + 1 quittance');
  await prisma.locataire.deleteMany({ where: { nom: 'EmailTest' } });
  await prisma.bailleur.deleteMany({ where: { nom: 'Email Test' } });

  const bailleur = await prisma.bailleur.create({
    data: { nom: 'Email Test', adresseLigne1: '1 r', adresseLigne2: '75001 Paris', villeSignature: 'Paris', pdfCouleur: '#1a3a5c' },
  });
  const bien = await prisma.bien.create({
    data: { bailleurId: bailleur.id, nom: 'Bien E', adresse: '1', codePostal: '75001', ville: 'Paris' },
  });
  const locataire = await prisma.locataire.create({
    data: {
      bienId: bien.id, nom: 'EmailTest', prenom: 'Alice',
      email: 'alice@test.local',
      loyerNu: 500, charges: 50, dateEntree: new Date('2024-01-01'),
      portailActif: false,
    },
  });
  const quittance = await prisma.quittance.create({
    data: {
      locataireId: locataire.id, mois: 5, annee: 2026,
      loyerNu: 500, charges: 50, montantTotal: 550,
      datePaiement: new Date('2026-05-05'), dateEmission: new Date('2026-05-01'),
    },
  });

  const fakeParametres = {
    emailObjetTemplate: 'Quittance {mois} {annee} - {bailleur}',
    emailCorpsTemplate: 'Bonjour {prenom},\n\nVeuillez trouver ci-joint votre quittance pour {mois} {annee}.\n\nCordialement,\n{bailleur}',
    emailSignatureHtml: null,
  };

  const fetchQuittance = () => prisma.quittance.findUnique({
    where: { id: quittance.id },
    include: { locataire: { include: { bien: { include: { bailleur: true } } } } },
  });

  // ─── Test 1 : portail OFF → email classique avec PDF ──────────────────
  console.log('\n→ Test 1 : portailActif=false → email classique avec PDF en PJ');
  await prisma.locataire.update({
    where: { id: locataire.id },
    data: { portailActif: false },
  });
  const q1 = await fetchQuittance();
  const c1 = await buildQuittanceEmail({ quittance: q1!, parametres: fakeParametres });
  assert(
    'Email classique : portailMode=false + pdfBuffer >1KB + pdfFilename Quittance_*',
    c1.portailMode === false
    && Buffer.isBuffer(c1.pdfBuffer)
    && (c1.pdfBuffer?.length ?? 0) > 1000
    && (c1.pdfFilename ?? '').startsWith('Quittance_'),
    `mode=${c1.portailMode} pdfSize=${c1.pdfBuffer?.length} filename=${c1.pdfFilename}`,
  );

  // ─── Test 2 : portail ON + partageQuittances=true → email léger ───────
  console.log('\n→ Test 2 : portailActif+partageQuittances → léger SANS PDF + bouton portail');
  await prisma.locataire.update({
    where: { id: locataire.id },
    data: { portailActif: true, partageQuittances: true },
  });
  const q2 = await fetchQuittance();
  const c2 = await buildQuittanceEmail({ quittance: q2!, parametres: fakeParametres });
  const html2 = c2.htmlBody ?? '';
  assert(
    'Email léger : portailMode=true + pas de pdfBuffer + sujet "disponible" + bouton + header bandeau couleur charte (v2.4.1)',
    c2.portailMode === true
    && c2.pdfBuffer === undefined
    && c2.pdfFilename === undefined
    && c2.subject.includes('disponible')
    && html2.includes('Accéder à mes documents')
    && c2.textBody.includes('espace en ligne')
    && html2.includes('border-top:4px solid #1a3a5c')
    && html2.indexOf('Email Test') < html2.indexOf('Bonjour Alice'),
    `mode=${c2.portailMode} hasPdf=${!!c2.pdfBuffer} subject="${c2.subject.slice(0, 80)}"`,
  );

  // ─── Test 3 : portail ON + partageQuittances=false → email classique ──
  console.log('\n→ Test 3 : portailActif=true mais partageQuittances=false → classique avec PDF');
  await prisma.locataire.update({
    where: { id: locataire.id },
    data: { portailActif: true, partageQuittances: false },
  });
  const q3 = await fetchQuittance();
  const c3 = await buildQuittanceEmail({ quittance: q3!, parametres: fakeParametres });
  assert(
    'Toggle partageQuittances=false → fallback email classique avec PDF',
    c3.portailMode === false && Buffer.isBuffer(c3.pdfBuffer),
    `mode=${c3.portailMode} hasPdf=${!!c3.pdfBuffer}`,
  );

  // ─── Test 4 : email classique HTML harmonisé (Phase 5) ─────────────────
  // Filet contre régression du redesign Phase 5 : email classique
  // doit produire un htmlBody avec la même shell que l'email léger
  // (max-width 560px + footer "Propulsé par Quittances"). Avant Phase 5,
  // htmlBody était undefined sans signatureHtml — mismatch UX avec léger.
  console.log('\n→ Test 4 : email classique HTML — shell harmonisé + footer Quittances');
  await prisma.locataire.update({
    where: { id: locataire.id },
    data: { portailActif: false, partageQuittances: false },
  });
  const q4 = await fetchQuittance();
  const c4 = await buildQuittanceEmail({ quittance: q4!, parametres: fakeParametres });
  const html4 = c4.htmlBody ?? '';
  assert(
    'Email classique HTML : shell + footer + hint PJ + body + header bandeau couleur charte (v2.4.1)',
    c4.portailMode === false
    && c4.htmlBody !== undefined
    && html4.includes('max-width:560px')
    && html4.includes('Propulsé par')
    && html4.includes('quittances-app')
    && html4.includes('Quittance PDF jointe')
    && html4.includes('Bonjour Alice')
    && html4.includes('border-top:4px solid #1a3a5c')
    && html4.includes('color:#1a3a5c')
    && html4.indexOf('Email Test') < html4.indexOf('Bonjour Alice'),
    `mode=${c4.portailMode} hasHtml=${!!c4.htmlBody} len=${html4.length}`,
  );

  // ─── Test 5 : signatureHtml user injectée si fournie ──────────────────
  console.log('\n→ Test 5 : signatureHtml user injectée dans la shell');
  const c5 = await buildQuittanceEmail({
    quittance: q4!,
    parametres: { ...fakeParametres, emailSignatureHtml: '<p>Signature custom user</p>' },
  });
  const html5 = c5.htmlBody ?? '';
  assert(
    'Email classique HTML : signatureHtml custom user présente entre body et footer + après le header bandeau',
    html5.includes('Signature custom user')
    && html5.includes('Propulsé par')
    && html5.indexOf('Signature custom user') < html5.indexOf('Propulsé par')
    && html5.indexOf('border-top:4px') < html5.indexOf('Signature custom user'),
    `hasSig=${html5.includes('Signature custom user')}`,
  );

  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  await prisma.$disconnect();
  if (passed !== results.length) {
    console.error('\n✗ Tests email-leger ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests email-leger passent.');
}

main().catch(async e => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
