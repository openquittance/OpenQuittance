# API REST — OpenQuittance

Reference des endpoints HTTP exposés par l'app (Next.js App Router,
fichiers `src/app/api/**/route.ts`).

> **Note** : pas d'API publique officielle pour intégrations
> externes — ces endpoints servent le frontend Next.js. Documentés
> ici pour audit, debug, et intégrations futures éventuelles.
> Pas de versionnement type `/api/v1/` : la surface peut changer
> entre versions majeures.

## Conventions

### Authentification

3 niveaux d'auth :

| Type    | Mécanisme                 | Endpoints                |
|---------|---------------------------|--------------------------|
| Public  | Aucune auth requise       | `/health`, `/register`, `/public/*`, `/install/*` (si vierge), `/invitations/[token]` |
| Staff   | Session NextAuth (cookie) | `/bailleurs`, `/biens`, `/locataires`, `/quittances`, etc. |
| Tenant  | Session NextAuth tenant   | `/portail/*`             |
| Admin   | Staff + ADMIN role        | `/admin/*`               |

### Isolation multi-bailleur

Toutes les routes staff métier filtrent automatiquement par
bailleur actif (paramètre query `bailleurId` ou bailleur actif
en session). Voir [MULTI-BAILLEUR.md](MULTI-BAILLEUR.md) pour le
détail des helpers `withBailleurScope` / `requireResourceInScope`.

### Codes HTTP

| Code | Sens                                    |
|------|-----------------------------------------|
| 200  | Succès                                  |
| 201  | Création                                |
| 400  | Bad request (Zod validation, body invalide) |
| 401  | Non authentifié                         |
| 403  | Authentifié mais pas la permission      |
| 404  | Ressource non trouvée                   |
| 409  | Conflit (doublon, état incompatible)    |
| 500  | Erreur serveur                          |

### Format réponses

JSON. Erreurs standardisées :

```json
{ "error": "Message d'erreur lisible" }
```

Succès : selon endpoint (objet, tableau, ou `{ ok: true }`).

---

## Auth

### `POST /api/register`

Inscription. Premier inscrit = ADMIN. Suivants = MEMBER sur le
bailleur par défaut (si single-bailleur) ou rejetés en multi-
bailleur (passer par invitation).

Body : `{ email, password, name? }`. Retours : `{ user: {...} }`
ou 409 si email déjà existant.

### `POST /api/auth/[...nextauth]`

NextAuth — gère credentials login, Google OAuth, magic links
tenant. Endpoints standard NextAuth : `/api/auth/signin`,
`/api/auth/signout`, `/api/auth/session`, `/api/auth/callback/google`.

### `POST /api/2fa-verify`

Vérifie un code TOTP à 6 chiffres lors du login si 2FA activée.
Body : `{ code }`. Retour : 200 ou 401.

### `GET|POST /api/profil/totp[/setup|/enable|/disable]`

Cycle 2FA pour l'utilisateur courant. `/setup` génère secret +
QR code. `/enable` valide premier code. `/disable` désactive
(demande mot de passe).

---

## Bailleurs

### `GET /api/bailleurs`

Liste les bailleurs accessibles à l'utilisateur (memberships).

### `POST /api/bailleurs`

Crée un bailleur (admin global ou autorisé multi-bailleur).
Body : `{ nom, adresseLigne1, adresseLigne2, villeSignature, ... }`.

### `GET /api/bailleurs/[id]`

Détails complets d'un bailleur (incluant logo, signature, infos
légales). Filtré par membership.

### `PUT /api/bailleurs/[id]`

Modifie. Body partial Zod.

### `DELETE /api/bailleurs/[id]`

Supprime + cascade biens, locataires, quittances. Confirmation
requise côté UI.

---

## Biens

### `GET /api/biens?bailleurId=X`

Liste les biens d'un bailleur. Filtré server-side.

### `POST /api/biens`

Crée un bien. Body : `{ bailleurId, nom, adresse, codePostal,
ville, complement?, actif?, surface?, typeBien?, etage?,
dpeClasse?, dpeKwh?, dpeGes? }`.

### `GET|PUT|DELETE /api/biens/[id]`

CRUD individuel.

---

## Locataires

### `GET /api/locataires?bailleurId=X`

Liste locataires actifs d'un bailleur. Inclus relation `bien` +
`bailleur` pour affichage UI.

### `POST /api/locataires`

Crée. Body : `{ bienId, nom, prenom, email?, telephone?,
loyerNu, charges, montantDepotGarantie?, dateEntree, dateSortie?,
irlTrimestre?, irlValeurReference?, partageQuittances,
partageEtatDesLieux, partageBail, partageDDT }`.

### `GET|PUT|DELETE /api/locataires/[id]`

CRUD individuel.

### `POST /api/locataires/[id]/portail-invite`

Envoie un email d'invitation portail + crée un token magic-link
valide 14j. Si déjà actif → renvoie un nouveau lien.

### `DELETE /api/locataires/[id]/portail-invite`

Désactive accès portail + invalide tous les tokens en cours.

### `POST /api/locataires/[id]/avoir`

Crée un avoir (crédit appliqué à la prochaine quittance).
Body : `{ montant, motif }`.

### `GET /api/locataires/[id]/export-rgpd`

Génère un PDF + ZIP avec toutes les données concernant le
locataire (art. 20 RGPD). Streaming response.

---

## Quittances

### `GET /api/quittances?bailleurId=X&mois=&annee=&locataireId=&sent=`

Filtrage multi-critères.

### `POST /api/quittances`

Crée une quittance unitaire. Body : `{ locataireId, mois, annee,
datePaiement, dateEmission, commentaire?, ... }`.

### `GET|PUT|DELETE /api/quittances/[id]`

CRUD individuel.

### `GET /api/quittances/[id]/pdf?inline=1&download=1`

Stream PDF généré à la volée (PDFKit). Paramètres :
- `inline=1` : `Content-Disposition: inline` (preview).
- `download=1` : `Content-Disposition: attachment` (force DL).

### `GET /api/quittances/[id]/preview`

Retourne données pour l'email avant envoi (destinataire, objet,
corps rendu, URL PDF temporaire). Pas d'envoi effectif.

### `POST /api/quittances/[id]/email`

Envoie effectivement la quittance par email. Body : `{ to? }`
(défaut : email du locataire). Marque `emailEnvoye=true` +
`dateEmail`.

### `POST /api/quittances/generer-mois`

Génération groupée pour un mois. Body : `{ bailleurId, mois,
annee, datePaiement? }`. Retour : `{ created: N, skipped: M }`.

### `POST /api/quittances/envoyer-mois`

Envoi groupé des quittances non envoyées du mois. Body :
`{ bailleurId, mois, annee }`.

### `GET /api/quittances/preview-mois?bailleurId=X&mois=&annee=`

Liste les locataires qui auront une quittance générée + montant
calculé. Permet de vérifier avant `generer-mois`.

---

## Portail locataire

Toutes les routes `/api/portail/*` sont scopées au locataire
loggué.

### `POST /api/portail/login` + `/verify`

Magic link login. `/login` envoie email avec lien token. `/verify`
consomme le token + crée session NextAuth tenant.

### `GET /api/portail/quittances`

Liste des quittances visibles au locataire (filtré par flag
`partageQuittances`).

### `GET /api/portail/quittances/[id]/pdf?download=1`

Stream PDF de la quittance (vérif ownership server-side).

### `GET /api/portail/documents`

Documents partagés (bail, EDL, diagnostics si DDT activé).

### `GET /api/portail/archives/[id]`

Stream fichier archive si visible au locataire.

### `GET /api/portail/bailleur` + `/logo`

Infos publiques du bailleur (nom, logo, couleur) pour branding du
portail.

---

## Admin

Toutes les routes `/api/admin/*` requièrent rôle ADMIN sur au
moins un bailleur (filtré par scope).

### `GET|POST /api/admin/users`

Liste / création users staff. POST crée un User + Membership(s)
sur les bailleurs spécifiés.

### `GET|PUT|DELETE /api/admin/users/[id]`

CRUD users staff. DELETE désactive (`disabled=true`) au lieu de
supprimer (préserve audit trail).

### `GET|POST /api/admin/memberships`

Memberships actuelles + création nouvelle membership (avec ou
sans création de User).

### `PUT|DELETE /api/admin/memberships/[userId]/[bailleurId]`

Modifie rôle ou retire membership (cascade rights).

### `GET|POST|DELETE /api/admin/invitations[/[id]]`

Cycle des invitations membres pending. POST renvoie email.

### `GET|PUT /api/admin/config`

Config app singleton (AppConfig). Champs : `installed`,
`emailMethod`, `gmailRefreshTokenEnc`, `smtpHost`, etc.

### `GET|PUT|POST /api/admin/insee`

Config API INSEE pour IRL. `POST` test la clé.

### `POST /api/admin/backup/run`

Lance un backup manuel maintenant.

### `GET /api/admin/backup/runs`

Historique des runs (statut, durée, taille, erreurs).

### `POST /api/admin/backup/test-connection`

Teste credentials S3 / Drive sans backup réel.

### `GET /api/admin/backup/drive/oauth/{start,callback}`

Flow OAuth Google Drive pour backup.

---

## Documents

Génération de PDFs annexes.

### `POST /api/documents/avis-echeance`
### `POST /api/documents/courrier-revision`
### `POST /api/documents/depot-garantie`
### `POST /api/documents/etat-des-lieux`

Body varie selon doc. Stream PDF + option d'archivage.

---

## Archives (documents propriétaire + locataire)

### `GET /api/archives?ownerType=Bien|Locataire&ownerId=X`

Liste les archives rattachées à une entité.

### `POST /api/upload`

Upload fichier multipart (logo, signature, archive). Body
FormData : `file`, `kind` (logo|signature|archive), `bailleurId`,
`ownerType?`, `ownerId?`. Fichiers chiffrés AES-256-GCM côté
serveur avant écriture disque.

### `GET /api/archives/[id]?view=1`

Stream archive déchiffré. `view=1` = inline, sinon attachment.

### `DELETE /api/archives/[id]`

Supprime fichier + entrée DB.

### `GET /api/uploads/[...path]`

Stream legacy direct uploads (logo, signature) — déprécié au
profit de `/api/archives/*`.

---

## Exports

### `GET /api/exports/bailleur/[id]/zip`

ZIP complet (data + uploads) du bailleur. Stream attachment.

### `POST /api/exports/pdf`

Export PDF batch (rapport mensuel, etc.). Body selon contexte.

### `POST /api/exports/xml`

Export XML pour comptabilité.

---

## Intégrations

### `GET|POST|DELETE /api/parametres/integrations`

Statut + config des intégrations (Google OAuth, INSEE,
SMTP test).

### `GET|POST|DELETE /api/gmail/{auth,callback,disconnect,test}`

Cycle complet OAuth Gmail.

### `POST /api/parametres/test-email`

Envoi de mail test (Gmail ou SMTP).

---

## IRL (Indexation Référence Loyers)

### `GET /api/irl/indices`

Liste des indices IRL trimestriels disponibles.

### `GET /api/irl/eligibles?bailleurId=X`

Locataires éligibles à révision (date entrée > 12 mois).

### `GET|POST /api/irl/revisions`

Cycle révisions. POST crée une révision + génère courrier.

### `GET /api/irl/revisions/[id]/recommande`

Génère le PDF "recommandé avec AR" associé.

### `POST /api/irl/insee/sync` + `/test`

Sync manuelle / test connexion API INSEE.

---

## Health + public

### `GET /api/health`

Status de l'app. `{ ok: true, version: "3.7.1", db: "ok" }`.

### `GET /api/public/config`

Config publique non sensible (nom app, mode demo flag).

### `GET|POST /api/public/early-access`

Gestion liste d'attente (si activée, hors scope OSS).

---

## Dashboard

### `GET /api/dashboard?bailleurId=X`

Stats agrégées pour le dashboard staff.

### `GET /api/dashboard/alertes?bailleurId=X`

Alertes contextuelles (locataires sans email, quittances non
envoyées du mois, révisions IRL possibles, etc.).

---

## Install wizard

Disponibles uniquement si `AppConfig.installed=false`.

### `POST /api/install/admin`

Crée le premier compte ADMIN.

### `POST /api/install/bailleur`

Crée le premier bailleur.

### `POST /api/install/complete`

Marque l'install comme terminée (`AppConfig.installed=true`).

---

## Audit

### `GET /api/audit?type=&userId=&bailleurId=&from=&to=`

Journal d'audit (login, modifications sensibles, exports RGPD).
Réservé ADMIN.

---

## Conventions Zod

Toutes les routes valident leur body via Zod schemas définis dans
`src/lib/validation.ts` (mode `safeParse`, retour 400 si erreur).
Exemples de schemas : `bailleurSchema`, `locataireSchema`,
`quittanceSchema`.

## Headers de sécurité

CSP + HSTS configurés via `next.config.js`. CSRF natif Next.js
App Router (vérification origin sur POST/PUT/DELETE).
