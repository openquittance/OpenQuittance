# Quittances — Roadmap v2

Document de spécification pour la v2. La v1 (taggée `v1.0.0`) reste fonctionnelle ; la v2 est développée sur la branche `v2`.

Au fur et à mesure que les fonctionnalités sont livrées, elles sont retirées de ce document et intégrées au README principal.

---

## Périmètre v2

### 1. Indexation des loyers (IRL)

- Calcul automatique de la révision annuelle selon l'IRL (Indice de Référence des Loyers, INSEE)
- Récupération automatique de l'IRL du trimestre applicable via l'API INSEE (séries temporelles)
- Notification bailleur dès qu'une révision est possible (date anniversaire du bail atteinte + IRL disponible)
- Génération d'un courrier de révision au locataire en PDF, mentionnant l'ancien loyer, le nouvel IRL, le nouveau loyer et sa date d'effet
- Historique de toutes les révisions appliquées par bail
- Saisie manuelle possible si pas de clé INSEE

### 2. Documents locatifs complets

Au-delà de la quittance de loyer existante, ajouter :

- **Avis d'échéance** (appel de loyer avant paiement)
- **Quittance de dépôt de garantie** (remise en début de bail)
- **État des lieux d'entrée / de sortie** (modèle PDF pré-rempli avec infos bien + locataire)
- **Courrier de révision IRL** (cf. section 1)
- **Archivage de documents** : associer n'importe quel fichier à un bien ou à un bail (contrat signé, DPE, amiante, plomb, assurance GLI…) — stockage dans le volume `uploads`, jamais en base

### 3. Dashboard & alertes intelligentes

- Vue globale : loyers attendus vs encaissés, charges, taux d'occupation
- Alertes automatiques sur le tableau de bord :
  - Bail arrivant à expiration (paramétrable : 1, 2 ou 3 mois avant)
  - Révision IRL disponible et non encore appliquée
  - Locataire sans quittance générée sur le mois en cours
- Toutes les alertes actionnables en un clic depuis le dashboard

### 4. Double facteur (2FA / TOTP)

- Disponible pour tous les comptes (pas seulement admins)
- Optionnel : activation/désactivation par chaque utilisateur depuis son profil
- Compatible avec Google Authenticator, Authy, 1Password (RFC 6238)
- ADMIN voit la liste des membres avec/sans 2FA, mais ne peut pas forcer son activation (RGPD)
- 8 codes de secours générés à l'activation, à usage unique, téléchargeables

### 5. Audit log

- Traçage de chaque action significative : création/modification/suppression de quittance, envoi email, changement de rôle, connexion, export…
- Champs : horodatage, auteur, type d'action, objet concerné, adresse IP
- Consultation par les ADMIN dans **Paramètres → Journal d'activité**
- Rétention configurable (30, 90, 365 jours) avec purge automatique
- Export CSV du journal

### 6. Chiffrement des données sensibles

Champs chiffrés au repos en base via AES-256-GCM (clé `ENCRYPTION_SECRET`) :

- Emails des locataires
- IBAN (nouveau champ pour virement)
- Tokens OAuth Gmail (refresh token actuellement en clair)
- Tokens d'invitation

Règles :

- Déchiffrement à la volée côté serveur, jamais en logs ni exports bruts
- Clé `ENCRYPTION_SECRET` jamais en base, uniquement en env
- Documenter la procédure de rotation de clé (script de migration)
- ⚠️ Si la clé est perdue, données chiffrées illisibles → alerte explicite dans le README

### 7. UX / Interface

#### Mode sombre natif

- Thème clair / sombre / système, modifiable dans les préférences utilisateur
- Variables CSS token-based : la charte couleur bailleur s'adapte aux deux modes

#### Mobile-first responsive

- Conception ≥ 375 px (iPhone SE), validée tablette + desktop
- Bottom-bar navigation sur mobile, sidebar rétractable sur desktop
- Actions courantes (générer quittance, envoyer email) en 2 taps

#### Onboarding wizard

- Première connexion → wizard 4 étapes : bailleur → bien → locataire → première quittance
- Barre de progression persistante, reprise possible
- Checklist sur dashboard tant que onboarding non complété

#### Aperçu PDF live

- Avant génération/envoi, rendu PDF dans le navigateur via `pdf.js`
- Modification à la volée (date paiement, commentaire) sans quitter la page

#### Upload drag & drop

- Logos et signatures bailleurs : drag & drop ou clic
- Preview immédiate, recadrage optionnel (libre ou carré)
- PNG, JPEG, WebP, max 5 Mo

---

## Nouvelles dépendances envisagées

| Brique | Outil | Justification |
|---|---|---|
| 2FA | `otplib` + `qrcode` | TOTP RFC 6238 standard |
| Chiffrement | `node:crypto` (natif) | Pas de dépendance externe |
| Aperçu PDF | `pdfjs-dist` | Rendu côté client |
| IRL | `fetch` natif vers API INSEE | Pas de SDK officiel |
| Recadrage image | `react-easy-crop` | À évaluer vs solution custom |

---

## Nouvelles variables d'environnement

```bash
# Chiffrement AES-256-GCM (32 octets hex, openssl rand -hex 32)
ENCRYPTION_SECRET=

# API INSEE pour récupération automatique IRL (optionnel)
INSEE_API_KEY=
```

---

## Phasage proposé

L'ordre minimise les retravaux : on pose les fondations cross-cutting avant le métier.

1. **Phase 0 — Fondations** *(une seule fois, casse rien)*
   - Helper `lib/crypto.ts` (encrypt/decrypt AES-256-GCM)
   - Helper `lib/audit.ts` (write log)
   - Schema : table `AuditLog`, champs chiffrés (préparer prefixe `enc:` pour distinguer)
   - Migration des données existantes (refresh token Gmail)

2. **Phase 1 — 2FA**
   - Schema : `User.totpSecret`, `User.totpEnabled`, `User.backupCodes` (chiffrés)
   - UI : page `/profil/securite` (activation, QR code, codes de secours)
   - Auth : second-factor check au login si activé

3. **Phase 2 — Documents et archives**
   - Schema : `Document` (type enum, ref polymorphe vers Bien/Locataire/Quittance), `Archive` (file metadata)
   - PDF generators : `pdf-documents.ts` (avis échéance, dépôt garantie, état des lieux)
   - UI : page de génération par type, sélecteur de bénéficiaire

4. **Phase 3 — IRL**
   - Schema : `RevisionIRL` (bail ref, ancien/nouveau loyer, IRL ref/nouveau, date effet, statut)
   - Schema : `IndiceIRL` (cache local des valeurs INSEE par trimestre)
   - Lib : client INSEE + calcul de révision
   - PDF : courrier de révision
   - UI : page IRL dans paramètres + alerte dashboard

5. **Phase 4 — Dashboard alertes**
   - API `/api/dashboard/alertes` agrégeant les 3 types d'alertes
   - UI : composants Alert sur dashboard avec actions

6. **Phase 5 — UX overhaul**
   - Mode sombre amélioré (audit des composants)
   - Onboarding wizard
   - Aperçu PDF avec `pdfjs-dist`
   - Refonte mobile (bottom-bar, sidebar rétractable)
   - Drag & drop upload + recadrage

7. **Phase 6 — Cleanup et polissage**
   - README v2 complet
   - Tests E2E des flux critiques
   - Doc procédure rotation `ENCRYPTION_SECRET`

---

## Risques identifiés

- **Rotation `ENCRYPTION_SECRET`** : impossible sans script de migration. Documenter clairement.
- **API INSEE** : rate limiting + format des réponses peu stable. Caché localement pour éviter ré-appels.
- **2FA** : si un user perd son téléphone ET ses codes de secours, seul un ADMIN peut désactiver son 2FA. Documenter la procédure.
- **Audit log retention** : table peut grossir vite. Cron de purge nécessaire.
- **Mobile responsive** : refonte CSS non triviale. Faire une branche dédiée pour itérer.
