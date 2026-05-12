# Système de branding bailleur (portail locataire + PDF)

> Règle métier décidée pendant le fix C.12 (rc2 → rc3), pour qu'un
> bailleur qui modifie sa couleur dans **Paramètres > Apparence**
> obtienne un rendu :
>
> 1. **Visible** sans dépendre de l'opacité (rc2 utilisait
>    `${pdfCouleur}10` = 6.27% alpha → quasi-invisible).
> 2. **Lisible** avec n'importe quelle couleur (claire, foncée,
>    saturée, fluo) — sans risque de "blanc sur blanc" ou
>    "blanc sur jaune".
> 3. **Cohérent** entre la page web (HTML SSR) et le PDF généré.

## Règle 1 — Pas d'aplat plein de la couleur bailleur

`Bailleur.pdfCouleur` ne sert **JAMAIS** comme grand fond plein.
Les backgrounds restent neutres (blanc, gris-50). La couleur
n'est utilisée que pour des **accents**.

## Règle 2 — Liste des éléments accents

La couleur s'applique uniquement aux éléments suivants :

- Bordure haute du header (4px solid)
- Icône `<FileText>` du header (si pas de logo uploadé)
- Boutons primaires (bg solide, texte calculé auto via
  `--brand-text-on-brand`)
- Focus rings (outline)
- Labels uppercase ("VOS BAUX", "VOS QUITTANCES", etc.)
- Badge compteur ("X quittances disponibles")
- Liens texte ("Voir toutes les quittances →")
- PDF : pill QUITTANCE en outline (pas fill), filet d'accent
  des boxes, bordure de la barre total (bg neutre, texte brand)

## Règle 3 — Variables CSS dérivées

Une seule source de vérité (`Bailleur.pdfCouleur`), 3 variables
calculées par `lib/branding.ts` :

```ts
const vars = brandingVars(bailleur.pdfCouleur);
// { brand, brandPale, textOnBrand }
```

| Variable                | Calcul                              | Usage                                |
|-------------------------|-------------------------------------|--------------------------------------|
| `--brand`               | `pdfCouleur` telle quelle           | Bordure, texte, icône, fill bouton   |
| `--brand-pale`          | `hsl(hue, 30%, 95%)`                | Fond doux subtil (hover, halo)       |
| `--brand-text-on-brand` | `#1a1a1a` si lum > 0.5 sinon `#fff` | Texte sur bouton/badge en `--brand`  |

Calcul de luminance : WCAG 2.x relative luminance
(cf. `relativeLuminance()` dans `lib/branding.ts`).

## Règle 4 — PDF cohérent avec la règle web

Le générateur PDF (`lib/pdf-generator.ts`) suit la même règle :

- Pill QUITTANCE → outline 1px brand, texte brand (au lieu de
  fill brand + texte blanc)
- Filet d'accent box bien → 3px brand (déjà conforme)
- Barre total → bg neutre `#faf7f4`, bordure 2px brand,
  texte brand pour montant + label

Le calcul `textOnBrand()` est aussi exposé pour les composants
PDF qui auraient un fill brand (ex: futur bouton accent en PDF).

## Règle 5 — Tests de régression

- **Test 25** : injection des CSS vars dans le HTML SSR
  + assertion luminance correcte.
- **Test 26** : 4 couleurs extrêmes (`#000000`, `#ffffff`,
  `#ffff00`, `#800080`) ne cassent pas le rendu (texte sur fond
  reste lisible).

## Implémentation

```tsx
// Server Component (page portail)
import { brandingVars } from '@/lib/branding';

const vars = brandingVars(bailleur.pdfCouleur);

return (
  <div
    className="min-h-screen flex flex-col"
    style={{
      ['--brand' as string]: vars.brand,
      ['--brand-pale' as string]: vars.brandPale,
      ['--brand-text-on-brand' as string]: vars.textOnBrand,
    }}
  >
    <header style={{ borderBottom: '4px solid var(--brand)' }}>
      ...
    </header>
    {/* Boutons primaires :
        style={{ backgroundColor: 'var(--brand)', color: 'var(--brand-text-on-brand)' }} */}
  </div>
);
```
