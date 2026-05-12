import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import type { Bailleur, Bien, Locataire, Quittance } from '@prisma/client';
import { formatDateFr, formatMontantPdf as formatMontant, moisLabel, montantEnLettres } from './utils';
import { formatRcsFooter } from './legal-pages';
import { decryptIfNeeded } from './uploads-crypto';
import { drawSignatureWithLogo } from './pdf-helpers';

// ─── Palette ────────────────────────────────────────────────────────────────
const TEXT = '#1a1a1a';
const TEXT_MUTED = '#6e6a73';
const TEXT_LABEL = '#9c9099';
const HEADER_BG = '#faf7f4';      // fond clair pour que les logos sombres soient lisibles
const HEADER_RULE = '#e4dfdc';
const BRAND_DEFAULT = '#1a3a5c';  // fallback si bailleur.pdfCouleur absent (cf. brandColor())
const TABLE_RULE = '#e6e0e2';
const PANEL_BG = '#f3eef0';
const ACCENT_NEG = '#a3527a';
const PAID_BG = '#dff5e1';
const PAID_FG = '#1a7a3b';
const FOOTER_BG = '#f5f1ee';

// Couleur d'accent du bailleur courant (pill, barre total, filets).
// Lit la valeur saisie côté staff > Paramètres > Apparence.
function brandColor(ctx: PdfContext): string {
  return ctx.bailleur.pdfCouleur || BRAND_DEFAULT;
}

// ─── Page geometry ──────────────────────────────────────────────────────────
const PAGE_W = 595, PAGE_H = 842;
const MARGIN = 50;
const HEADER_H = 100;
const FOOTER_H = 42;
const CONTENT_TOP = HEADER_H + 20;
const CONTENT_BOTTOM = PAGE_H - FOOTER_H - 10; // 790

export interface PdfContext {
  quittance: Quittance;
  locataire: Locataire;
  bien: Bien;
  bailleur: Bailleur;
  numero?: string;
}

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

/**
 * Résout un chemin upload (relatif Bailleur.logoUrl/signatureUrl) en
 * Buffer prêt à passer à `doc.image()`. v2.9.0 : décrypte si chiffré
 * (magic bytes ENC1), sinon legacy en clair.
 */
function resolveImageBuffer(rel: string | null | undefined): Buffer | null {
  if (!rel) return null;
  let abs: string | null = null;
  if (path.isAbsolute(rel) && fs.existsSync(rel)) abs = rel;
  if (!abs) {
    const fromUploads = path.join(UPLOADS_DIR, rel.replace(/^\/?(uploads\/)?/, ''));
    if (fs.existsSync(fromUploads)) abs = fromUploads;
  }
  if (!abs) {
    const fromPublic = path.join(process.cwd(), 'public', rel.replace(/^\//, ''));
    if (fs.existsSync(fromPublic)) abs = fromPublic;
  }
  if (!abs) return null;
  try {
    const raw = fs.readFileSync(abs);
    return decryptIfNeeded(raw);
  } catch {
    return null;
  }
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// "d'avril" / "de mai" : apostrophe avant voyelle ou h muet
function articleDe(mois: string): string {
  return /^[aeiouéèêà]/i.test(mois) ? `d'${mois}` : `de ${mois}`;
}

interface Sizes {
  partyTitle: number;
  partyAddr: number;
  rowTitle: number;
  rowSub: number;
  rowAmount: number;
  rowH: number;
  totalLabelSize: number;
  totalAmountSize: number;
  totalH: number;
  attestationSize: number;
  noteSize: number;
}

function defaultSizes(): Sizes {
  return {
    partyTitle: 14,
    partyAddr: 9.5,
    rowTitle: 11,
    rowSub: 8.5,
    rowAmount: 12,
    rowH: 30,
    totalLabelSize: 10,
    totalAmountSize: 22,
    totalH: 56,
    attestationSize: 9.5,
    noteSize: 9.5,
  };
}

function compactSizes(): Sizes {
  return {
    partyTitle: 13,
    partyAddr: 9,
    rowTitle: 10,
    rowSub: 8,
    rowAmount: 11,
    rowH: 24,
    totalLabelSize: 9,
    totalAmountSize: 20,
    totalH: 48,
    attestationSize: 8.5,
    noteSize: 8.5,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────
export function generateQuittancePdf(ctx: PdfContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const { quittance: q, bailleur } = ctx;
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        compress: process.env.PDF_TEST_MODE !== '1',
        info: {
          Title: `Quittance ${moisLabel(q.mois)} ${q.annee}`,
          Author: bailleur.nom,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const rows = buildDetailRows(ctx);
      const hasNote = !!q.commentaire;
      // Heuristique compact : 5+ lignes de détail OU note présente avec 4+ lignes
      const compact = rows.length >= 5 || (hasNote && rows.length >= 4);
      const sizes = compact ? compactSizes() : defaultSizes();

      drawHeader(doc, ctx);
      let y = drawTitleRow(doc, ctx, CONTENT_TOP);
      y = drawParties(doc, ctx, y + 16, sizes);
      y = drawBienBox(doc, ctx, y + 14);
      y = drawDetailTable(doc, ctx, y + 14, rows, sizes);
      y = drawTotalBar(doc, ctx, y + 12, sizes);
      if (hasNote) y = drawNote(doc, ctx, y + 10, sizes);
      y = drawAttestation(doc, ctx, y + 10, sizes);
      drawSignatureBlock(doc, ctx, y + 12);
      drawFooterBand(doc, ctx);

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ─── Header band (clair) ────────────────────────────────────────────────────
function drawHeader(doc: PDFKit.PDFDocument, ctx: PdfContext) {
  const { bailleur, quittance: q, numero } = ctx;

  // Fond clair + filet de séparation en bas
  doc.save();
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(HEADER_BG);
  doc.restore();
  doc.save();
  doc.rect(0, HEADER_H - 1, PAGE_W, 1).fill(HEADER_RULE);
  doc.restore();

  // Logo à gauche
  const logoPath = resolveImageBuffer(bailleur.logoUrl);
  if (logoPath) {
    try { doc.image(logoPath, MARGIN, 18, { fit: [150, 60] }); } catch {}
  } else {
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(20)
      .text(bailleur.nom, MARGIN, 38, { width: 250, lineBreak: false });
  }

  // Pill "QUITTANCE" — outline 1px brand + texte brand (pas de fill,
  // cf. PORTAIL-BRANDING.md règle 1 : pas d'aplat plein).
  const pillW = 95, pillH = 22;
  const pillX = PAGE_W - MARGIN - pillW, pillY = 14;
  const brand = brandColor(ctx);
  doc.save();
  doc.roundedRect(pillX, pillY, pillW, pillH, 11)
    .lineWidth(1).strokeColor(brand).stroke();
  doc.restore();
  doc.fillColor(brand).font('Helvetica-Bold').fontSize(7.5)
    .text('QUITTANCE', pillX, pillY + 7, { width: pillW, align: 'center', characterSpacing: 1.4 });

  // Méta-infos alignées à droite — textes foncés sur fond clair
  let mY = pillY + pillH + 6;
  const metaW = 200;
  const metaX = PAGE_W - MARGIN - metaW;
  const drawMeta = (label: string, value: string) => {
    doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(6)
      .text(label, metaX, mY, { width: metaW, align: 'right', characterSpacing: 1.1, lineBreak: false });
    mY += 7;
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9)
      .text(value, metaX, mY, { width: metaW, align: 'right', lineBreak: false });
    mY += 11;
  };
  drawMeta('PÉRIODE', `${moisLabel(q.mois)} ${q.annee}`);
  drawMeta('ÉMIS LE', formatDateFr(q.dateEmission).replace(/\//g, ' / '));
  drawMeta('N°', numero ?? '—');
}

// ─── Title row ──────────────────────────────────────────────────────────────
function drawTitleRow(doc: PDFKit.PDFDocument, ctx: PdfContext, y: number): number {
  const { quittance: q } = ctx;

  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('DOCUMENT', MARGIN, y, { characterSpacing: 1.4, lineBreak: false });
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(26)
    .text('Quittance de loyer', MARGIN, y + 10, { lineBreak: false });
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(12)
    .text(`${moisLabel(q.mois)} ${q.annee}`, MARGIN, y + 44);

  // Pill PAYÉ à droite, alignée verticalement avec le titre
  const label = `PAYÉ · ${formatMontant(q.montantTotal)}`;
  doc.font('Helvetica-Bold').fontSize(9);
  const lblW = doc.widthOfString(label);
  const w = lblW + 30;
  const pillH = 22;
  const pillX = PAGE_W - MARGIN - w;
  const pillY = y + 14;
  doc.save();
  doc.roundedRect(pillX, pillY, w, pillH, 11).fill(PAID_BG);
  doc.restore();
  doc.fillColor(PAID_FG).circle(pillX + 12, pillY + pillH / 2, 3).fill();
  doc.fillColor(PAID_FG).font('Helvetica-Bold').fontSize(9)
    .text(label, pillX + 22, pillY + (pillH - 9) / 2, { lineBreak: false });

  return y + 64;
}

// ─── DE / POUR ──────────────────────────────────────────────────────────────
function drawParties(doc: PDFKit.PDFDocument, ctx: PdfContext, y: number, s: Sizes): number {
  const { bailleur, locataire, bien } = ctx;
  const colW = (PAGE_W - MARGIN * 2 - 30) / 2;
  const xL = MARGIN, xR = MARGIN + colW + 30;

  // DE
  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('DE', xL, y, { characterSpacing: 1.4, lineBreak: false });
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(s.partyTitle)
    .text(bailleur.nom, xL, y + 12, { width: colW, lineBreak: false, ellipsis: true });
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(s.partyAddr)
    .text(`${bailleur.adresseLigne1}, ${bailleur.adresseLigne2}`, xL, y + 30, { width: colW });
  let leftY = doc.y + 1;
  if (bailleur.rcs) {
    doc.text(bailleur.rcs, xL, leftY, { width: colW });
    leftY = doc.y;
  }

  // POUR
  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('POUR', xR, y, { characterSpacing: 1.4, lineBreak: false });
  const fullName = `${locataire.nom} ${locataire.prenom}`;
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(s.partyTitle)
    .text(fullName, xR, y + 12, { width: colW, lineBreak: false, ellipsis: true });
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(s.partyAddr)
    .text(bien.adresse, xR, y + 30, { width: colW });
  let rightY = doc.y;
  if (bien.complement) {
    doc.text(bien.complement, xR, rightY + 1, { width: colW });
    rightY = doc.y;
  }
  doc.text(`${bien.codePostal} ${capitalize(bien.ville)}`, xR, rightY + 1, { width: colW });
  rightY = doc.y;

  return Math.max(leftY, rightY);
}

// ─── Bien loué + Date paiement ──────────────────────────────────────────────
function drawBienBox(doc: PDFKit.PDFDocument, ctx: PdfContext, y: number): number {
  const { bien, quittance: q } = ctx;
  const x = MARGIN, w = PAGE_W - MARGIN * 2, h = 50;

  doc.save();
  doc.roundedRect(x, y, w, h, 6).fill(PANEL_BG);
  doc.rect(x, y, 3, h).fill(brandColor(ctx));
  doc.restore();

  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('BIEN LOUÉ', x + 18, y + 10, { characterSpacing: 1.4, lineBreak: false });
  const adresse = bien.complement
    ? `${bien.adresse}, ${bien.complement} — ${bien.codePostal} ${capitalize(bien.ville)}`
    : `${bien.adresse} — ${bien.codePostal} ${capitalize(bien.ville)}`;
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(11)
    .text(adresse, x + 18, y + 24, { width: w * 0.58 - 18, lineBreak: false, ellipsis: true });

  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('DATE DE PAIEMENT', x + w - 200 - 18, y + 10, { width: 200, align: 'right', characterSpacing: 1.4, lineBreak: false });
  const dp = new Date(q.datePaiement);
  const dpLabel = `${dp.getDate().toString().padStart(2, '0')} ${moisLabel(dp.getMonth() + 1).toLowerCase()} ${dp.getFullYear()}`;
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(11)
    .text(dpLabel, x + w - 200 - 18, y + 24, { width: 200, align: 'right', lineBreak: false });

  return y + h;
}

// ─── Detail table ───────────────────────────────────────────────────────────
interface Row { title: string; sub?: string; amount: number; color?: string }

function buildDetailRows(ctx: PdfContext): Row[] {
  const q = ctx.quittance;
  const rows: Row[] = [
    { title: 'Loyer nu', sub: 'Loyer hors charges', amount: q.loyerNu },
    { title: 'Charges / Provisions de charges', sub: 'Provisions mensuelles', amount: q.charges },
  ];
  if ((q.avoirAppliqueLoyer ?? 0) > 0) {
    rows.push({ title: 'Avoir reporté sur loyer', sub: 'Régularisation période précédente', amount: -q.avoirAppliqueLoyer, color: ACCENT_NEG });
  }
  if ((q.avoirAppliqueCharges ?? 0) > 0) {
    rows.push({ title: 'Avoir reporté sur charges', sub: 'Régularisation période précédente', amount: -q.avoirAppliqueCharges, color: ACCENT_NEG });
  }
  if (q.montantPercu != null && Math.abs(q.montantPercu - q.montantTotal) > 0.005) {
    rows.push({ title: 'Somme perçue', sub: 'Versement du locataire', amount: q.montantPercu, color: PAID_FG });
  }
  if ((q.surplusLoyer ?? 0) > 0) {
    rows.push({ title: 'Trop-perçu sur loyer', sub: 'À reporter au mois suivant', amount: q.surplusLoyer, color: '#a06000' });
  }
  if ((q.surplusCharges ?? 0) > 0) {
    rows.push({ title: 'Trop-perçu sur charges', sub: 'À reporter au mois suivant', amount: q.surplusCharges, color: '#a06000' });
  }
  return rows;
}

function drawDetailTable(doc: PDFKit.PDFDocument, ctx: PdfContext, y: number, rows: Row[], s: Sizes): number {
  const x = MARGIN, w = PAGE_W - MARGIN * 2;

  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('DÉTAIL', x, y, { characterSpacing: 1.4, lineBreak: false });
  doc.text('MONTANT', x, y, { width: w, align: 'right', characterSpacing: 1.4, lineBreak: false });
  y += 12;
  doc.save().moveTo(x, y).lineTo(x + w, y).strokeColor(TABLE_RULE).lineWidth(0.7).stroke().restore();
  y += 10;

  for (const r of rows) {
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(s.rowTitle)
      .text(r.title, x, y, { width: w * 0.62, lineBreak: false, ellipsis: true });
    if (r.sub) {
      doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(s.rowSub)
        .text(r.sub, x, y + s.rowTitle + 2, { width: w * 0.62, lineBreak: false, ellipsis: true });
    }
    const amountText = (r.amount < 0 ? '− ' : '') + formatMontant(Math.abs(r.amount));
    doc.fillColor(r.color ?? TEXT).font('Helvetica-Bold').fontSize(s.rowAmount)
      .text(amountText, x, y + 3, { width: w, align: 'right', lineBreak: false });
    y += s.rowH;
    doc.save().moveTo(x, y - 2).lineTo(x + w, y - 2).strokeColor(TABLE_RULE).lineWidth(0.5).stroke().restore();
  }
  return y;
}

// ─── Total bar ──────────────────────────────────────────────────────────────
// Bg neutre clair + bordure 2px brand + texte brand (cf. PORTAIL-BRANDING.md
// règle 1 : pas d'aplat plein de la couleur). Le label "MONTANT TOTAL"
// reste en TEXT_LABEL pour cohérence avec les autres labels uppercase.
function drawTotalBar(doc: PDFKit.PDFDocument, ctx: PdfContext, y: number, s: Sizes): number {
  const { quittance: q } = ctx;
  const x = MARGIN, w = PAGE_W - MARGIN * 2, h = s.totalH;
  const brand = brandColor(ctx);

  doc.save();
  doc.roundedRect(x, y, w, h, 6).fill(HEADER_BG);
  doc.roundedRect(x, y, w, h, 6).lineWidth(2).strokeColor(brand).stroke();
  doc.restore();

  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('MONTANT TOTAL ACQUITTÉ', x + 18, y + 10, { characterSpacing: 1.4, lineBreak: false });
  doc.fillColor(TEXT_MUTED).font('Helvetica-Oblique').fontSize(s.totalLabelSize)
    .text(capitalize(montantEnLettres(q.montantTotal)), x + 18, y + 24, {
      width: w * 0.55, lineBreak: false, ellipsis: true,
    });
  doc.fillColor(brand).font('Helvetica-Bold').fontSize(s.totalAmountSize)
    .text(formatMontant(q.montantTotal), x, y + (h - s.totalAmountSize) / 2 - 2, {
      width: w - 18, align: 'right', lineBreak: false,
    });

  return y + h;
}

// ─── Note ───────────────────────────────────────────────────────────────────
function drawNote(doc: PDFKit.PDFDocument, ctx: PdfContext, y: number, s: Sizes): number {
  const { quittance: q } = ctx;
  if (!q.commentaire) return y;
  const x = MARGIN, w = PAGE_W - MARGIN * 2;
  const labelW = 50;

  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('NOTE', x, y + 2, { characterSpacing: 1.4, lineBreak: false });
  doc.fillColor(TEXT).font('Helvetica').fontSize(s.noteSize)
    .text(q.commentaire, x + labelW, y, { width: w - labelW });
  return doc.y;
}

// ─── Attestation ────────────────────────────────────────────────────────────
function drawAttestation(doc: PDFKit.PDFDocument, ctx: PdfContext, y: number, s: Sizes): number {
  const { quittance: q, bailleur, locataire } = ctx;
  const x = MARGIN, w = PAGE_W - MARGIN * 2;

  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('ATTESTATION', x, y, { characterSpacing: 1.4, lineBreak: false });

  const fullName = `${locataire.nom} ${locataire.prenom}`;
  const moisLib = `${moisLabel(q.mois).toLowerCase()} ${q.annee}`;
  const text = `Le bailleur, ${bailleur.nom}, déclare avoir reçu de ${fullName} la somme de ${montantEnLettres(q.montantTotal)} au titre du loyer et des charges du bien désigné ci-dessus pour la période ${articleDe(moisLib)}, et lui en donne quittance, sous réserve de tous droits.`;
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(s.attestationSize)
    .text(text, x, y + 12, { width: w, align: 'left' });
  return doc.y;
}

// ─── Signature block (Fait à + Signature) ──────────────────────────────────
function drawSignatureBlock(doc: PDFKit.PDFDocument, ctx: PdfContext, y: number) {
  const { bailleur, quittance: q } = ctx;
  const x = MARGIN, w = PAGE_W - MARGIN * 2;
  const colW = w / 2;

  // Plafonne au-dessus du footer band, mais laisse ~75pt pour le bloc
  const maxStartY = CONTENT_BOTTOM - 78;
  const startY = Math.min(y, maxStartY);

  // Colonne gauche : FAIT À
  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('FAIT À', x, startY, { characterSpacing: 1.4, lineBreak: false });
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(11)
    .text(bailleur.villeSignature, x, startY + 12, { width: colW, lineBreak: false, ellipsis: true });
  const de = new Date(q.dateEmission);
  const deLabel = `le ${de.getDate().toString().padStart(2, '0')} ${moisLabel(de.getMonth() + 1).toLowerCase()} ${de.getFullYear()}`;
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(10)
    .text(deLabel, x, startY + 28, { lineBreak: false });

  // Colonne droite : SIGNATURE
  const sigColX = x + colW;
  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(7)
    .text('SIGNATURE', sigColX, startY, { characterSpacing: 1.4, lineBreak: false });

  const logoPath = resolveImageBuffer(bailleur.logoUrl);
  const sigPath = resolveImageBuffer(bailleur.signatureUrl);

  drawSignatureWithLogo({
    doc,
    bailleur,
    logoBuf: logoPath,
    signatureBuf: sigPath,
    x: sigColX,
    y: startY + 12,
    logoFit: [100, 44],
    signatureFit: [70, 36],
    signatureOffset: [8, 6],
  });

  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(8)
    .text(`Représentant légal · ${bailleur.nom}`, sigColX, startY + 60, { width: colW, lineBreak: false, ellipsis: true });
}

// ─── Footer band ────────────────────────────────────────────────────────────
function drawFooterBand(doc: PDFKit.PDFDocument, ctx: PdfContext) {
  const { bailleur } = ctx;
  const y0 = PAGE_H - FOOTER_H;

  doc.save();
  doc.rect(0, y0, PAGE_W, FOOTER_H).fill(FOOTER_BG);
  doc.restore();

  const cy = y0 + 12;
  const colW = (PAGE_W - MARGIN * 2 - 20) / 2;

  // Col 1 : nom + adresse SCI
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(8)
    .text(bailleur.nom, MARGIN, cy, { width: colW, lineBreak: false, ellipsis: true });
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(7.5)
    .text(`${bailleur.adresseLigne1}, ${bailleur.adresseLigne2}`, MARGIN, cy + 11, { width: colW, lineBreak: false, ellipsis: true });

  // Col 2 : RCS / SIRET + mention légale.
  // v2.8.0-rc3 : helper formatRcsFooter lit siret + raisonSociale +
  // adresseLegale (onglet Légal) ; fallback ancien rcs string si absent.
  const col2X = PAGE_W - MARGIN - colW;
  const footerLine = formatRcsFooter(bailleur);
  if (footerLine) {
    doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(7.5)
      .text(footerLine, col2X, cy, { width: colW, align: 'right', lineBreak: false, ellipsis: true });
  }
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(7.5)
    .text('Loi n° 89-462 du 6 juillet 1989, art. 21 — Quittance à conserver 3 ans.', col2X, cy + 11, {
      width: colW, align: 'right', lineBreak: false, ellipsis: true,
    });
}
