import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
import type { ExportData } from './exports';
import { formatDateFr, formatMontantPdf as formatMontant, moisLabel } from './utils';

const TEXT = '#222222';
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

function resolveImagePath(rel: string | null | undefined): string | null {
  if (!rel) return null;
  if (path.isAbsolute(rel) && fs.existsSync(rel)) return rel;
  const fromUploads = path.join(UPLOADS_DIR, rel.replace(/^\/?(uploads\/)?/, ''));
  if (fs.existsSync(fromUploads)) return fromUploads;
  return null;
}

export function buildRecapPdf(data: ExportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const { bailleur, rows, filters } = data;
      const brand = bailleur.pdfCouleur || '#1a3a5c';
      const font = bailleur.pdfPolice || 'Helvetica';
      const bold = font === 'Helvetica' ? 'Helvetica-Bold' : `${font}-Bold`;

      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        compress: process.env.PDF_TEST_MODE !== '1',
        info: {
          Title: `Récapitulatif quittances ${formatDateFr(filters.du)} - ${formatDateFr(filters.au)}`,
          Author: bailleur.nom,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const margin = 50;
      const innerW = pageW - margin * 2;

      // Header bailleur (en haut à gauche)
      const logoPath = resolveImagePath(bailleur.logoUrl);
      let textX = margin;
      const headerY = 40;

      if (logoPath) {
        try {
          doc.image(logoPath, margin, headerY, { fit: [70, 50] });
          textX = margin + 80;
        } catch {}
      }

      doc.fillColor(TEXT).font(bold).fontSize(13).text(bailleur.nom, textX, headerY);
      doc.font(font).fontSize(8);
      if (bailleur.rcs) doc.text(bailleur.rcs, textX, headerY + 16);
      doc.fontSize(9)
        .text(bailleur.adresseLigne1, textX, headerY + 28)
        .text(bailleur.adresseLigne2, textX, headerY + 40);

      // Title
      doc.fillColor(brand).font(bold).fontSize(20)
        .text('Récapitulatif des quittances', margin, 110, { width: innerW, align: 'center' });

      // Period + filters
      doc.fillColor(TEXT).font(font).fontSize(11)
        .text(`Période : du ${formatDateFr(filters.du)} au ${formatDateFr(filters.au)}`, margin, 145, {
          width: innerW, align: 'center',
        });

      // Table — A4 utile 495pt: 110 + 85 + 60 + 60 + 60 + 75 + 45 = 495
      const cols = [
        { label: 'Locataire', x: margin, w: 110 },
        { label: 'Bien', x: margin + 110, w: 85 },
        { label: 'Période', x: margin + 195, w: 60 },
        { label: 'Loyer', x: margin + 255, w: 60, align: 'right' as const },
        { label: 'Charges', x: margin + 315, w: 60, align: 'right' as const },
        { label: 'Total', x: margin + 375, w: 75, align: 'right' as const },
        { label: 'Mail', x: margin + 450, w: 45, align: 'center' as const },
      ];

      let y = 190;
      // Header row : bg neutre + bordure 2px brand + texte brand
      // (cf. PORTAIL-BRANDING.md règle 1 : pas d'aplat plein de la couleur).
      doc.save();
      doc.rect(margin, y, innerW, 22).fillColor('#faf7f4').fill();
      doc.lineWidth(2).strokeColor(brand)
        .moveTo(margin, y + 22).lineTo(margin + innerW, y + 22).stroke();
      doc.restore();
      doc.fillColor(brand).font(bold).fontSize(9);
      cols.forEach(c => {
        doc.text(c.label, c.x + 4, y + 6, { width: c.w - 8, align: c.align ?? 'left' });
      });

      y += 22;
      doc.fillColor(TEXT).font(font).fontSize(9);

      let totalLoyer = 0, totalCharges = 0, totalMontant = 0;
      let alt = false;

      const ensurePageSpace = (h: number) => {
        if (y + h > doc.page.height - 80) {
          doc.addPage();
          y = 50;
        }
      };

      for (const q of rows) {
        ensurePageSpace(20);
        if (alt) {
          doc.save().rect(margin, y, innerW, 18).fillColor('#f5f5f7').fill().restore();
          doc.fillColor(TEXT);
        }
        doc.font(font).fontSize(9);
        doc.text(`${q.locataire.nom} ${q.locataire.prenom}`, cols[0].x + 4, y + 5, { width: cols[0].w - 8, ellipsis: true, lineBreak: false });
        doc.text(q.locataire.bien.nom, cols[1].x + 4, y + 5, { width: cols[1].w - 8, ellipsis: true, lineBreak: false });
        doc.text(`${moisLabel(q.mois).slice(0, 3)} ${q.annee}`, cols[2].x + 4, y + 5, { width: cols[2].w - 8, lineBreak: false });
        doc.text(formatMontant(q.loyerNu), cols[3].x + 4, y + 5, { width: cols[3].w - 8, align: 'right', lineBreak: false });
        doc.text(formatMontant(q.charges), cols[4].x + 4, y + 5, { width: cols[4].w - 8, align: 'right', lineBreak: false });
        doc.font(bold).text(formatMontant(q.montantTotal), cols[5].x + 4, y + 5, { width: cols[5].w - 8, align: 'right', lineBreak: false });
        doc.font(font).text(q.emailEnvoye ? '✓' : '—', cols[6].x + 4, y + 5, { width: cols[6].w - 8, align: 'center', lineBreak: false });

        totalLoyer += q.loyerNu;
        totalCharges += q.charges;
        totalMontant += q.montantTotal;
        y += 18;
        alt = !alt;
      }

      // Totals row
      ensurePageSpace(30);
      y += 8;
      doc.save().rect(margin, y, innerW, 24).strokeColor(brand).lineWidth(1.2).stroke().restore();
      doc.fillColor(brand).font(bold).fontSize(10);
      doc.text('TOTAUX', cols[0].x + 4, y + 7, { width: cols[0].w - 8, lineBreak: false });
      doc.text(`${rows.length} quittance(s)`, cols[1].x + 4, y + 7, { width: cols[1].w - 8, lineBreak: false });
      doc.text(formatMontant(totalLoyer), cols[3].x + 4, y + 7, { width: cols[3].w - 8, align: 'right', lineBreak: false });
      doc.text(formatMontant(totalCharges), cols[4].x + 4, y + 7, { width: cols[4].w - 8, align: 'right', lineBreak: false });
      doc.fontSize(11).text(formatMontant(totalMontant), cols[5].x + 4, y + 6, { width: cols[5].w - 8, align: 'right', lineBreak: false });

      // Footer date
      doc.fillColor('#888888').font(font).fontSize(8)
        .text(`Document généré le ${formatDateFr(new Date())}`, margin, doc.page.height - 60, {
          width: innerW, align: 'center',
        });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
