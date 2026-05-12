import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const MOIS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function moisLabel(mois: number): string {
  return MOIS_FR[mois - 1] ?? '';
}

export function formatMontant(n: number): string {
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €';
}

// Variante pour PDFKit: remplace les espaces insécables fins (U+202F)
// et insécables (U+00A0) par des espaces normaux, car Helvetica embarquée
// ne contient pas ces glyphes (ils s'affichent comme des "/" ou des carrés).
export function formatMontantPdf(n: number): string {
  return formatMontant(n).replace(/[  ]/g, ' ');
}

export function formatDateFr(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const jj = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${jj}/${mm}/${yyyy}`;
}

export function formatDateTimeFr(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const jj = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mn = String(date.getMinutes()).padStart(2, '0');
  return `${jj}/${mm}/${yyyy} ${hh}:${mn}`;
}

/**
 * Convertit un entier en lettres françaises (jusqu'à 999 999 999).
 * Suit l'orthographe traditionnelle (sans réforme 1990 pour les traits d'union
 * dans les centaines, mais avec "soixante et onze", "quatre-vingts" pluriel).
 */
export function nombreEnLettres(n: number): string {
  const ent = Math.floor(Math.abs(n));
  if (ent === 0) return 'zéro';

  const UNITS = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  const conv = (x: number): string => {
    if (x < 20) return UNITS[x];
    if (x < 100) {
      const t = Math.floor(x / 10);
      const u = x % 10;
      if (t === 7 || t === 9) {
        const sub = 10 + u;
        return TENS[t] + (t === 7 && u === 1 ? ' et ' : '-') + UNITS[sub];
      }
      if (u === 0) return TENS[t] + (t === 8 ? 's' : '');
      if (u === 1 && t !== 8) return TENS[t] + ' et un';
      return TENS[t] + '-' + UNITS[u];
    }
    if (x < 1000) {
      const h = Math.floor(x / 100);
      const r = x % 100;
      const head = h === 1 ? 'cent' : UNITS[h] + ' cent' + (r === 0 ? 's' : '');
      return r === 0 ? head : `${h === 1 ? 'cent' : UNITS[h] + ' cent'} ${conv(r)}`;
    }
    if (x < 1_000_000) {
      const k = Math.floor(x / 1000);
      const r = x % 1000;
      const head = k === 1 ? 'mille' : `${conv(k)} mille`;
      return r === 0 ? head : `${head} ${conv(r)}`;
    }
    if (x < 1_000_000_000) {
      const m = Math.floor(x / 1_000_000);
      const r = x % 1_000_000;
      const head = m === 1 ? 'un million' : `${conv(m)} millions`;
      return r === 0 ? head : `${head} ${conv(r)}`;
    }
    return String(x);
  };

  return conv(ent);
}

/**
 * Convertit un montant euro (avec décimales) en lettres françaises.
 * Ex: 389,00 → "trois cent quatre-vingt-neuf euros"
 *     441,50 → "quatre cent quarante et un euros et cinquante centimes"
 */
export function montantEnLettres(n: number): string {
  const euros = Math.floor(Math.abs(n));
  const centimes = Math.round((Math.abs(n) - euros) * 100);
  let s = `${nombreEnLettres(euros)} ${euros > 1 ? 'euros' : 'euro'}`;
  if (centimes > 0) {
    s += ` et ${nombreEnLettres(centimes)} ${centimes > 1 ? 'centimes' : 'centime'}`;
  }
  return s;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isoToInputDate(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/**
 * Génère un commentaire automatique pour une quittance selon les avoirs
 * appliqués et/ou trop-perçus / manques saisis. Renvoie une chaîne vide si
 * rien à signaler.
 *
 * Inclut une instruction concrète pour le prochain virement quand pertinent.
 */
export function genererCommentaire(args: {
  avoirAppliqueLoyer: number;
  avoirAppliqueCharges: number;
  surplusLoyer: number;
  surplusCharges: number;
  montantPercu: number | null;
  montantTotal: number;
  /** Loyer + charges "habituels" hors avoir appliqué — sert à calculer le montant normal du mois suivant */
  loyerNu?: number;
  charges?: number;
  moisActuel: number;
  anneeActuelle: number;
}): string {
  const phrases: string[] = [];
  const moisSuivant = args.moisActuel === 12 ? 1 : args.moisActuel + 1;
  const anneeSuivante = args.moisActuel === 12 ? args.anneeActuelle + 1 : args.anneeActuelle;
  const labelMoisSuivant = `${moisLabel(moisSuivant)} ${anneeSuivante}`;

  // Avoir reporté du mois précédent (déjà appliqué sur cette quittance)
  const avoirTotal = args.avoirAppliqueLoyer + args.avoirAppliqueCharges;
  if (avoirTotal > 0) {
    const parts: string[] = [];
    if (args.avoirAppliqueLoyer > 0) parts.push(`${formatMontant(args.avoirAppliqueLoyer)} sur le loyer`);
    if (args.avoirAppliqueCharges > 0) parts.push(`${formatMontant(args.avoirAppliqueCharges)} sur les charges`);
    phrases.push(
      `Suite au trop-perçu du mois précédent, un avoir de ${formatMontant(avoirTotal)} a été déduit (${parts.join(' et ')}). ` +
      `Le montant à régler ce mois-ci s'élève donc à ${formatMontant(args.montantTotal)}.`,
    );
  }

  // Différence entre montant perçu et total dû
  if (args.montantPercu != null) {
    const ecart = +(args.montantPercu - args.montantTotal).toFixed(2);
    const surplusTotal = +((args.surplusLoyer ?? 0) + (args.surplusCharges ?? 0)).toFixed(2);

    if (ecart > 0.005 && surplusTotal > 0) {
      // Trop-perçu
      const parts: string[] = [];
      if (args.surplusLoyer > 0) parts.push(`${formatMontant(args.surplusLoyer)} sur le loyer`);
      if (args.surplusCharges > 0) parts.push(`${formatMontant(args.surplusCharges)} sur les charges`);
      phrases.push(
        `Vous avez versé ${formatMontant(args.montantPercu)} pour un total dû de ${formatMontant(args.montantTotal)}, ` +
        `soit un trop-perçu de ${formatMontant(surplusTotal)} (${parts.join(' et ')}) qui sera déduit de votre quittance de ${labelMoisSuivant}.`,
      );

      // Instruction concrète pour le prochain virement (suppose loyer/charges identiques le mois suivant)
      if (args.loyerNu != null && args.charges != null) {
        const totalNormal = +(args.loyerNu + args.charges).toFixed(2);
        const aVerser = +(totalNormal - surplusTotal).toFixed(2);
        phrases.push(
          `Pour votre virement de ${labelMoisSuivant}, merci de verser ${formatMontant(aVerser)} au lieu de ${formatMontant(totalNormal)}.`,
        );
      }
    } else if (ecart < -0.005) {
      // Manque (sous-perçu)
      const manque = -ecart;
      phrases.push(
        `Vous avez versé ${formatMontant(args.montantPercu)} pour un total dû de ${formatMontant(args.montantTotal)}, ` +
        `soit un solde restant dû de ${formatMontant(manque)}.`,
      );
      if (args.loyerNu != null && args.charges != null) {
        const totalNormal = +(args.loyerNu + args.charges).toFixed(2);
        const aVerser = +(totalNormal + manque).toFixed(2);
        phrases.push(
          `Pour votre virement de ${labelMoisSuivant}, merci de verser ${formatMontant(aVerser)} au lieu de ${formatMontant(totalNormal)} pour régulariser.`,
        );
      } else {
        phrases.push(`Merci de régulariser ce montant.`);
      }
    }
  }

  return phrases.join(' ');
}
