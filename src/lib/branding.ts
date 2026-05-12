/**
 * Système de variables CSS dérivées d'un seul --brand (couleur saisie
 * par le bailleur côté staff > Paramètres > Apparence).
 *
 * Cf. docs/PORTAIL-BRANDING.md pour la règle métier :
 *   - --brand                 = pdfCouleur telle quelle (accents only)
 *   - --brand-pale            = HSL(H, 30%, 95%) — fond doux pour halos
 *   - --brand-text-on-brand   = noir/blanc selon luminance, pour texte
 *                               sur un bouton/badge en --brand
 *
 * Aucun grand aplat de fond n'utilise --brand directement. Les fonds
 * restent neutres (blanc / gris) ; seuls bordures, icônes, boutons,
 * labels et badges portent la couleur.
 */

export interface BrandingVars {
  brand: string;
  brandPale: string;
  textOnBrand: string;
}

/** Convertit `#RRGGBB` en `[H, S, L]` (H 0-360, S/L 0-1). */
export function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let H = 0;
  let S = 0;
  const L = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    S = L > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) H = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) H = (b - r) / d + 2;
    else H = (r - g) / d + 4;
    H *= 60;
  }
  return [H, S, L];
}

/**
 * Luminance relative selon WCAG 2.x.
 * Cf. https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lin = (c: number): number => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** `#1a1a1a` (texte foncé) si la couleur est claire, sinon `#ffffff`. */
export function textOnBrand(hex: string): string {
  return relativeLuminance(hex) > 0.5 ? '#1a1a1a' : '#ffffff';
}

/** Variante très claire de la couleur (hue conservée), pour halos/hovers. */
export function brandPale(hex: string): string {
  const [h] = hexToHsl(hex);
  return `hsl(${Math.round(h)}, 30%, 95%)`;
}

/** Bundle des 3 variables prêtes à injecter dans `style={{ ... }}`. */
export function brandingVars(hex: string | null | undefined): BrandingVars {
  const safe = isValidHex(hex) ? (hex as string) : '#1a3a5c';
  return {
    brand: safe,
    brandPale: brandPale(safe),
    textOnBrand: textOnBrand(safe),
  };
}

function isValidHex(hex: string | null | undefined): boolean {
  if (!hex) return false;
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}
