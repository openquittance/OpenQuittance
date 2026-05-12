/**
 * Whitelist catégories Archive (v2.5.0 Feature A — Documents propriétaire).
 *
 * Source d'autorité unique : utilisée par
 *   - POST /api/archives (validation écriture)
 *   - GET /api/portail/documents (filtre exposition tenant)
 *   - scripts/bootstrap.mjs (migration legacy → canonique)
 *   - UI ArchiveManager (dropdown options)
 *
 * Décisions cadrage Session 0 (cf. SESSION-LOGS 2026-05-06) :
 *   - Whitelist string (pas enum Prisma : souple, pas d'ALTER TABLE)
 *   - Catégorie obligatoire à l'écriture v2.5.0+
 *   - Rétro-compat lecture sur aliases Phase 1
 *   - DDT (DPE + diagnostics) sous-ensemble Bien partageable tenant
 *     via toggle Locataire.partageDDT
 */

export const BIEN_CATEGORIES = [
  'ACTE_VENTE',
  'CREDIT_IMMO',
  'TAXE_FONCIERE',
  'DPE',
  'DIAG_AMIANTE',
  'DIAG_ELEC',
  'DIAG_GAZ',
  'DIAG_PLOMB',
  'ERP',
  'ASSURANCE_PNO',
  'GLI',
  'COPRO_REGLEMENT',
  'COPRO_AG',
  'COPRO_QUITTANCE_SYNDIC',
  'IMPOTS_IR',
  'IMPOTS_IFI',
  'PHOTO_BIEN',
  'AUTRE_BIEN',
] as const;

export const LOCATAIRE_CATEGORIES = [
  'BAIL',
  'EDL_ENTREE',
  'EDL_SORTIE',
  'COURRIER_REVISION_IRL',
  'PREUVE_DEPOT_RECOMMANDE',
  'ASSURANCE_LOCATAIRE',
  'GARANTIE_LOYER',
  'AUTRE_LOCATAIRE',
] as const;

/**
 * Ordre dropdown UI (Q13 cadrage Session 0) : par fréquence d'usage
 * probable, pas alphabétique. DPE/ACTE_VENTE/PNO en haut côté Bien ;
 * BAIL/EDL en haut côté Locataire.
 */
export const BIEN_CATEGORIES_UI_ORDER: ReadonlyArray<BienCategory> = [
  'DPE',
  'ACTE_VENTE',
  'ASSURANCE_PNO',
  'PHOTO_BIEN',
  'TAXE_FONCIERE',
  'CREDIT_IMMO',
  'GLI',
  'DIAG_AMIANTE',
  'DIAG_ELEC',
  'DIAG_GAZ',
  'DIAG_PLOMB',
  'ERP',
  'COPRO_REGLEMENT',
  'COPRO_AG',
  'COPRO_QUITTANCE_SYNDIC',
  'IMPOTS_IR',
  'IMPOTS_IFI',
  'AUTRE_BIEN',
];

/**
 * Sous-ensemble de catégories Bien priorisées dans le wizard step 2
 * (Q5 cadrage Session 0 Feature B). DPE + diagnostics légaux + acte
 * de vente + assurance PNO + photos = setup minimum recommandé pour
 * mise en location. Le reste reste accessible via "Plus de catégories".
 */
export const BIEN_CATEGORIES_WIZARD_PRIORITY: ReadonlyArray<BienCategory> = [
  'DPE',
  'DIAG_AMIANTE',
  'DIAG_ELEC',
  'DIAG_GAZ',
  'DIAG_PLOMB',
  'ERP',
  'ACTE_VENTE',
  'ASSURANCE_PNO',
  'PHOTO_BIEN',
];

export const LOCATAIRE_CATEGORIES_UI_ORDER: ReadonlyArray<LocataireCategory> = [
  'BAIL',
  'EDL_ENTREE',
  'EDL_SORTIE',
  'GARANTIE_LOYER',
  'ASSURANCE_LOCATAIRE',
  'COURRIER_REVISION_IRL',
  'PREUVE_DEPOT_RECOMMANDE',
  'AUTRE_LOCATAIRE',
];

/** Libellé humain pour l'UI staff. Pas i18n — locale unique (fr). */
export const CATEGORY_LABELS: Record<ArchiveCategory, string> = {
  // Bien
  ACTE_VENTE: 'Acte de vente',
  CREDIT_IMMO: 'Crédit immobilier',
  TAXE_FONCIERE: 'Taxe foncière',
  DPE: 'DPE',
  DIAG_AMIANTE: 'Diagnostic amiante',
  DIAG_ELEC: 'Diagnostic électricité',
  DIAG_GAZ: 'Diagnostic gaz',
  DIAG_PLOMB: 'Diagnostic plomb',
  ERP: 'État des risques (ERP)',
  ASSURANCE_PNO: 'Assurance PNO',
  GLI: 'Garantie loyers impayés (GLI)',
  COPRO_REGLEMENT: 'Copro — règlement',
  COPRO_AG: "Copro — assemblée générale",
  COPRO_QUITTANCE_SYNDIC: 'Copro — quittance syndic',
  IMPOTS_IR: 'Impôts — revenus fonciers',
  IMPOTS_IFI: 'Impôts — IFI',
  PHOTO_BIEN: 'Photo du bien',
  AUTRE_BIEN: 'Autre (bien)',
  // Locataire
  BAIL: 'Bail / contrat',
  EDL_ENTREE: 'État des lieux entrée',
  EDL_SORTIE: 'État des lieux sortie',
  COURRIER_REVISION_IRL: 'Courrier révision IRL',
  PREUVE_DEPOT_RECOMMANDE: 'Preuve dépôt recommandé',
  ASSURANCE_LOCATAIRE: 'Assurance habitation locataire',
  GARANTIE_LOYER: 'Garantie loyer (Visale, garant)',
  AUTRE_LOCATAIRE: 'Autre (locataire)',
};

export type BienCategory = (typeof BIEN_CATEGORIES)[number];
export type LocataireCategory = (typeof LOCATAIRE_CATEGORIES)[number];
export type ArchiveCategory = BienCategory | LocataireCategory;

const BIEN_SET = new Set<string>(BIEN_CATEGORIES);
const LOC_SET = new Set<string>(LOCATAIRE_CATEGORIES);

/**
 * DDT — Dossier de Diagnostic Technique. Sous-ensemble des Bien-categories
 * que la loi (ALUR + Climat + Résilience) impose d'annexer au bail. Ces
 * documents PEUVENT être exposés au tenant via le portail si le toggle
 * Locataire.partageDDT=true. Filet serveur strict : aucune autre catégorie
 * Bien (acte de vente, crédit, IFI...) ne sera jamais exposée tenant.
 */
export const DDT_CATEGORIES: ReadonlySet<BienCategory> = new Set([
  'DPE',
  'DIAG_AMIANTE',
  'DIAG_ELEC',
  'DIAG_GAZ',
  'DIAG_PLOMB',
  'ERP',
]);

/**
 * Catégories Locataire gouvernées par les toggles partage* (Phase 1 Lot D).
 * Mappage catégorie → toggle qui décide la visibilité tenant. null = la
 * catégorie n'a pas de toggle dédié (visibilité via visibleLocataire seul).
 */
export const LOCATAIRE_TOGGLE: Record<LocataireCategory, 'partageEtatDesLieux' | 'partageBail' | null> = {
  BAIL: 'partageBail',
  EDL_ENTREE: 'partageEtatDesLieux',
  EDL_SORTIE: 'partageEtatDesLieux',
  COURRIER_REVISION_IRL: null,
  PREUVE_DEPOT_RECOMMANDE: null,
  ASSURANCE_LOCATAIRE: null,
  GARANTIE_LOYER: null,
  AUTRE_LOCATAIRE: null,
};

/**
 * Aliases legacy (Phase 1 + texte libre minuscule) → catégorie canonique.
 * Utilisé EN LECTURE uniquement (rétro-compat avant que le script de
 * migration bootstrap ait tourné). En écriture, la whitelist est stricte.
 */
const LEGACY_ALIASES: Record<string, ArchiveCategory> = {
  'edl-entree': 'EDL_ENTREE',
  'edl-sortie': 'EDL_SORTIE',
  bail: 'BAIL',
  contrat: 'BAIL',
  'courrier-revision-irl': 'COURRIER_REVISION_IRL',
  'preuve-depot-recommande': 'PREUVE_DEPOT_RECOMMANDE',
};

/** Valide qu'une catégorie est dans la whitelist écriture pour un ownerType. */
export function isValidCategory(ownerType: 'Bien' | 'Locataire', category: string): boolean {
  if (ownerType === 'Bien') return BIEN_SET.has(category);
  return LOC_SET.has(category);
}

/**
 * Normalise une catégorie (canonique ou legacy alias) vers la forme canonique.
 * Retourne null si la catégorie est inconnue (ni canonique ni alias).
 */
export function normalizeCategory(category: string | null | undefined): ArchiveCategory | null {
  if (!category) return null;
  if (BIEN_SET.has(category) || LOC_SET.has(category)) return category as ArchiveCategory;
  return LEGACY_ALIASES[category] ?? null;
}

/** True si la catégorie (canonique ou alias) appartient au DDT. */
export function isDDT(category: string | null | undefined): boolean {
  const norm = normalizeCategory(category);
  return norm !== null && DDT_CATEGORIES.has(norm as BienCategory);
}

/**
 * Mapping regex texte libre → catégorie canonique pour migration bootstrap.
 * Ordre = priorité (premier match gagne). `ownerHint` = ownerType "idéal"
 * pour la catégorie. Si `ownerHint='Bien'` et l'archive a `ownerType='Locataire'`,
 * le bootstrap doit migrer ownerType → Bien (Q6 cadrage : DPE/diag mal
 * attribués → résoudre via locataire.bienId). Le sens inverse n'est pas
 * traité (ambigu : quel locataire ?).
 */
export const MIGRATION_REGEX: ReadonlyArray<{
  pattern: RegExp;
  cat: ArchiveCategory;
  ownerHint: 'Bien' | 'Locataire';
}> = [
  { pattern: /\bdpe\b/i, cat: 'DPE', ownerHint: 'Bien' },
  { pattern: /amiante/i, cat: 'DIAG_AMIANTE', ownerHint: 'Bien' },
  { pattern: /\b(elec|electric)/i, cat: 'DIAG_ELEC', ownerHint: 'Bien' },
  { pattern: /\bgaz\b/i, cat: 'DIAG_GAZ', ownerHint: 'Bien' },
  { pattern: /plomb/i, cat: 'DIAG_PLOMB', ownerHint: 'Bien' },
  { pattern: /\berp\b|risq.*pollu|pollu.*risq/i, cat: 'ERP', ownerHint: 'Bien' },
  { pattern: /acte.*vente|vente.*acte/i, cat: 'ACTE_VENTE', ownerHint: 'Bien' },
  { pattern: /credit|emprunt|\bpret\b/i, cat: 'CREDIT_IMMO', ownerHint: 'Bien' },
  { pattern: /taxe.*fonci/i, cat: 'TAXE_FONCIERE', ownerHint: 'Bien' },
  { pattern: /\bpno\b|prop.*non.*occ/i, cat: 'ASSURANCE_PNO', ownerHint: 'Bien' },
  { pattern: /\bgli\b|loyer.*impay/i, cat: 'GLI', ownerHint: 'Bien' },
  { pattern: /reglement.*copro|copro.*reglement/i, cat: 'COPRO_REGLEMENT', ownerHint: 'Bien' },
  { pattern: /\b(ag|assemblee)\b.*copro|copro.*\b(ag|assemblee)\b|proces.*verbal/i, cat: 'COPRO_AG', ownerHint: 'Bien' },
  { pattern: /syndic/i, cat: 'COPRO_QUITTANCE_SYNDIC', ownerHint: 'Bien' },
  { pattern: /impot.*revenu|\birp?\b.*revenu|2042/i, cat: 'IMPOTS_IR', ownerHint: 'Bien' },
  { pattern: /\bifi\b|fortune.*immo|immo.*fortune/i, cat: 'IMPOTS_IFI', ownerHint: 'Bien' },
  { pattern: /\bphoto\b|\bimg\b|\bjpe?g\b|\bpng\b|\bwebp\b/i, cat: 'PHOTO_BIEN', ownerHint: 'Bien' },
  { pattern: /\bbail\b|contrat.*loc/i, ownerHint: 'Locataire', cat: 'BAIL' },
  { pattern: /edl.*entr|etat.*lieux.*entr|entree.*etat/i, cat: 'EDL_ENTREE', ownerHint: 'Locataire' },
  { pattern: /edl.*sort|etat.*lieux.*sort|sortie.*etat/i, cat: 'EDL_SORTIE', ownerHint: 'Locataire' },
  { pattern: /revision.*irl|courrier.*revis|irl.*courrier/i, cat: 'COURRIER_REVISION_IRL', ownerHint: 'Locataire' },
  { pattern: /recommand|depot.*post/i, cat: 'PREUVE_DEPOT_RECOMMANDE', ownerHint: 'Locataire' },
  { pattern: /\bvisale\b|garant|caution/i, cat: 'GARANTIE_LOYER', ownerHint: 'Locataire' },
  { pattern: /assur.*habit|assur.*loc|attest.*assur/i, cat: 'ASSURANCE_LOCATAIRE', ownerHint: 'Locataire' },
];

/**
 * Décide la catégorie canonique + ownerType cible pour migration bootstrap
 * d'une archive legacy (catégorie texte libre ou alias Phase 1).
 *
 *   - Si la catégorie est déjà canonique ou un alias connu → 1:1.
 *   - Sinon, regex texte libre + filename (premier match gagne).
 *   - Si match pointe vers ownerHint=Bien sur archive ownerType=Locataire,
 *     retourne newOwnerType='Bien' (Q6 — bootstrap résout bienId via locataire).
 *   - Sens inverse (ownerHint=Locataire sur archive Bien) NON traité car
 *     ambigu : fallback AUTRE_BIEN.
 *   - Cas non mappés → AUTRE_BIEN ou AUTRE_LOCATAIRE selon ownerType.
 */
export function migrateLegacyCategory(args: {
  ownerType: 'Bien' | 'Locataire';
  category: string | null;
  filename: string;
}): { category: ArchiveCategory; newOwnerType?: 'Bien' } {
  const { ownerType, category, filename } = args;

  // 1) Alias Phase 1 ou déjà canonique
  const norm = normalizeCategory(category);
  if (norm) {
    if (isValidCategory(ownerType, norm)) return { category: norm };
    // Catégorie canonique mais sur le mauvais ownerType (ex BAIL sur Bien).
    // Fallback AUTRE_* — ambigu, pas de migration auto.
    return { category: ownerType === 'Bien' ? 'AUTRE_BIEN' : 'AUTRE_LOCATAIRE' };
  }

  // 2) Regex texte libre + filename
  const haystack = `${category ?? ''} ${filename}`;
  for (const { pattern, cat, ownerHint } of MIGRATION_REGEX) {
    if (!pattern.test(haystack)) continue;
    if (ownerHint === 'Bien' && ownerType === 'Locataire') {
      // Q6 : DPE/diagnostic mal-attribué → flip vers Bien (caller résout bienId)
      return { category: cat, newOwnerType: 'Bien' };
    }
    if (isValidCategory(ownerType, cat)) {
      return { category: cat };
    }
    // Match pointe vers Locataire sur archive Bien → ambigu
    break;
  }

  // 3) Fallback
  return { category: ownerType === 'Bien' ? 'AUTRE_BIEN' : 'AUTRE_LOCATAIRE' };
}
