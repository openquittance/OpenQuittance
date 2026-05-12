import { z } from 'zod';

// v2.8.0 Vague 2 — pages légales par bailleur. Whitelist formeJuridique.
export const FORME_JURIDIQUE_VALUES = [
  'SCI', 'SARL', 'SA', 'EURL', 'AUTO_ENTREPRENEUR', 'PARTICULIER', 'AUTRE',
] as const;

// Base ZodObject pour permettre `.partial()` sur PUT. Validation
// conditionnelle (SIRET obligatoire si société) appliquée séparément
// dans `bailleurSchema` (POST) via `.refine()`.
const bailleurBaseSchema = z.object({
  nom: z.string().min(1, 'Nom requis'),
  rcs: z.string().optional().nullable(),
  adresseLigne1: z.string().min(1, 'Adresse requise'),
  adresseLigne2: z.string().min(1, 'Code postal et ville requis'),
  villeSignature: z.string().min(1, 'Ville de signature requise'),
  pdfCouleur: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hex (#RRGGBB) requise').default('#1a3a5c'),
  pdfPolice: z.string().default('Helvetica'),
  // v3.0.1 — opacité logo zone signature PDFs (0-100). Default 30 côté DB.
  // Pas de .nullable() : champ INT NOT NULL avec default Prisma.
  signatureLogoOpacity: z.number().int().min(0).max(100).optional(),
  actif: z.boolean().default(true),
  // v2.8.0 — informations légales (LCEN art. 6 + RGPD art. 13).
  // Tous nullable — usage perso sans commercialisation OK sans remplir.
  raisonSociale: z.string().optional().nullable(),
  formeJuridique: z.enum(FORME_JURIDIQUE_VALUES).optional().nullable(),
  // SIRET = 14 chiffres si fourni (vide accepté en update partial).
  siret: z.string().regex(/^\d{14}$/, 'SIRET = 14 chiffres').optional().nullable().or(z.literal('')),
  adresseLegale: z.string().optional().nullable(),
  emailRgpd: z.string().email('Email invalide').optional().nullable().or(z.literal('')),
  directeurPublication: z.string().optional().nullable(),
  hebergeur: z.string().optional().nullable(),
});

/** Schema POST — validation conditionnelle SIRET obligatoire si société. */
export const bailleurSchema = bailleurBaseSchema.refine(
  (data) => {
    const isCompany = data.formeJuridique
      && ['SCI', 'SARL', 'SA', 'EURL'].includes(data.formeJuridique);
    if (isCompany && (!data.siret || data.siret === '')) return false;
    return true;
  },
  { message: 'SIRET obligatoire pour les sociétés (SCI/SARL/SA/EURL)', path: ['siret'] },
);

/** Schema PUT — partial sans contrainte SIRET (l'admin peut éditer un seul champ). */
export const bailleurUpdateSchema = bailleurBaseSchema.partial();

// v2.6.0 Feature B (Wizard logement) — whitelist typeBien et classes DPE
// (cf. SESSION-LOGS Session 0 Q10). CHAMBRE = colocation 1 pièce ; pas
// de LOFT/DUPLEX volontairement (peuvent être tagués AUTRE).
export const TYPE_BIEN_VALUES = [
  'STUDIO', 'T1', 'T2', 'T3', 'T4', 'T5_PLUS',
  'MAISON', 'CHAMBRE', 'LOCAL_COMMERCIAL', 'AUTRE',
] as const;
export const DPE_CLASSE_VALUES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

export const bienSchema = z.object({
  bailleurId: z.string().min(1),
  nom: z.string().min(1),
  adresse: z.string().min(1),
  codePostal: z.string().min(1),
  ville: z.string().min(1),
  complement: z.string().optional().nullable(),
  actif: z.boolean().default(true),
  // v2.6.0 Feature B — métadonnées propriétaire (tous nullable).
  surface: z.coerce.number().positive().optional().nullable(),
  typeBien: z.enum(TYPE_BIEN_VALUES).optional().nullable(),
  etage: z.coerce.number().int().optional().nullable(),
  dpeClasse: z.enum(DPE_CLASSE_VALUES).optional().nullable(),
  dpeKwh: z.coerce.number().nonnegative().optional().nullable(),
  dpeGes: z.coerce.number().nonnegative().optional().nullable(),
  annonceTexte: z.string().optional().nullable(),
  // v2.6.1-rc2 : meta JSON inputs onglet Annonce (équipements, contact,
  // disponibilité, adresseChoice). Validation laxiste — la structure est
  // fixée côté UI / buildAnnonce et n'a pas besoin de schema strict ici.
  // Accepte un objet quelconque ou null/undefined. Cast `any` côté Prisma
  // (le type généré JsonValue n'inclut pas `unknown`).
  annonceMeta: z.record(z.unknown()).optional().nullable(),
  coverPhotoArchiveId: z.string().optional().nullable(),
});

/**
 * Schema PUT /api/biens/[id] — bailleurId figé après création (rattachement
 * d'un Bien à un autre bailleur n'est pas un usage attendu, fait via
 * DELETE + recréation si vraiment nécessaire).
 *
 * Hotfix v2.7.0-rc3 : Prisma a 2 input types pour update (BienUpdateInput
 * via relations vs BienUncheckedUpdateInput avec FK direct). TypeScript ne
 * peut pas choisir si parsed.data contient potentiellement bailleurId →
 * `Type 'string | undefined' is not assignable to type 'undefined'`. En
 * omettant bailleurId du schema PUT, on contraint le type narrow et on
 * évite tout cast `as never`.
 */
export const bienUpdateSchema = bienSchema.partial().omit({ bailleurId: true });

export const locataireSchema = z.object({
  bienId: z.string().min(1),
  nom: z.string().min(1),
  prenom: z.string().min(1),
  email: z.string().email('Email invalide').or(z.literal('')).optional().nullable(),
  telephone: z.string().optional().nullable(),
  loyerNu: z.coerce.number().nonnegative(),
  charges: z.coerce.number().nonnegative(),
  montantDepotGarantie: z.coerce.number().nonnegative().optional().nullable(),
  irlTrimestre: z.coerce.number().int().min(1).max(4).optional().nullable(),
  irlValeurReference: z.coerce.number().positive().optional().nullable(),
  dateEntree: z.string().min(1),
  dateSortie: z.string().optional().nullable(),
  actif: z.boolean().default(true),
  // Phase 1 doc sharing + v2.5.0 partageDDT — toggles portail
  // (cf. docs/PORTAIL-LOCATAIRE.md + SESSION-LOGS Feature A)
  portailActif: z.boolean().optional(),
  partageQuittances: z.boolean().optional(),
  partageEtatDesLieux: z.boolean().optional(),
  partageBail: z.boolean().optional(),
  partageDDT: z.boolean().optional(),
});

const avoirFields = {
  avoirAppliqueLoyer: z.coerce.number().nonnegative().optional(),
  avoirAppliqueCharges: z.coerce.number().nonnegative().optional(),
  montantPercu: z.coerce.number().nonnegative().optional().nullable(),
  surplusLoyer: z.coerce.number().nonnegative().optional(),
  surplusCharges: z.coerce.number().nonnegative().optional(),
  commentaire: z.string().optional().nullable(),
};

export const quittanceCreateSchema = z.object({
  locataireId: z.string().min(1),
  mois: z.coerce.number().int().min(1).max(12),
  annee: z.coerce.number().int().min(2000).max(2100),
  datePaiement: z.string().min(1),
  dateEmission: z.string().min(1),
  ...avoirFields,
});

export const quittanceUpdateSchema = z.object({
  loyerNu: z.coerce.number().nonnegative().optional(),
  charges: z.coerce.number().nonnegative().optional(),
  montantTotal: z.coerce.number().optional(),
  datePaiement: z.string().min(1).optional(),
  dateEmission: z.string().min(1).optional(),
  ...avoirFields,
});

export const genererMoisSchema = z.object({
  bailleurId: z.string().min(1),
  mois: z.coerce.number().int().min(1).max(12),
  annee: z.coerce.number().int().min(2000).max(2100),
  datePaiement: z.string().min(1),
  dateEmission: z.string().min(1),
});

export const envoyerMoisSchema = z.object({
  bailleurId: z.string().min(1),
  mois: z.coerce.number().int().min(1).max(12),
  annee: z.coerce.number().int().min(2000).max(2100),
});

export const exportSchema = z.object({
  bailleurId: z.string().min(1),
  du: z.string().min(1),
  au: z.string().min(1),
  bienId: z.string().optional().nullable(),
  locataireId: z.string().optional().nullable(),
});

export const parametresSchema = z.object({
  emailMethod: z.enum(['gmail_api', 'smtp']).optional(),
  smtpHost: z.string().optional().nullable(),
  smtpPort: z.coerce.number().int().optional().nullable(),
  smtpUser: z.string().optional().nullable(),
  smtpPass: z.string().optional().nullable(),
  emailObjetTemplate: z.string().optional(),
  emailCorpsTemplate: z.string().optional(),
  emailSignatureHtml: z.string().optional().nullable(),
});

export const registerSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  email: z.string().email('Email invalide'),
  password: z.string().min(8, '8 caractères minimum'),
});

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

export const onboardingSchema = z.object({
  bailleur: bailleurSchema,
  bien: bienSchema.omit({ bailleurId: true }).optional(),
  locataire: locataireSchema.omit({ bienId: true }).optional(),
});

// v3.2.0-rc1 — Phase 3 Session 1 : config intégrations externes
// (Google OAuth login + Gmail API). Pattern symétrique aux secrets
// backup/Drive (rc10/rc11) : sentinelle `'***'` acceptée pour
// préserver valeur DB côté route handler.
export const integrationsConfigSchema = z.object({
  googleClientId: z.union([
    z.literal(''),
    z.literal('***'),
    z.string().min(1, 'Client ID Google requis'),
  ]).optional().nullable(),
  googleClientSecret: z.union([
    z.literal(''),
    z.literal('***'),
    z.string().min(1, 'Client Secret Google requis'),
  ]).optional().nullable(),
});


// v3.1.0 — Phase 2 backup cloud S3-compatible.
//
// Cron : 5 champs (minute heure jour mois jourSemaine), chaque champ
// accepte chiffres, *, virgules, tirets, slash. Validation lâche : le
// runtime node-cron rejettera les expressions invalides.
const CRON_TOKEN = /^[\d*,\-/]+$/;
const cronSchema = z.string().refine(
  (s) => {
    const parts = s.trim().split(/\s+/);
    return parts.length === 5 && parts.every(p => CRON_TOKEN.test(p));
  },
  { message: 'Cron invalide (5 champs : "0 3 * * *" pour quotidien 3h)' },
);

export const backupConfigSchema = z.object({
  backupEnabled: z.boolean().default(false),
  // v3.1.0-rc5 — choix du backend de stockage. Default 's3' pour
  // compat config existante.
  backupStorageType: z.enum(['s3', 'drive']).default('s3'),
  backupS3Endpoint: z.string().url('URL endpoint invalide').optional().nullable().or(z.literal('')),
  backupS3Region: z.string().optional().nullable(),
  backupS3Bucket: z.string()
    .regex(/^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$/, 'Nom de bucket S3 invalide (3-63 chars, alphanum + . -)')
    .optional().nullable().or(z.literal('')),
  backupS3ForcePathStyle: z.boolean().default(false),
  backupS3AccessKeyId: z.string().optional().nullable(),
  // Secret en clair côté input (chiffré côté API avant insert DB). La
  // sentinelle `***` côté GET → préservée par le route handler au PUT.
  backupS3SecretKey: z.string().optional().nullable(),
  // Drive : ID du dossier cible (URL contient /folders/<id>). Le
  // refresh_token n'est PAS settable via ce schema (set uniquement par
  // le callback OAuth /api/admin/backup/drive/oauth/callback).
  backupDriveFolderId: z.string().optional().nullable().or(z.literal('')),
  // v3.1.0-rc10 — credentials OAuth Drive saisis via UI (plus dans .env).
  // Sentinelle `***` côté GET → préservée par route handler au PUT.
  googleDriveClientId: z.string().optional().nullable(),
  googleDriveClientSecret: z.string().optional().nullable(),
  backupSchedule: cronSchema.optional().nullable().or(z.literal('')),
  backupRetentionDays: z.number().int().min(7).max(3650).default(30),
  // v3.1.0-rc11 — accept sentinelle masque `***` (route handler la
  // remplace par la valeur DB existante). Sans cette branche, Zod
  // rejette `***` car min(12) → 400 → toggle activation/désactivation
  // ne se persiste jamais quand passphrase déjà configurée.
  backupEnvPassphrase: z.union([
    z.literal(''),
    z.literal('***'),
    z.string().min(12, 'Passphrase minimum 12 caractères'),
  ]).optional().nullable(),
  backupNotifySuccess: z.boolean().default(false),
}).refine(
  (data) => {
    // Si backupEnabled=true, exiger les champs critiques selon le storage.
    // Les secrets masqués `***` sont remplacés par la valeur DB existante
    // dans le route handler.
    if (!data.backupEnabled) return true;
    if (!data.backupSchedule || !data.backupEnvPassphrase) return false;
    if (data.backupStorageType === 's3') {
      return !!(data.backupS3Endpoint && data.backupS3Bucket
        && data.backupS3AccessKeyId && data.backupS3SecretKey);
    }
    if (data.backupStorageType === 'drive') {
      // v3.1.0-rc10 : exiger credentials Google + folderId. Le
      // refresh_token est set par OAuth callback, pas via ce schema.
      // Les secrets `***` masqués sont remplacés par valeur DB côté
      // route handler avant ce check (le payload sortant du UI peut
      // contenir `***`).
      const hasClientId = !!data.googleDriveClientId
        && data.googleDriveClientId !== '';
      const hasClientSecret = !!data.googleDriveClientSecret
        && data.googleDriveClientSecret !== '';
      return hasClientId && hasClientSecret && !!data.backupDriveFolderId;
    }
    return false;
  },
  { message: 'Champs obligatoires manquants pour le backup activé (storage + schedule + passphrase)' },
);


