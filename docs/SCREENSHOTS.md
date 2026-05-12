# Captures d'écran — OpenQuittance

Galerie des écrans principaux. Captures régénérables via
`npx tsx scripts/screenshots.mts` (Playwright + données démo
créées à la volée).

## Écrans actuels

| # | Fichier                                                   | Légende                                       |
|---|-----------------------------------------------------------|-----------------------------------------------|
| 1 | [01-dashboard.png](screenshots/01-dashboard.png)          | Dashboard staff (stats + dernières quittances)|
| 2 | [02-quittance-pdf.png](screenshots/02-quittance-pdf.png)  | Aperçu d'une quittance PDF générée            |
| 3 | [03-wizard-onboarding.png](screenshots/03-wizard-onboarding.png) | Wizard install initial (3 étapes)      |
| 4 | [04-irl-revisions.png](screenshots/04-irl-revisions.png)  | Page révisions IRL annuelles                  |
| 5 | [05-audit-log.png](screenshots/05-audit-log.png)          | Journal d'activité admin                      |
| 6 | [06-2fa-setup.png](screenshots/06-2fa-setup.png)          | Configuration 2FA TOTP                        |
| 7 | [07-documents.png](screenshots/07-documents.png)          | Gestion documents propriétaire (Bien)         |
| 8 | [08-mobile-dashboard.png](screenshots/08-mobile-dashboard.png) | Dashboard mobile (PWA, iPhone simulator)|

## À capturer (post v3.7)

Liste des écrans nouveaux / refactorés depuis v3.5+ qui méritent
une capture pour la doc publique :

### Pages staff

- **/bailleurs** mobile cards (v3.6.2)
- **/biens** mobile cards (v3.6.2)
- **/locataires** mobile cards (v3.6.2)
- **/quittances** mobile cards (v3.6.2)
- **/parametres/membres** mobile cards (v3.6.2)
- **/parametres/membres** desktop : invitation flow + tableau
  memberships + invitations pending
- **Modale BailleurForm** : onglet Infos + onglet Légal
- **Modale LocataireForm** : avec champs portail + DDT
- **Wizard biens** : étape 1 (infos) + étape 2 (type)
- **Page apparence** : preview PDF live à droite (desktop)
- **Page backup** : config S3 + Drive + historique runs
- **Page intégrations** : Google OAuth connecté
- **Page audit** : filtres + détail event

### Portail locataire

- **/portail** dashboard locataire
- **/portail/quittances** liste + bouton télécharger
- **/portail/documents** documents partagés
- **/portail/profil** édition profil + 2FA

### Pages publiques

- **/mentions-legales/[slug]** rendu d'une page bailleur
- **/politique-confidentialite/[slug]** idem
- **/install** wizard (déjà capturé en 03)

### Dark mode

- Dashboard dark mode
- Sidebar dark mode (avec **logo visible** post v3.7.0 fix)
- Modale dark mode (BailleurForm dark)

### PDFs générés

- Quittance complète (header bailleur + corps + footer signature)
- Quittance avec avoir appliqué (cas particulier)
- Avis d'échéance
- Courrier IRL recommandé
- Attestation dépôt de garantie

## Comment régénérer

Préreq : Playwright installé (`npm install` inclus en devDeps).
Base de données seed (`npm run db:seed` créera bailleurs / biens
/ locataires / quittances fictifs).

```bash
npx tsx scripts/screenshots.mts
```

Le script :
1. Lance Playwright (Chromium headless).
2. Crée un user admin + bailleur + biens / locataires / quittances.
3. Login → screenshots de chaque page clé.
4. Sauve dans `docs/screenshots/`.
5. Cleanup données.

**Attention** : utilise une base dédiée test (pas ta prod !).
Modifie l'env `DATABASE_URL` avant de lancer si besoin.

## Conventions

- Format **PNG** (pas JPG pour préserver netteté UI).
- Résolution **1280×800** desktop / **390×844** mobile (iPhone 14).
- Pas de PII réelle (uniquement données seed).
- Pas de capture en mode dev avec hot reload visible.

## Licence

Captures `docs/screenshots/*` sous licence MIT comme le reste du
projet. Réutilisables (blog, article, talk).
