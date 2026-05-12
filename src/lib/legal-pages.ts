/**
 * Templates pages légales par bailleur (v2.8.0 Vague 2).
 *
 * Pure functions sync. Génèrent mentions légales (LCEN art. 6) et
 * politique de confidentialité (RGPD art. 13) à partir des fields
 * légaux du Bailleur. Champs vides → "Non renseigné" (transparence
 * — pas de masquage).
 */

import type { Bailleur } from '@prisma/client';

const FORME_JURIDIQUE_LABELS: Record<string, string> = {
  SCI: 'Société Civile Immobilière (SCI)',
  SARL: 'SARL',
  SA: 'Société Anonyme',
  EURL: 'EURL',
  AUTO_ENTREPRENEUR: 'Auto-entrepreneur',
  PARTICULIER: 'Particulier',
  AUTRE: 'Autre',
};

function ifNotEmpty(s: string | null | undefined, fallback = 'Non renseigné'): string {
  return s && s.trim() ? s : fallback;
}

export interface LegalSection {
  title: string;
  content: string;
}

/**
 * Mentions légales (LCEN art. 6 III). Sections obligatoires :
 * éditeur, hébergeur, directeur de publication, propriété intellectuelle.
 */
export function buildMentionsLegales(bailleur: Bailleur): LegalSection[] {
  const formeLib = bailleur.formeJuridique
    ? FORME_JURIDIQUE_LABELS[bailleur.formeJuridique] ?? bailleur.formeJuridique
    : 'Non renseigné';
  return [
    {
      title: 'Éditeur du site',
      content: [
        `Nom commercial : ${bailleur.nom}`,
        `Raison sociale : ${ifNotEmpty(bailleur.raisonSociale)}`,
        `Forme juridique : ${formeLib}`,
        `SIRET : ${ifNotEmpty(bailleur.siret)}`,
        `Siège social / adresse légale : ${ifNotEmpty(bailleur.adresseLegale)}`,
        `Adresse de correspondance : ${bailleur.adresseLigne1}, ${bailleur.adresseLigne2}`,
        bailleur.rcs ? `RCS : ${bailleur.rcs}` : null,
        bailleur.telephone ? `Téléphone : ${bailleur.telephone}` : null,
      ].filter(Boolean).join('\n'),
    },
    {
      title: 'Directeur de la publication',
      content: ifNotEmpty(bailleur.directeurPublication, bailleur.nom),
    },
    {
      title: 'Hébergeur',
      content: ifNotEmpty(
        bailleur.hebergeur,
        'Auto-hébergement sur infrastructure dédiée du bailleur. '
        + 'Pour toute question relative à l\'hébergement, contactez le directeur '
        + 'de la publication.',
      ),
    },
    {
      title: 'Propriété intellectuelle',
      content:
        'L\'application OpenQuittance est un logiciel open source distribué sous '
        + 'licence MIT (cf. https://github.com/grx14/quittances-app). Les '
        + 'données métier (quittances, baux, locataires) appartiennent à '
        + `${bailleur.nom}. Toute reproduction non autorisée est interdite.`,
    },
    {
      title: 'Contact',
      content: bailleur.emailRgpd
        ? `Pour toute question : ${bailleur.emailRgpd}`
        : 'Contactez directement le bailleur via les coordonnées de votre bail.',
    },
  ];
}

/**
 * Politique de confidentialité (RGPD art. 13). Sections obligatoires :
 * responsable traitement, finalités + bases légales, données collectées,
 * destinataires, durées, droits, contact DPO/CNIL.
 */
export function buildPolitiqueConfidentialite(bailleur: Bailleur): LegalSection[] {
  return [
    {
      title: 'Responsable du traitement',
      content: [
        bailleur.nom,
        ifNotEmpty(bailleur.raisonSociale, ''),
        ifNotEmpty(bailleur.adresseLegale, `${bailleur.adresseLigne1}, ${bailleur.adresseLigne2}`),
        bailleur.emailRgpd ? `Contact RGPD : ${bailleur.emailRgpd}` : 'Contact RGPD : non renseigné — utilisez les coordonnées de votre bail.',
      ].filter(Boolean).join('\n'),
    },
    {
      title: 'Finalités du traitement',
      content:
        'Les données collectées sont traitées pour les finalités suivantes :\n'
        + '- Gestion des contrats de location (bail, état des lieux, dépôt de garantie)\n'
        + '- Émission et envoi des quittances de loyer\n'
        + '- Suivi des paiements et révisions de loyer (IRL)\n'
        + '- Conservation des documents légalement obligatoires\n'
        + '- Mise à disposition d\'un portail locataire pour consultation des documents',
    },
    {
      title: 'Bases légales',
      content:
        'Le traitement est fondé sur :\n'
        + '- L\'exécution du contrat de bail (article 6.1.b RGPD) pour la majorité '
        + 'des données locataires\n'
        + '- Le respect d\'obligations légales (article 6.1.c RGPD) pour la '
        + 'conservation des documents fiscaux et locatifs\n'
        + '- L\'intérêt légitime du bailleur (article 6.1.f RGPD) pour la sécurité '
        + 'de l\'application (logs d\'audit, anti-abus)',
    },
    {
      title: 'Données collectées',
      content:
        'Locataire : nom, prénom, email (optionnel), téléphone (optionnel), '
        + 'dates d\'entrée et de sortie, montants loyer/charges/dépôt de garantie, '
        + 'historique des quittances, documents associés au bail (état des lieux, '
        + 'diagnostics).\n\n'
        + 'Staff : nom, email, mot de passe haché (bcrypt), rôle, journal d\'audit '
        + 'des actions sur les données.',
    },
    {
      title: 'Destinataires',
      content:
        'Les données sont accessibles uniquement aux personnes habilitées par '
        + `${bailleur.nom} (administrateurs, membres du staff). Aucun transfert `
        + 'commercial à des tiers.\n\n'
        + 'Sous-traitants techniques éventuels :\n'
        + '- Service d\'envoi d\'email (Gmail / SMTP) si configuré par le bailleur — '
        + 'transfert hors UE possible (Google LLC, USA) sous Data Privacy Framework.\n'
        + '- Hébergeur : voir mentions légales.',
    },
    {
      title: 'Durées de conservation',
      content:
        '- Quittances de loyer : 5 ans après la fin du bail (loi du 24 mars 2014).\n'
        + '- Données locataires actives : pendant toute la durée du bail.\n'
        + '- Données locataires inactifs : portail désactivé automatiquement '
        + '5 ans après la date de sortie ; les quittances et archives sont '
        + 'conservées au titre des obligations comptables (jusqu\'à 10 ans pour '
        + 'les SCI / sociétés).\n'
        + '- Journal d\'audit : 1 an glissant.\n'
        + '- Magic links portail locataire : 15 minutes (usage unique).',
    },
    {
      title: 'Vos droits',
      content:
        'Conformément au RGPD (articles 15 à 22), vous disposez des droits '
        + 'suivants :\n'
        + '- Droit d\'accès : obtenir la copie de vos données.\n'
        + '- Droit de rectification : corriger une donnée inexacte.\n'
        + '- Droit à l\'effacement : demander la suppression (sous réserve des '
        + 'obligations légales de conservation).\n'
        + '- Droit à la portabilité : recevoir vos données dans un format '
        + 'structuré (export ZIP).\n'
        + '- Droit d\'opposition / limitation : limiter le traitement.\n\n'
        + (bailleur.emailRgpd
          ? `Pour exercer vos droits, contactez : ${bailleur.emailRgpd}.`
          : 'Pour exercer vos droits, contactez le bailleur via les coordonnées '
            + 'de votre bail.')
        + '\n\nEn cas de désaccord, vous pouvez saisir la CNIL :\n'
        + 'https://www.cnil.fr/fr/plaintes',
    },
    {
      title: 'Cookies',
      content:
        'L\'application n\'utilise que des cookies strictement nécessaires à '
        + 'son fonctionnement (session NextAuth, protection CSRF). Aucun '
        + 'cookie de tracking, analytics ou publicité.\n\n'
        + 'Ces cookies sont dispensés de consentement préalable au sens de '
        + 'l\'article 82 de la loi Informatique et Libertés.',
    },
    {
      title: 'Sécurité',
      content:
        'Les mesures techniques mises en œuvre incluent : chiffrement AES-256-GCM '
        + 'des champs sensibles en base, hachage bcrypt des mots de passe, '
        + 'authentification à 2 facteurs (TOTP) optionnelle, isolation '
        + 'multi-bailleur côté serveur, journal d\'audit des actions, '
        + 'expiration automatique des sessions.\n\n'
        + 'En cas de violation de données présentant un risque pour vos droits, '
        + 'vous serez informé conformément à l\'article 34 RGPD (délai 72h).',
    },
  ];
}

/**
 * Footer RCS pour PDF (v2.8.0-rc3 refacto cohérence Infos/Légal).
 *
 * Source of truth = onglet Légal (siret + raisonSociale + adresseLegale).
 * Format : "{raisonSociale} · SIRET {XXX XXX XXX XXXXX} · {adresseLegale}"
 * SIRET absent → fallback ancien `bailleur.rcs` string (compat rétro).
 * Tout absent → null (footer omis).
 */
export function formatRcsFooter(bailleur: {
  nom: string;
  rcs: string | null;
  raisonSociale: string | null;
  siret: string | null;
  adresseLegale: string | null;
}): string | null {
  const cleanSiret = bailleur.siret?.replace(/\s/g, '') ?? '';
  if (/^\d{14}$/.test(cleanSiret)) {
    const formatted = `${cleanSiret.slice(0, 3)} ${cleanSiret.slice(3, 6)} ${cleanSiret.slice(6, 9)} ${cleanSiret.slice(9, 14)}`;
    const denom = bailleur.raisonSociale?.trim() || bailleur.nom;
    const parts = [denom, `SIRET ${formatted}`];
    if (bailleur.adresseLegale?.trim()) parts.push(bailleur.adresseLegale.trim());
    return parts.join(' · ');
  }
  // Fallback legacy rcs string (compat rétro pré-v2.8)
  if (bailleur.rcs?.trim()) return bailleur.rcs.trim();
  return null;
}

/** Slug bailleur — réutilise la logique du export ZIP (cf. zip-export.ts). */
export function bailleurSlug(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sans-nom';
}
