import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import type { Bailleur, Bien, Locataire } from '@prisma/client';
import { formatDateFr, formatMontantPdf as formatMontant, moisLabel, montantEnLettres } from './utils';
import { decryptIfNeeded } from './uploads-crypto';
import { drawSignatureWithLogo } from './pdf-helpers';

// Générateurs PDF pour les documents locatifs autres que la quittance :
// - Avis d'échéance (appel de loyer avant paiement)
// - Quittance de dépôt de garantie
// - État des lieux (entrée / sortie)
//
// On reproduit la même esthétique que pdf-generator.ts (palette, typographie,
// header personnalisable). Les helpers de bas niveau sont dupliqués pour ne
// pas perturber le générateur de quittance v1 existant.

const TEXT = '#1a1a1a';
const TEXT_MUTED = '#6e6a73';
const TEXT_LABEL = '#9c9099';
const HEADER_BG = '#faf7f4';
const HEADER_RULE = '#e4dfdc';
const BRAND_DEFAULT = '#1a3a5c';
const PANEL_BG = '#f3eef0';
const TABLE_RULE = '#e6e0e2';
const FOOTER_BG = '#f5f1ee';

// Couleur d'accent du bailleur courant. Cf. docs/PORTAIL-BRANDING.md règle 1
// (pas d'aplat plein) : utilisée pour bordures, titres et texte d'accent —
// jamais comme fond plein d'un grand bloc.
function brand(bailleur: Bailleur): string {
  return bailleur.pdfCouleur || BRAND_DEFAULT;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const HEADER_H = 100;
const FOOTER_H = 42;
const CONTENT_TOP = HEADER_H + 20;
const CONTENT_BOTTOM = PAGE_H - FOOTER_H - 10;

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

/**
 * Résout en Buffer (déchiffré si nécessaire) — v2.9.0 chiffrement uploads.
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

function drawHeader(doc: PDFKit.PDFDocument, bailleur: Bailleur, title: string) {
  doc.save();
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(HEADER_BG);
  doc.fillColor(HEADER_RULE).rect(0, HEADER_H, PAGE_W, 1).fill();

  // Logo gauche si présent
  const logoPath = resolveImageBuffer(bailleur.logoUrl);
  if (logoPath) {
    try {
      doc.image(logoPath, MARGIN, 25, { fit: [120, 50] });
    } catch {
      // ignore image errors
    }
  }

  // Titre + nom bailleur à droite
  doc.fillColor(brand(bailleur)).font('Helvetica-Bold').fontSize(13)
    .text(title.toUpperCase(), 0, 30, { width: PAGE_W - MARGIN, align: 'right' });
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
    .text(bailleur.nom, 0, 50, { width: PAGE_W - MARGIN, align: 'right' });
  if (bailleur.adresseLigne1) {
    doc.text(bailleur.adresseLigne1, 0, 63, { width: PAGE_W - MARGIN, align: 'right' });
  }
  if (bailleur.adresseLigne2) {
    doc.text(bailleur.adresseLigne2, 0, 76, { width: PAGE_W - MARGIN, align: 'right' });
  }

  doc.restore();
}

function drawFooter(doc: PDFKit.PDFDocument, text: string) {
  doc.save();
  doc.rect(0, PAGE_H - FOOTER_H, PAGE_W, FOOTER_H).fill(FOOTER_BG);
  doc.fillColor(TEXT_LABEL).font('Helvetica').fontSize(8)
    .text(text, MARGIN, PAGE_H - FOOTER_H + 14, {
      width: PAGE_W - 2 * MARGIN, align: 'center',
    });
  doc.restore();
}

function drawSignature(doc: PDFKit.PDFDocument, bailleur: Bailleur, y: number) {
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
    .text(`Fait à ${bailleur.villeSignature}, le ${formatDateFr(new Date())}`, MARGIN, y);

  const logoBuf = resolveImageBuffer(bailleur.logoUrl);
  const sigBuf = resolveImageBuffer(bailleur.signatureUrl);

  drawSignatureWithLogo({
    doc,
    bailleur,
    logoBuf,
    signatureBuf: sigBuf,
    x: PAGE_W - MARGIN - 140,
    y: y + 10,
    logoFit: [140, 60],
    signatureFit: [140, 60],
    signatureOffset: [0, 0],
  });

  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(10)
    .text(bailleur.nom, PAGE_W - MARGIN - 200, y + 75, { width: 200, align: 'right' });
}

function partyBlock(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number,
  title: string, lines: string[],
) {
  doc.save();
  doc.fillColor(PANEL_BG).rect(x, y, w, 4 + 16 * (lines.length + 1) + 4).fill();
  doc.fillColor(TEXT_LABEL).font('Helvetica-Bold').fontSize(8)
    .text(title.toUpperCase(), x + 10, y + 8);
  let cy = y + 22;
  doc.fillColor(TEXT).font('Helvetica').fontSize(10);
  for (const line of lines) {
    doc.text(line, x + 10, cy, { width: w - 20 });
    cy += 14;
  }
  doc.restore();
}

interface CommonContext {
  locataire: Locataire;
  bien: Bien;
  bailleur: Bailleur;
}

// ─── Avis d'échéance ─────────────────────────────────────────────────────────

export interface AvisEcheanceContext extends CommonContext {
  mois: number;
  annee: number;
  /** Date à laquelle le loyer est dû (par défaut : 1er du mois) */
  dateEcheance: Date;
}

export function generateAvisEcheance(ctx: AvisEcheanceContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { locataire, bien, bailleur, mois, annee, dateEcheance } = ctx;
    const doc = new PDFDocument({
      size: 'A4', margin: 0,
      // Désactivable via PDF_TEST_MODE=1 pour permettre l'inspection des
      // streams (tests de propagation pdfCouleur).
      compress: process.env.PDF_TEST_MODE !== '1',
    });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const moisStr = moisLabel(mois);

    drawHeader(doc, bailleur, `Avis d'échéance — ${moisStr} ${annee}`);

    let y = CONTENT_TOP;

    // Bloc bailleur / locataire
    partyBlock(doc, MARGIN, y, 240, 'Bailleur', [
      bailleur.nom,
      bailleur.adresseLigne1,
      bailleur.adresseLigne2,
    ]);
    partyBlock(doc, PAGE_W - MARGIN - 240, y, 240, 'Locataire', [
      `${locataire.prenom} ${locataire.nom}`,
      bien.adresse,
      `${bien.codePostal} ${bien.ville}`,
    ]);
    y += 100;

    doc.fillColor(TEXT).font('Helvetica').fontSize(11)
      .text(
        `Madame, Monsieur,`,
        MARGIN, y, { width: PAGE_W - 2 * MARGIN },
      );
    y += 25;

    const total = locataire.loyerNu + locataire.charges;
    const intro = `Nous vous prions de bien vouloir régler le montant de votre loyer pour le mois ${
      /^[aeiouéèêà]/i.test(moisStr) ? `d'${moisStr}` : `de ${moisStr}`
    } ${annee}, soit la somme de ${formatMontant(total)}, à échéance du ${formatDateFr(dateEcheance)}.`;
    doc.text(intro, MARGIN, y, { width: PAGE_W - 2 * MARGIN, align: 'justify' });
    y += 50;

    // Tableau détail
    const tx = MARGIN;
    const tw = PAGE_W - 2 * MARGIN;

    // Header tableau : bg neutre + bordure 2px brand + texte brand
    // (cf. PORTAIL-BRANDING.md règle 1 : pas d'aplat plein de la couleur).
    const brandColor = brand(bailleur);
    doc.fillColor(HEADER_BG).rect(tx, y, tw, 26).fill();
    doc.lineWidth(2).strokeColor(brandColor)
      .moveTo(tx, y + 26).lineTo(tx + tw, y + 26).stroke();
    doc.fillColor(brandColor).font('Helvetica-Bold').fontSize(10)
      .text('Détail à régler', tx + 14, y + 8);
    y += 26;

    const rows: [string, number][] = [
      ['Loyer hors charges', locataire.loyerNu],
      ['Charges locatives', locataire.charges],
    ];
    for (const [label, amount] of rows) {
      doc.fillColor(TABLE_RULE).rect(tx, y + 28, tw, 0.5).fill();
      doc.fillColor(TEXT).font('Helvetica').fontSize(10).text(label, tx + 14, y + 9);
      doc.font('Helvetica').text(`${formatMontant(amount)}`, tx, y + 9, {
        width: tw - 14, align: 'right',
      });
      y += 28;
    }
    // Total : bg neutre + bordure 2px brand + texte brand (au lieu de fill brand + texte blanc)
    doc.fillColor(HEADER_BG).rect(tx, y, tw, 30).fill();
    doc.lineWidth(2).strokeColor(brandColor).rect(tx, y, tw, 30).stroke();
    doc.fillColor(brandColor).font('Helvetica-Bold').fontSize(11)
      .text('Total à régler', tx + 14, y + 10);
    doc.font('Helvetica-Bold').fontSize(13)
      .text(`${formatMontant(total)}`, tx, y + 8, { width: tw - 14, align: 'right' });
    y += 50;

    doc.fillColor(TEXT_MUTED).font('Helvetica-Oblique').fontSize(9)
      .text(
        `Soit ${montantEnLettres(total)}.`,
        MARGIN, y, { width: PAGE_W - 2 * MARGIN, align: 'right' },
      );
    y += 30;

    doc.fillColor(TEXT).font('Helvetica').fontSize(10)
      .text(
        `Une quittance vous sera adressée dès réception du règlement.`,
        MARGIN, y, { width: PAGE_W - 2 * MARGIN },
      );
    y += 20;
    doc.text(`Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.`,
      MARGIN, y, { width: PAGE_W - 2 * MARGIN });

    drawSignature(doc, bailleur, CONTENT_BOTTOM - 110);

    drawFooter(doc, [
      bailleur.nom,
      bailleur.rcs ? `RCS ${bailleur.rcs}` : null,
      `Avis d'échéance — ${moisStr} ${annee}`,
    ].filter(Boolean).join(' · '));

    doc.end();
  });
}

// ─── Quittance de dépôt de garantie ──────────────────────────────────────────

export interface DepotGarantieContext extends CommonContext {
  /** Montant versé en début de bail */
  montant: number;
  /** Date à laquelle le dépôt a été perçu */
  datePerception: Date;
}

export function generateDepotGarantie(ctx: DepotGarantieContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { locataire, bien, bailleur, montant, datePerception } = ctx;
    const doc = new PDFDocument({
      size: 'A4', margin: 0,
      // Désactivable via PDF_TEST_MODE=1 pour permettre l'inspection des
      // streams (tests de propagation pdfCouleur).
      compress: process.env.PDF_TEST_MODE !== '1',
    });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(doc, bailleur, 'Reçu de dépôt de garantie');

    let y = CONTENT_TOP;

    partyBlock(doc, MARGIN, y, 240, 'Bailleur', [
      bailleur.nom, bailleur.adresseLigne1, bailleur.adresseLigne2,
    ]);
    partyBlock(doc, PAGE_W - MARGIN - 240, y, 240, 'Locataire', [
      `${locataire.prenom} ${locataire.nom}`,
      bien.adresse,
      `${bien.codePostal} ${bien.ville}`,
    ]);
    y += 110;

    doc.fillColor(TEXT).font('Helvetica').fontSize(11)
      .text(
        `Je soussigné(e) ${bailleur.nom}, agissant en qualité de bailleur, ` +
        `reconnais avoir reçu de ${locataire.prenom} ${locataire.nom}, ` +
        `locataire du logement situé ${bien.adresse}, ${bien.codePostal} ${bien.ville}, ` +
        `la somme de :`,
        MARGIN, y, { width: PAGE_W - 2 * MARGIN, align: 'justify' },
      );
    y += 75;

    // Encadré du montant : bg neutre + bordure 2px brand + texte brand
    // (cf. PORTAIL-BRANDING.md règle 1 : pas d'aplat plein de la couleur).
    const brandColor = brand(bailleur);
    const boxX = MARGIN + 60;
    const boxW = PAGE_W - 2 * MARGIN - 120;
    doc.fillColor(HEADER_BG).rect(boxX, y, boxW, 60).fill();
    doc.lineWidth(2).strokeColor(brandColor).rect(boxX, y, boxW, 60).stroke();
    doc.fillColor(brandColor).font('Helvetica-Bold').fontSize(22)
      .text(`${formatMontant(montant)}`, boxX, y + 13, { width: boxW, align: 'center' });
    doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(10)
      .text(`(${montantEnLettres(montant)})`, boxX, y + 42, { width: boxW, align: 'center' });
    y += 80;

    doc.fillColor(TEXT).font('Helvetica').fontSize(11)
      .text(
        `au titre du dépôt de garantie prévu à l'article 22 de la loi n° 89-462 du 6 juillet 1989, ` +
        `versé le ${formatDateFr(datePerception)}.`,
        MARGIN, y, { width: PAGE_W - 2 * MARGIN, align: 'justify' },
      );
    y += 50;

    doc.fillColor(TEXT_MUTED).font('Helvetica-Oblique').fontSize(9)
      .text(
        `Ce dépôt sera restitué dans un délai maximal de deux mois après la remise des clés, ` +
        `déduction faite des sommes éventuellement dues par le locataire au titre de la loi du 6 juillet 1989.`,
        MARGIN, y, { width: PAGE_W - 2 * MARGIN, align: 'justify' },
      );

    drawSignature(doc, bailleur, CONTENT_BOTTOM - 110);

    drawFooter(doc, [
      bailleur.nom,
      bailleur.rcs ? `RCS ${bailleur.rcs}` : null,
      `Reçu de dépôt de garantie`,
    ].filter(Boolean).join(' · '));

    doc.end();
  });
}

// ─── Courrier de révision IRL ────────────────────────────────────────────────

export interface CourrierRevisionContext extends CommonContext {
  ancienLoyer: number;
  nouveauLoyer: number;
  irlReference: number;
  irlNouveau: number;
  trimestre: number;
  anneeIRL: number;
  dateEffet: Date;
}

export function generateCourrierRevision(ctx: CourrierRevisionContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const {
      locataire, bien, bailleur,
      ancienLoyer, nouveauLoyer, irlReference, irlNouveau,
      trimestre, anneeIRL, dateEffet,
    } = ctx;

    const doc = new PDFDocument({
      size: 'A4', margin: 0,
      // Désactivable via PDF_TEST_MODE=1 pour permettre l'inspection des
      // streams (tests de propagation pdfCouleur).
      compress: process.env.PDF_TEST_MODE !== '1',
    });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(doc, bailleur, 'Révision annuelle de loyer');

    let y = CONTENT_TOP;

    // Adresse du destinataire
    doc.fillColor(TEXT).font('Helvetica').fontSize(11)
      .text(`${locataire.prenom} ${locataire.nom}`, MARGIN + 280, y)
      .text(bien.adresse, MARGIN + 280, y + 15)
      .text(`${bien.codePostal} ${bien.ville}`, MARGIN + 280, y + 30);
    y += 80;

    doc.fontSize(10).fillColor(TEXT_MUTED)
      .text(`Fait à ${bailleur.villeSignature}, le ${formatDateFr(new Date())}`, MARGIN + 280, y);
    y += 40;

    doc.fontSize(11).fillColor(TEXT)
      .text(`Objet : révision annuelle de votre loyer selon l'IRL`,
        MARGIN, y, { width: PAGE_W - 2 * MARGIN });
    y += 30;

    doc.text(`Madame, Monsieur,`, MARGIN, y);
    y += 20;

    const variation = ((nouveauLoyer - ancienLoyer) / ancienLoyer) * 100;
    const sens = variation >= 0 ? 'augmentation' : 'baisse';

    doc.text(
      `Conformément aux dispositions de l'article 17-1 de la loi n° 89-462 du 6 juillet 1989, ` +
      `nous procédons à la révision annuelle de votre loyer en application de l'Indice de Référence des Loyers ` +
      `(IRL) publié par l'INSEE.`,
      MARGIN, y, { width: PAGE_W - 2 * MARGIN, align: 'justify' },
    );
    y += 50;

    // Encadré du calcul : bg neutre + bordure 2px brand
    // (cf. PORTAIL-BRANDING.md règle 1 : pas d'aplat plein de la couleur).
    // Alignement labels/valeurs : label à gauche, valeur right-aligned
    // (Helvetica est proportionnel, l'alignement par espaces ne marche pas).
    const brandColor = brand(bailleur);
    const boxX = MARGIN;
    const boxW = PAGE_W - 2 * MARGIN;
    const boxH = 130;
    doc.fillColor(HEADER_BG).rect(boxX, y, boxW, boxH).fill();
    doc.lineWidth(2).strokeColor(brandColor).rect(boxX, y, boxW, boxH).stroke();

    doc.fillColor(brandColor).font('Helvetica-Bold').fontSize(10)
      .text('CALCUL DE LA RÉVISION', boxX + 14, y + 10, { characterSpacing: 1.4 });

    const lines: [string, string][] = [
      ['IRL de référence (signature du bail)', irlReference.toFixed(2)],
      [`IRL nouveau (T${trimestre} ${anneeIRL})`, irlNouveau.toFixed(2)],
      ['Loyer actuel', formatMontant(ancienLoyer)],
      ['Calcul', `${formatMontant(ancienLoyer)} × (${irlNouveau.toFixed(2)} / ${irlReference.toFixed(2)})`],
    ];
    let cy = y + 32;
    for (const [label, value] of lines) {
      doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
        .text(label, boxX + 14, cy, { width: boxW * 0.6 - 14, lineBreak: false, ellipsis: true });
      doc.fillColor(TEXT).font('Helvetica').fontSize(9)
        .text(value, boxX + boxW * 0.6, cy, { width: boxW * 0.4 - 14, align: 'right', lineBreak: false });
      cy += 14;
    }

    // "Nouveau loyer" : ligne séparatrice fine + texte brand sur bg neutre
    doc.lineWidth(0.5).strokeColor(TABLE_RULE)
      .moveTo(boxX + 14, y + boxH - 30).lineTo(boxX + boxW - 14, y + boxH - 30).stroke();
    doc.fillColor(brandColor).font('Helvetica-Bold').fontSize(13)
      .text(
        `Nouveau loyer : ${formatMontant(nouveauLoyer)}  (${variation >= 0 ? '+' : ''}${variation.toFixed(2)}%)`,
        boxX + 14, y + boxH - 22,
        { width: boxW - 28, lineBreak: false },
      );
    y += boxH + 20;

    doc.fillColor(TEXT).font('Helvetica').fontSize(11)
      .text(
        `Ce nouveau loyer hors charges, soit une ${sens} de ${Math.abs(variation).toFixed(2)}%, prendra effet au ` +
        `${formatDateFr(dateEffet)}.`,
        MARGIN, y, { width: PAGE_W - 2 * MARGIN, align: 'justify' },
      );
    y += 35;

    doc.text(
      `Les charges locatives restent inchangées.`,
      MARGIN, y, { width: PAGE_W - 2 * MARGIN },
    );
    y += 25;

    doc.text(
      `Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.`,
      MARGIN, y, { width: PAGE_W - 2 * MARGIN, align: 'justify' },
    );

    drawSignature(doc, bailleur, CONTENT_BOTTOM - 110);

    drawFooter(doc, [
      bailleur.nom,
      bailleur.rcs ? `RCS ${bailleur.rcs}` : null,
      `Courrier de révision IRL`,
    ].filter(Boolean).join(' · '));

    doc.end();
  });
}

// ─── État des lieux ──────────────────────────────────────────────────────────

export type EtatDesLieuxType = 'ENTREE' | 'SORTIE';

export interface EtatDesLieuxContext extends CommonContext {
  type: EtatDesLieuxType;
  date: Date;
}

const PIECES_DEFAUT = [
  'Entrée / Couloir', 'Cuisine', 'Salon / Séjour',
  'Chambre 1', 'Chambre 2', 'Salle de bain',
  'WC', 'Balcon / Extérieur',
];

export function generateEtatDesLieux(ctx: EtatDesLieuxContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { locataire, bien, bailleur, type, date } = ctx;
    const doc = new PDFDocument({
      size: 'A4', margin: 0,
      // Désactivable via PDF_TEST_MODE=1 pour permettre l'inspection des
      // streams (tests de propagation pdfCouleur).
      compress: process.env.PDF_TEST_MODE !== '1',
    });
    const chunks: Buffer[] = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const titre = type === 'ENTREE' ? 'État des lieux d\'entrée' : 'État des lieux de sortie';

    // ── Page 1 : informations générales + tableau des pièces ──
    drawHeader(doc, bailleur, titre);

    let y = CONTENT_TOP;
    partyBlock(doc, MARGIN, y, 240, 'Bailleur', [
      bailleur.nom, bailleur.adresseLigne1, bailleur.adresseLigne2,
    ]);
    partyBlock(doc, PAGE_W - MARGIN - 240, y, 240, 'Locataire', [
      `${locataire.prenom} ${locataire.nom}`, locataire.email ?? '', locataire.telephone ?? '',
    ]);
    y += 110;

    partyBlock(doc, MARGIN, y, PAGE_W - 2 * MARGIN, 'Logement', [
      bien.adresse,
      `${bien.codePostal} ${bien.ville}` + (bien.complement ? ` — ${bien.complement}` : ''),
      `Date de l'état des lieux : ${formatDateFr(date)}`,
    ]);
    y += 90;

    // En-tête tableau
    const tx = MARGIN;
    const tw = PAGE_W - 2 * MARGIN;
    const colPiece = 0.30;
    const colSols = 0.13;
    const colMurs = 0.13;
    const colPlaf = 0.13;
    const colMenuis = 0.13;
    const colObs = 0.18;

    // Header tableau : bg neutre + bordure 2px brand + texte brand
    // (cf. PORTAIL-BRANDING.md règle 1).
    const brandColor = brand(bailleur);
    doc.fillColor(HEADER_BG).rect(tx, y, tw, 22).fill();
    doc.lineWidth(2).strokeColor(brandColor)
      .moveTo(tx, y + 22).lineTo(tx + tw, y + 22).stroke();
    doc.fillColor(brandColor).font('Helvetica-Bold').fontSize(8);
    const headers = [
      ['Pièce', colPiece],
      ['Sols', colSols],
      ['Murs', colMurs],
      ['Plafond', colPlaf],
      ['Menuiseries', colMenuis],
      ['Observations', colObs],
    ] as const;
    let cx = tx;
    for (const [label, ratio] of headers) {
      doc.text(label, cx + 4, y + 7, { width: tw * ratio - 8 });
      cx += tw * ratio;
    }
    y += 22;

    doc.font('Helvetica').fontSize(9).fillColor(TEXT);
    for (const piece of PIECES_DEFAUT) {
      doc.fillColor(TABLE_RULE).rect(tx, y, tw, 0.5).fill();
      doc.fillColor(TEXT).text(piece, tx + 4, y + 14, { width: tw * colPiece - 8 });
      // 4 colonnes vides à remplir à la main, séparées par des filets fins
      cx = tx + tw * colPiece;
      for (let i = 0; i < 4; i++) {
        doc.fillColor(TABLE_RULE).rect(cx, y, 0.5, 36).fill();
        cx += tw * [colSols, colMurs, colPlaf, colMenuis][i]!;
      }
      doc.fillColor(TABLE_RULE).rect(cx, y, 0.5, 36).fill();
      y += 36;
    }
    doc.fillColor(TABLE_RULE).rect(tx, y, tw, 0.5).fill();

    drawFooter(doc, [bailleur.nom, titre, `Page 1/2`].filter(Boolean).join(' · '));

    // ── Page 2 : compteurs + clés + signatures ──
    doc.addPage({ size: 'A4', margin: 0 });
    drawHeader(doc, bailleur, titre);
    y = CONTENT_TOP;

    doc.fillColor(brandColor).font('Helvetica-Bold').fontSize(11)
      .text('Relevé des compteurs', MARGIN, y);
    y += 22;

    const compteurs = ['Eau froide', 'Eau chaude', 'Électricité', 'Gaz'];
    doc.font('Helvetica').fontSize(10).fillColor(TEXT);
    for (const c of compteurs) {
      doc.text(`${c} :`, MARGIN, y, { width: 120 });
      doc.fillColor(TABLE_RULE).rect(MARGIN + 130, y + 12, 200, 0.6).fill();
      doc.fillColor(TEXT_MUTED).fontSize(8).text('(N° + index)', MARGIN + 130, y, { width: 200 });
      doc.fillColor(TEXT).fontSize(10);
      y += 24;
    }
    y += 10;

    doc.fillColor(brandColor).font('Helvetica-Bold').fontSize(11)
      .text('Clés et accessoires remis', MARGIN, y);
    y += 18;
    doc.font('Helvetica').fontSize(10).fillColor(TEXT);
    for (const item of ['Clé(s) appartement :', 'Clé(s) immeuble / portail :', 'Badge / télécommande :', 'Autres :']) {
      doc.text(item, MARGIN, y);
      doc.fillColor(TABLE_RULE).rect(MARGIN + 180, y + 12, PAGE_W - MARGIN * 2 - 180, 0.6).fill();
      doc.fillColor(TEXT);
      y += 22;
    }
    y += 10;

    doc.fillColor(brandColor).font('Helvetica-Bold').fontSize(11)
      .text('Observations complémentaires', MARGIN, y);
    y += 18;
    doc.fillColor(PANEL_BG).rect(MARGIN, y, PAGE_W - 2 * MARGIN, 70).fill();
    y += 90;

    // Signatures
    doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(9)
      .text(`Fait à ${bailleur.villeSignature}, le ${formatDateFr(date)}.`, MARGIN, y);
    y += 30;

    const sigBoxW = (PAGE_W - 2 * MARGIN - 30) / 2;
    doc.fillColor(TEXT_LABEL).font('Helvetica-Bold').fontSize(9)
      .text('LE BAILLEUR', MARGIN, y)
      .text('LE LOCATAIRE', MARGIN + sigBoxW + 30, y);
    doc.fillColor(TABLE_RULE).rect(MARGIN, y + 14, sigBoxW, 70).stroke();
    doc.rect(MARGIN + sigBoxW + 30, y + 14, sigBoxW, 70).stroke();

    drawFooter(doc, [bailleur.nom, titre, `Page 2/2`].filter(Boolean).join(' · '));

    doc.end();
  });
}
