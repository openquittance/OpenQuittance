import type { Bailleur } from '@prisma/client';

/**
 * v3.0.1 — helper unifié pour la zone signature des PDFs.
 *
 * Superpose le logo bailleur (atténué via `bailleur.signatureLogoOpacity`)
 * et la signature manuscrite par-dessus. Utilisé par tous les générateurs
 * PDF (quittance, avis d'échéance, dépôt garantie, EDL, courrier IRL).
 *
 * `signatureLogoOpacity` est en pourcent (0-100). 30 = logo très atténué,
 * signature manuscrite reste pleinement lisible. 0 = logo invisible
 * (signature seule), 100 = logo opaque (signature peu visible).
 *
 * Le `doc.save()` / `doc.restore()` autour de l'image logo isole le
 * changement d'opacité — pas besoin de restore opacity manuel et
 * indépendant de l'état antérieur du document.
 */
export interface SignatureLogoArgs {
  doc: PDFKit.PDFDocument;
  bailleur: Pick<Bailleur, 'signatureLogoOpacity'>;
  logoBuf: Buffer | null;
  signatureBuf: Buffer | null;
  x: number;
  y: number;
  logoFit: [number, number];
  signatureFit: [number, number];
  /** Offset de la signature manuscrite par rapport à (x, y) du logo. */
  signatureOffset?: [number, number];
}

export function drawSignatureWithLogo(args: SignatureLogoArgs): void {
  const { doc, bailleur, logoBuf, signatureBuf, x, y, logoFit, signatureFit } = args;
  const [sox, soy] = args.signatureOffset ?? [8, 6];
  const opacityPct = bailleur.signatureLogoOpacity ?? 30;
  const opacity = Math.max(0, Math.min(100, opacityPct)) / 100;

  if (logoBuf) {
    doc.save();
    try {
      doc.opacity(opacity);
      doc.image(logoBuf, x, y, { fit: logoFit });
    } catch {
      // ignore image errors (format non supporté, buffer corrompu)
    }
    doc.restore();
  }

  if (signatureBuf) {
    try {
      doc.image(signatureBuf, x + sox, y + soy, { fit: signatureFit });
    } catch {
      // ignore
    }
  }
}
