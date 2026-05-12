# Roadmap future — idées hors scope v2.4.0

> Idées capturées pendant le dev v2.4.0 pour des versions ultérieures.
> Pas d'engagement de timing, juste un dépôt pour ne pas les perdre.
> Document vivant : toute idée hors scope du tag courant peut atterrir ici.

## v2.5.0 — gestion patrimoniale élargie

### Documents propriétaire (niveau Bien)

Aujourd'hui, `Archive` est principalement attachée à un Locataire. Pour les
documents qui concernent le bien propriétaire et qui survivent aux
changements de locataire, étendre l'usage de `ownerType='Bien'` (déjà
supporté techniquement) avec des catégories prédéfinies :

- **Acquisition** : acte de vente, frais de notaire, plan cadastral
- **Financement** : crédit immobilier, tableau d'amortissement, attestation banque
- **Diagnostics** : DPE, amiante, électricité, gaz, plomb, ERP/ERNT
- **Assurance** : assurance PNO, GLI (Garantie Loyers Impayés)
- **Copropriété** : règlement, PV d'AG, quittances de syndic
- **Fiscalité** : avis de taxe foncière, déclaration IR/IFI

Vue par Bien : "Tous les documents de ce logement" en plus de la vue
actuelle par Locataire. Catégories en dropdown prédéfinies, texte libre
toujours possible en option.

### Wizard "Nouveau logement"

Bouton `+ Nouveau logement` qui guide pas à pas :

1. Créer le Bien (adresse, surface, type, photos)
2. Uploader les docs clés (acte, DPE, diagnostics obligatoires)
3. Créer un Locataire **OU** marquer le logement comme vacant
4. Si vacant : générer un texte d'annonce locative (à copier-coller sur
   LeBonCoin / SeLoger — les API officielles ne sont pas accessibles aux
   particuliers)

Effort modéré, gain UX élevé (surtout pour les bailleurs au-delà de 2-3
biens).

### Export ZIP organisé

Bouton "Exporter ce bailleur" → archive ZIP avec arborescence claire :

```
Bailleur1/
├── Biens/
│   └── Bien1/
│       ├── Documents/        (archives Bien — DPE, acte, etc.)
│       └── Locataires/
│           └── Locataire1/
│               ├── Quittances/2026/
│               ├── Documents/  (archives Locataire — bail, EDL, etc.)
│               └── ...
```

Sert à la fois pour archivage manuel local et comme prérequis du backup
cloud (v3.0).

## v2.6.0 — collaboration

### UI Membres complète

Aujourd'hui (v2.4.0), la gestion `BailleurMembership` se fait via la DB
ou un script de seed. Pour la v2.6 :

- Création de membres via UI (au lieu d'invitation manuelle DB)
- Choix des bailleurs accessibles par membre via cases à cocher
- Audit log des changements de membership (déjà partiellement en place
  via `audit.ts`)
- Page Paramètres > Membres scopée par bailleur (ne montre que les
  membres ayant accès au bailleur actif)

## v3.0.0 — distribution publique (vision)

### Backup cloud automatique

Argument commercial pour la version managée : "vos données + documents
backupés automatiquement sur votre propre cloud".

- Connexion OAuth à Google Drive / OneDrive / Dropbox
- Backup périodique de la section d'un bailleur (DB + fichiers Archive)
  vers un dossier choisi par le bailleur
- **Mono-directionnel** app → cloud (pas de bi-sync, complexité trop
  élevée pour un gain limité)
- Reprend l'arborescence de l'export ZIP organisé (v2.5)

Alternative simple déjà disponible aujourd'hui pour les utilisateurs
auto-hébergés : Synology Drive intégré au NAS, qui peut sync le dossier
de l'app vers Google Drive sans que l'app le sache.

### Multi-tenant commercialisable

- Activation hébergement managé pour utilisateurs sans NAS
- Facturation par bailleur géré (modèle Plausible / Bitwarden Cloud)
- Tier gratuit limité + tiers payants
- Onboarding sans Docker

## Idées notées hors priorisation

- API publique pour intégrations comptables (Sage, Cegid)
- Connecteur banque (Bridge / Tink) pour rapprochement automatique des
  paiements
- Application mobile native (iOS/Android) pour le portail locataire
- Notifications push portail (rappel "votre quittance est disponible")
- Génération automatique des déclarations fiscales 2044 / 2042-C-PRO
  (déjà flagué `#16` dans le backlog d'origine)

---

*Document vivant. Ajouter ici toute idée hors scope du tag courant pour la
conserver. Une fois une idée intégrée à un Lot d'une version, la déplacer
dans la note de cadrage de cette version et la retirer d'ici.*
