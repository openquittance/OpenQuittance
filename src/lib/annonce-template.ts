/**
 * Annonce locative — template texte plain pour collage LeBonCoin/SeLoger
 * (v2.6.0 Feature B Wizard nouveau logement, step 4 si bien vacant).
 *
 * Décisions cadrage Session 0 :
 *   - Q6 preview live → pure fonction sync, pas d'aller-retour serveur
 *   - Q7 stockage = Bien.annonceTexte (1 string overwrite, pas d'historique)
 *   - Q8 format = plain text (collable partout, pas markdown ni HTML)
 *   - Q9 inputs DPE = saisie manuelle (classe + valeurs kWh/GES) sur Bien
 */
import type { TYPE_BIEN_VALUES, DPE_CLASSE_VALUES } from './validation';

export type TypeBien = (typeof TYPE_BIEN_VALUES)[number];
export type DpeClasse = (typeof DPE_CLASSE_VALUES)[number];

/** Libellé humain pour le type de bien dans l'annonce. */
const TYPE_BIEN_LABELS: Record<TypeBien, string> = {
  STUDIO: 'Studio',
  T1: 'T1',
  T2: 'T2',
  T3: 'T3',
  T4: 'T4',
  T5_PLUS: 'T5+',
  MAISON: 'Maison',
  CHAMBRE: 'Chambre',
  LOCAL_COMMERCIAL: 'Local commercial',
  AUTRE: 'Logement',
};

export interface AnnonceBien {
  typeBien: TypeBien | null;
  surface: number | null;
  etage: number | null;
  adresse: string;
  complement: string | null;
  codePostal: string;
  ville: string;
  dpeClasse: DpeClasse | null;
  dpeKwh: number | null;
  dpeGes: number | null;
}

export interface AnnonceEquipements {
  meuble: boolean;
  cuisineEquipee: boolean;
  laveLinge: boolean;
  ascenseur: boolean;
  balcon: boolean;
  parking: boolean;
  jardin: boolean;
  cave: boolean;
  chargesIncluses: boolean;
}

export interface AnnonceContact {
  nomBailleur: string;
  email: string | null;
  telephone: string | null;
}

export interface AnnonceFinances {
  loyerNu: number;
  charges: number;
  depotGarantie: number | null;
}

/**
 * v2.6.1-rc2 : choix d'affichage adresse / secteur dans l'annonce.
 * Les bailleurs préfèrent souvent ne PAS divulguer l'adresse exacte
 * sur LeBonCoin/SeLoger pour filtrer les visites — secteur (quartier)
 * suffit à l'étape annonce. Adresse complète révélée après contact.
 *   - includeAdresse=true → ligne "{adresse} — {complement}"
 *   - includeSecteur=true → ligne "Secteur : {secteurText}"
 *   - les deux off → header ville (CP) seul
 */
export interface AnnonceAdresseChoice {
  includeAdresse: boolean;
  includeSecteur: boolean;
  secteurText: string;
}

const EUR = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

function ordinalEtage(n: number): string {
  if (n === 0) return 'rez-de-chaussée';
  if (n === 1) return '1er étage';
  return `${n}ème étage`;
}

function buildEquipementsList(eq: AnnonceEquipements): string[] {
  const items: string[] = [];
  if (eq.cuisineEquipee) items.push('Cuisine équipée');
  if (eq.laveLinge) items.push('Lave-linge');
  if (eq.balcon) items.push('Balcon');
  if (eq.jardin) items.push('Jardin');
  if (eq.parking) items.push('Parking');
  if (eq.cave) items.push('Cave');
  return items;
}

/**
 * Construit le texte annonce plain (collable LeBonCoin/SeLoger).
 *
 * Sections :
 *   1. Header : type + surface + ville (CP)
 *   2. Adresse complète
 *   3. Loyer + charges + total + dépôt
 *   4. Caractéristiques (étage, ascenseur, équipements)
 *   5. DPE (classe + kWh + GES)
 *   6. Meublé/nu, charges incluses
 *   7. Disponibilité
 *   8. Contact
 */
export function buildAnnonce(args: {
  bien: AnnonceBien;
  equipements: AnnonceEquipements;
  contact: AnnonceContact;
  finances: AnnonceFinances;
  disponibilite: string | null;
  adresseChoice?: AnnonceAdresseChoice;
}): string {
  const { bien, equipements, contact, finances, disponibilite, adresseChoice } = args;
  // v2.6.1-rc2 : default = inclure adresse (rétro-compat avec annonces
  // pré-rc2 qui appelaient buildAnnonce sans adresseChoice).
  const choice: AnnonceAdresseChoice = adresseChoice ?? {
    includeAdresse: true,
    includeSecteur: false,
    secteurText: '',
  };
  const typeLabel = bien.typeBien ? TYPE_BIEN_LABELS[bien.typeBien] : 'Logement';
  const surface = bien.surface ? `${bien.surface} m²` : '';
  const headerParts = [typeLabel, surface, `à ${bien.ville} (${bien.codePostal})`].filter(Boolean);
  const addrLine = bien.complement
    ? `${bien.adresse} — ${bien.complement}`
    : bien.adresse;
  const total = finances.loyerNu + finances.charges;

  const lines: string[] = [];

  lines.push(headerParts.join(' '));
  if (choice.includeAdresse) {
    lines.push(addrLine);
  }
  if (choice.includeSecteur && choice.secteurText.trim()) {
    lines.push(`Secteur : ${choice.secteurText.trim()}`);
  }
  lines.push('');

  lines.push(`Loyer : ${EUR(finances.loyerNu)} + ${EUR(finances.charges)} de charges = ${EUR(total)} / mois`);
  if (finances.depotGarantie != null && finances.depotGarantie > 0) {
    lines.push(`Dépôt de garantie : ${EUR(finances.depotGarantie)}`);
  }
  if (equipements.chargesIncluses) {
    lines.push('Charges comprises (eau, chauffage, ordures ménagères selon copropriété).');
  }
  lines.push('');

  lines.push('CARACTÉRISTIQUES :');
  if (bien.etage != null) {
    const ascenseur = equipements.ascenseur ? ' avec ascenseur' : '';
    lines.push(`- ${ordinalEtage(bien.etage)}${ascenseur}`);
  } else if (equipements.ascenseur) {
    lines.push('- Ascenseur dans l\'immeuble');
  }
  const eqList = buildEquipementsList(equipements);
  for (const item of eqList) {
    lines.push(`- ${item}`);
  }
  lines.push(`- ${equipements.meuble ? 'Meublé' : 'Non meublé'}`);
  lines.push('');

  if (bien.dpeClasse) {
    const kwh = bien.dpeKwh != null ? `, ${bien.dpeKwh} kWh/m²/an` : '';
    const ges = bien.dpeGes != null ? `, ${bien.dpeGes} kgCO2/m²/an` : '';
    lines.push(`DPE : classe ${bien.dpeClasse}${kwh}${ges}`);
    lines.push('');
  }

  if (disponibilite) {
    lines.push(`DISPONIBILITÉ : ${disponibilite}`);
    lines.push('');
  }

  const contactParts: string[] = [];
  if (contact.email) contactParts.push(contact.email);
  if (contact.telephone) contactParts.push(contact.telephone);
  const contactSuffix = contactParts.length ? ` — ${contactParts.join(' / ')}` : '';
  lines.push(`Contact : ${contact.nomBailleur}${contactSuffix}`);

  return lines.join('\n');
}
