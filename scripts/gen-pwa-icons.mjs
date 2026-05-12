#!/usr/bin/env node
/**
 * v3.5.0-rc1 — génération icons PWA depuis public/logo.svg.
 *
 * Produit (idempotent, skip si fichier existe) :
 *   - public/logo-192.png      (Android standard, fond bleu plein)
 *   - public/logo-512.png      (Android large, fond bleu plein)
 *   - public/logo-maskable-192.png   (Android adaptive, safe zone 80%)
 *   - public/logo-maskable-512.png   (idem 512)
 *   - public/logo-180.png      (Apple touch icon)
 *
 * Convention maskable : safe zone 80% = icône centrée sur 60% du canvas
 * (marge 20% top/bottom/left/right). Garantit que les variants Android
 * adaptive (cercle, squircle, rounded square) ne croppent pas le logo.
 *
 * Usage : `npm run gen:pwa-icons`. Lancé manuellement par release, pas
 * en boot (déterministe).
 */

import sharp from 'sharp';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const BG = { r: 37, g: 99, b: 235, alpha: 1 }; // #2563eb (theme color)

async function loadLogoBuffer() {
  // Priorité : logo-branded.svg (full-color, fond bleu inclus) > logo.svg
  // (monochrome currentColor, on ajoute fond bleu).
  const branded = path.join(PUBLIC_DIR, 'logo-branded.svg');
  if (existsSync(branded)) return { buf: await sharp(branded).png().toBuffer(), hasBg: true };
  const monochrome = path.join(PUBLIC_DIR, 'logo.svg');
  if (!existsSync(monochrome)) {
    throw new Error('Aucun logo.svg trouvé dans public/');
  }
  return { buf: await sharp(monochrome).png().toBuffer(), hasBg: false };
}

async function genStandard(size, outname, logo, hasBg) {
  const outPath = path.join(PUBLIC_DIR, outname);
  if (existsSync(outPath)) {
    console.log(`  [skip] ${outname} (déjà présent)`);
    return;
  }
  if (hasBg) {
    // logo-branded a déjà le fond bleu intégré, juste resize.
    await sharp(logo).resize(size, size).png().toFile(outPath);
  } else {
    // Compose icône monochrome blanche sur fond bleu plein.
    const iconResized = await sharp(logo)
      .resize(Math.round(size * 0.8), Math.round(size * 0.8), { fit: 'contain' })
      .png()
      .toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 4, background: BG },
    })
      .composite([{ input: iconResized, gravity: 'center' }])
      .png()
      .toFile(outPath);
  }
  console.log(`  [✓] ${outname} (${size}×${size})`);
}

async function genMaskable(size, outname, logo) {
  const outPath = path.join(PUBLIC_DIR, outname);
  if (existsSync(outPath)) {
    console.log(`  [skip] ${outname} (déjà présent)`);
    return;
  }
  // Maskable : safe zone 80%. Icône occupe 60% du canvas, centrée.
  const innerSize = Math.round(size * 0.6);
  const iconResized = await sharp(logo)
    .resize(innerSize, innerSize, { fit: 'contain', background: BG })
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: iconResized, gravity: 'center' }])
    .png()
    .toFile(outPath);
  console.log(`  [✓] ${outname} (${size}×${size} maskable)`);
}

async function main() {
  console.log('→ Génération PWA icons depuis public/logo*.svg');
  const { buf, hasBg } = await loadLogoBuffer();

  await genStandard(192, 'logo-192.png', buf, hasBg);
  await genStandard(512, 'logo-512.png', buf, hasBg);
  await genMaskable(192, 'logo-maskable-192.png', buf);
  await genMaskable(512, 'logo-maskable-512.png', buf);
  await genStandard(180, 'logo-180.png', buf, hasBg);

  console.log('\n✓ PWA icons générées dans public/');
}

main().catch(e => {
  console.error('Fatal :', e);
  process.exit(1);
});
