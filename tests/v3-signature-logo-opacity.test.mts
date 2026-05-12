/**
 * Tests v3.0.1 — opacité logo zone signature paramétrable.
 *
 * T78 Zod schema POST accepte signatureLogoOpacity=50
 * T79 Zod schema PUT (.partial()) accepte signatureLogoOpacity=80
 * T80 Zod rejette signatureLogoOpacity hors [0, 100] (négatif + > 100 + non-int)
 * T81 helper drawSignatureWithLogo applique doc.opacity selon bailleur.signatureLogoOpacity
 * T82 régression — pdf-generator + pdf-documents importent drawSignatureWithLogo
 *
 * Pure tests — pas de stack HTTP, pas de Postgres.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { bailleurSchema, bailleurUpdateSchema } from '../src/lib/validation.ts';
import { drawSignatureWithLogo } from '../src/lib/pdf-helpers.ts';

const results: Array<{ ok: boolean; name: string }> = [];
function assert(name: string, cond: boolean, detail?: string) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

const validBase = {
  nom: 'SCI Test',
  adresseLigne1: '1 rue Exemple',
  adresseLigne2: '75001 Paris',
  villeSignature: 'Paris',
};

async function main() {
  // ─── T78 POST schema accepte signatureLogoOpacity=50 ──────────────────
  console.log('\n→ T78 bailleurSchema accepte signatureLogoOpacity=50');
  const t78 = bailleurSchema.safeParse({ ...validBase, signatureLogoOpacity: 50 });
  assert(
    'T78 POST accepte signatureLogoOpacity=50',
    t78.success && t78.data.signatureLogoOpacity === 50,
    t78.success ? `data.signatureLogoOpacity=${t78.data.signatureLogoOpacity}` : `error=${JSON.stringify(t78.error.issues)}`,
  );

  // ─── T79 PUT schema (.partial()) accepte signatureLogoOpacity=80 ──────
  console.log('\n→ T79 bailleurUpdateSchema accepte signatureLogoOpacity=80');
  const t79 = bailleurUpdateSchema.safeParse({ signatureLogoOpacity: 80 });
  assert(
    'T79 PUT accepte signatureLogoOpacity=80 (partial)',
    t79.success && t79.data.signatureLogoOpacity === 80,
    t79.success ? `data.signatureLogoOpacity=${t79.data.signatureLogoOpacity}` : `error=${JSON.stringify(t79.error.issues)}`,
  );

  // ─── T80 hors [0, 100] rejeté ─────────────────────────────────────────
  console.log('\n→ T80 signatureLogoOpacity hors [0, 100] rejeté');
  const t80a = bailleurUpdateSchema.safeParse({ signatureLogoOpacity: -1 });
  const t80b = bailleurUpdateSchema.safeParse({ signatureLogoOpacity: 101 });
  const t80c = bailleurUpdateSchema.safeParse({ signatureLogoOpacity: 30.5 });
  const t80d = bailleurUpdateSchema.safeParse({ signatureLogoOpacity: 0 });
  const t80e = bailleurUpdateSchema.safeParse({ signatureLogoOpacity: 100 });
  assert(
    'T80a -1 rejeté',
    !t80a.success,
    t80a.success ? 'a accepté -1 (bug)' : 'OK',
  );
  assert(
    'T80b 101 rejeté',
    !t80b.success,
    t80b.success ? 'a accepté 101 (bug)' : 'OK',
  );
  assert(
    'T80c 30.5 rejeté (non-int)',
    !t80c.success,
    t80c.success ? 'a accepté 30.5 (bug)' : 'OK',
  );
  assert(
    'T80d bornes 0 acceptée',
    t80d.success,
    t80d.success ? 'OK' : `rejet inattendu : ${JSON.stringify(t80d.error.issues)}`,
  );
  assert(
    'T80e bornes 100 acceptée',
    t80e.success,
    t80e.success ? 'OK' : `rejet inattendu : ${JSON.stringify(t80e.error.issues)}`,
  );

  // ─── T81 helper applique doc.opacity selon bailleur.signatureLogoOpacity ─
  console.log('\n→ T81 drawSignatureWithLogo applique bien doc.opacity');
  type Call = { fn: string; args: unknown[] };
  function makeMockDoc() {
    const calls: Call[] = [];
    const doc: any = {
      _calls: calls,
      save() { calls.push({ fn: 'save', args: [] }); return doc; },
      restore() { calls.push({ fn: 'restore', args: [] }); return doc; },
      opacity(v: number) { calls.push({ fn: 'opacity', args: [v] }); return doc; },
      image(buf: any, x: number, y: number, opts: any) {
        calls.push({ fn: 'image', args: [buf, x, y, opts] });
        return doc;
      },
    };
    return doc;
  }

  // Cas 1 : opacity 30 → doc.opacity(0.3) appelée avant logo image
  {
    const doc = makeMockDoc();
    drawSignatureWithLogo({
      doc,
      bailleur: { signatureLogoOpacity: 30 },
      logoBuf: Buffer.from('logo'),
      signatureBuf: Buffer.from('sig'),
      x: 100, y: 100,
      logoFit: [100, 44],
      signatureFit: [70, 36],
      signatureOffset: [8, 6],
    });
    const seq = doc._calls.map((c: Call) => c.fn).join(',');
    const opacityCall = doc._calls.find((c: Call) => c.fn === 'opacity');
    assert(
      'T81a opacity=30 → doc.opacity(0.3) + save/restore autour du logo',
      seq === 'save,opacity,image,restore,image' && opacityCall?.args[0] === 0.3,
      `seq=${seq} opacity=${opacityCall?.args[0]}`,
    );
  }

  // Cas 2 : opacity 80 → doc.opacity(0.8)
  {
    const doc = makeMockDoc();
    drawSignatureWithLogo({
      doc,
      bailleur: { signatureLogoOpacity: 80 },
      logoBuf: Buffer.from('logo'),
      signatureBuf: null,
      x: 0, y: 0,
      logoFit: [100, 44],
      signatureFit: [70, 36],
    });
    const opacityCall = doc._calls.find((c: Call) => c.fn === 'opacity');
    assert(
      'T81b opacity=80 → doc.opacity(0.8)',
      opacityCall?.args[0] === 0.8,
      `opacity=${opacityCall?.args[0]}`,
    );
  }

  // Cas 3 : pas de logo → pas de save/opacity/restore (signature seule possible)
  {
    const doc = makeMockDoc();
    drawSignatureWithLogo({
      doc,
      bailleur: { signatureLogoOpacity: 50 },
      logoBuf: null,
      signatureBuf: Buffer.from('sig'),
      x: 0, y: 0,
      logoFit: [100, 44],
      signatureFit: [70, 36],
    });
    const seq = doc._calls.map((c: Call) => c.fn).join(',');
    assert(
      'T81c logoBuf null → aucun appel opacity',
      seq === 'image' && !doc._calls.some((c: Call) => c.fn === 'opacity'),
      `seq=${seq}`,
    );
  }

  // Cas 4 : null/undefined opacity → fallback 30 (= 0.3)
  {
    const doc = makeMockDoc();
    drawSignatureWithLogo({
      doc,
      bailleur: { signatureLogoOpacity: null as any },
      logoBuf: Buffer.from('logo'),
      signatureBuf: null,
      x: 0, y: 0,
      logoFit: [100, 44],
      signatureFit: [70, 36],
    });
    const opacityCall = doc._calls.find((c: Call) => c.fn === 'opacity');
    assert(
      'T81d opacity null → fallback 30 (0.3)',
      opacityCall?.args[0] === 0.3,
      `opacity=${opacityCall?.args[0]}`,
    );
  }

  // ─── T82 régression — pdf-generator + pdf-documents importent helper ───
  console.log('\n→ T82 régression — générateurs PDF importent drawSignatureWithLogo');
  const generatorSrc = await readFile(
    path.resolve('src/lib/pdf-generator.ts'),
    'utf-8',
  );
  const documentsSrc = await readFile(
    path.resolve('src/lib/pdf-documents.ts'),
    'utf-8',
  );
  const t82a = generatorSrc.includes("from './pdf-helpers'")
    && generatorSrc.includes('drawSignatureWithLogo(');
  const t82b = documentsSrc.includes("from './pdf-helpers'")
    && documentsSrc.includes('drawSignatureWithLogo(');
  assert(
    'T82a pdf-generator.ts importe + appelle drawSignatureWithLogo',
    t82a,
    `import=${generatorSrc.includes("from './pdf-helpers'")} call=${generatorSrc.includes('drawSignatureWithLogo(')}`,
  );
  assert(
    'T82b pdf-documents.ts importe + appelle drawSignatureWithLogo',
    t82b,
    `import=${documentsSrc.includes("from './pdf-helpers'")} call=${documentsSrc.includes('drawSignatureWithLogo(')}`,
  );

  // Vérif anti-régression : aucun générateur ne fait doc.image(logoPath/sigPath)
  // directement dans la zone signature (pour forcer l'usage du helper).
  // On tolère encore les doc.image dans drawHeader (logo header, hors zone sig).
  const sigBlockGen = generatorSrc.match(/function drawSignatureBlock[\s\S]*?\n}/);
  const sigBlockDoc = documentsSrc.match(/function drawSignature[\s\S]*?\n}/);
  const t82c = sigBlockGen
    && !sigBlockGen[0].match(/doc\.image\(/);
  const t82d = sigBlockDoc
    && !sigBlockDoc[0].match(/doc\.image\(/);
  assert(
    'T82c drawSignatureBlock (pdf-generator) n\'appelle plus doc.image directement',
    !!t82c,
    sigBlockGen ? 'OK' : 'function not found',
  );
  assert(
    'T82d drawSignature (pdf-documents) n\'appelle plus doc.image directement',
    !!t82d,
    sigBlockDoc ? 'OK' : 'function not found',
  );

  // ─── Résumé ───────────────────────────────────────────────────────────
  console.log('\nRésumé :');
  const passed = results.filter(r => r.ok).length;
  console.log(`  ${passed}/${results.length} tests passent`);
  if (passed !== results.length) {
    console.error('\n✗ Tests v3.0.1 signature-logo-opacity ont échoué.');
    process.exit(1);
  }
  console.log('\n✓ Tests v3.0.1 signature-logo-opacity passent.');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
