// v3.7.0 — composants Logo inline SVG.
//
// `<img src="/logo-horizontal.svg">` chargeait le SVG comme image
// externe, donc `fill="currentColor"` à l'intérieur ne propageait
// pas la couleur du parent React (le SVG est rendu dans un
// document isolé du browser). Résultat : logo invisible en dark
// mode (currentColor = couleur d'origine SVG, pas celle du DOM
// React).
//
// Fix : inline SVG dans React. `currentColor` résout maintenant
// dans le contexte React → suit `text-{color}` Tailwind.
//
// Usage :
//   <LogoHorizontal className="h-8 text-foreground" />
//   <LogoIcon className="h-6 text-primary" />
//   <LogoIcon className="h-6 text-muted-foreground" withText={false} />

interface LogoProps {
  className?: string;
  title?: string;
}

// Logo + texte "OpenQuittance" horizontal. Pour sidebar, headers,
// pages publiques avec largeur disponible.
export function LogoHorizontal({ className, title = 'OpenQuittance' }: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 280 64"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Carré arrondi de fond, opacité 8% */}
      <rect x="0" y="0" width="64" height="64" rx="12" fill="currentColor" opacity="0.08" />
      {/* Toit */}
      <path
        d="M 12 32 L 32 14 L 52 32"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Corps maison */}
      <path
        d="M 18 30 V 50 H 46 V 30"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Lignes quittance */}
      <line x1="24" y1="38" x2="40" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <line x1="24" y1="44" x2="36" y2="44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      {/* Texte */}
      <text
        x="80"
        y="42"
        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
        fontWeight="700"
        fontSize="24"
        fill="currentColor"
        letterSpacing="-0.5"
      >
        OpenQuittance
      </text>
    </svg>
  );
}

interface LogoIconProps extends LogoProps {
  // Affiche le texte "OpenQuittance" à droite de l'icône.
  // Par défaut false (icône seule, ratio 1:1).
  withText?: boolean;
}

// Icône maison seule (ratio 1:1). Pour favicons, badges, footers
// compacts. Avec `withText` : icône + texte au-dessous.
export function LogoIcon({ className, title = 'OpenQuittance', withText = false }: LogoIconProps) {
  if (withText) {
    return <LogoHorizontal className={className} title={title} />;
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect x="0" y="0" width="64" height="64" rx="12" fill="currentColor" opacity="0.08" />
      <path
        d="M 12 32 L 32 14 L 52 32"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 18 30 V 50 H 46 V 30"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="24" y1="38" x2="40" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <line x1="24" y1="44" x2="36" y2="44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}
