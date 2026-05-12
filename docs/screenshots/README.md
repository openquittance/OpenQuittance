# Screenshots à ajouter

Captures attendues pour le README principal et la page À propos.
Format : PNG, 16:10, ~1600×1000, fond sombre.

## Captures à fournir

| Nom de fichier | Description | Page |
|---|---|---|
| `01-dashboard.png` | Tableau de bord avec KPIs + alertes | `/` (avec données) |
| `02-quittance-pdf.png` | PDF d'une quittance générée (modale ou exportée) | `/quittances` → bouton PDF |
| `03-wizard-onboarding.png` | Wizard étape 2 ou 3 avec progression | `/onboarding` |
| `04-irl-revisions.png` | Page IRL avec section "Révisions disponibles" + historique | `/parametres/irl` |
| `05-audit-log.png` | Journal d'activité avec entrées variées + filtres | `/parametres/journal` |
| `06-2fa-setup.png` | Setup 2FA avec QR code visible | `/profil/securite` après "Activer le 2FA" |
| `07-documents.png` | Page Documents avec un locataire et les 5 boutons + accordéon Archives ouvert | `/documents` |
| `08-mobile-dashboard.png` | Dashboard sur mobile (375px) avec sidebar burger | `/` (mode responsive) |

## Comment les insérer dans le README

```markdown
![Dashboard](docs/screenshots/01-dashboard.png)
```

Ou regroupés en table :

```markdown
| Dashboard | Quittance PDF |
|---|---|
| ![](docs/screenshots/01-dashboard.png) | ![](docs/screenshots/02-quittance-pdf.png) |
```
