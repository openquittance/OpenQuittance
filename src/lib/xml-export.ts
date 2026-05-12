import type { ExportData } from './exports';
import { formatDateFr } from './utils';

function esc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isoDate(d: Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function isoDateTime(d: Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString();
}

export function buildQuittancesXml(data: ExportData): string {
  const { bailleur, rows, filters } = data;
  const totalLoyer = rows.reduce((s, q) => s + q.loyerNu, 0);
  const totalCharges = rows.reduce((s, q) => s + q.charges, 0);
  const totalGeneral = rows.reduce((s, q) => s + q.montantTotal, 0);
  const totalPercu = rows.reduce((s, q) => s + (q.montantPercu ?? q.montantTotal), 0);

  const items = rows.map(q => `    <quittance id="${esc(q.id)}">
      <periode mois="${q.mois}" annee="${q.annee}"/>
      <locataire>
        <nom>${esc(q.locataire.nom)}</nom>
        <prenom>${esc(q.locataire.prenom)}</prenom>
        ${q.locataire.email ? `<email>${esc(q.locataire.email)}</email>` : ''}
      </locataire>
      <bien>
        <nom>${esc(q.locataire.bien.nom)}</nom>
        <adresse>${esc(q.locataire.bien.adresse)}</adresse>
        <codePostal>${esc(q.locataire.bien.codePostal)}</codePostal>
        <ville>${esc(q.locataire.bien.ville)}</ville>
        ${q.locataire.bien.complement ? `<complement>${esc(q.locataire.bien.complement)}</complement>` : ''}
      </bien>
      <montants devise="EUR">
        <loyerNu>${q.loyerNu.toFixed(2)}</loyerNu>
        <charges>${q.charges.toFixed(2)}</charges>
        <montantTotal>${q.montantTotal.toFixed(2)}</montantTotal>
        ${q.montantPercu != null ? `<montantPercu>${q.montantPercu.toFixed(2)}</montantPercu>` : ''}
        ${q.avoirAppliqueLoyer ? `<avoirAppliqueLoyer>${q.avoirAppliqueLoyer.toFixed(2)}</avoirAppliqueLoyer>` : ''}
        ${q.avoirAppliqueCharges ? `<avoirAppliqueCharges>${q.avoirAppliqueCharges.toFixed(2)}</avoirAppliqueCharges>` : ''}
        ${q.surplusLoyer ? `<surplusLoyer>${q.surplusLoyer.toFixed(2)}</surplusLoyer>` : ''}
        ${q.surplusCharges ? `<surplusCharges>${q.surplusCharges.toFixed(2)}</surplusCharges>` : ''}
      </montants>
      <dates>
        <paiement>${isoDate(q.datePaiement)}</paiement>
        <emission>${isoDate(q.dateEmission)}</emission>
        ${q.dateEmail ? `<envoiEmail>${isoDateTime(q.dateEmail)}</envoiEmail>` : ''}
      </dates>
      ${q.commentaire ? `<commentaire>${esc(q.commentaire)}</commentaire>` : ''}
      <statut>
        <pdfGenere>${q.pdfGenere}</pdfGenere>
        <emailEnvoye>${q.emailEnvoye}</emailEnvoye>
      </statut>
    </quittance>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<quittances generatedAt="${new Date().toISOString()}" version="1.0">
  <bailleur id="${esc(bailleur.id)}">
    <nom>${esc(bailleur.nom)}</nom>
    ${bailleur.rcs ? `<rcs>${esc(bailleur.rcs)}</rcs>` : ''}
    <adresse>
      <ligne1>${esc(bailleur.adresseLigne1)}</ligne1>
      <ligne2>${esc(bailleur.adresseLigne2)}</ligne2>
    </adresse>
  </bailleur>
  <periode du="${isoDate(filters.du)}" au="${isoDate(filters.au)}"/>
  <items count="${rows.length}">
${items}
  </items>
  <totaux devise="EUR">
    <totalLoyer>${totalLoyer.toFixed(2)}</totalLoyer>
    <totalCharges>${totalCharges.toFixed(2)}</totalCharges>
    <totalGeneral>${totalGeneral.toFixed(2)}</totalGeneral>
    <totalPercu>${totalPercu.toFixed(2)}</totalPercu>
  </totaux>
</quittances>
`;
}
