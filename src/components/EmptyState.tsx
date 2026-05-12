import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

// Composant réutilisable pour les listes vides. Centré, illustration + CTA
// principal + CTA secondaire optionnel. Préférez-le à un tableau vide ou un
// simple "Aucun élément" en gris : guide l'utilisateur vers la prochaine action.
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondary,
  compact,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: { label: string; onClick?: () => void; href?: string; icon?: LucideIcon };
  secondary?: { label: string; onClick?: () => void; href?: string };
  compact?: boolean;
}) {
  const PrimaryEl = action?.href ? 'a' : 'button';
  const SecondaryEl = secondary?.href ? 'a' : 'button';
  const ActionIcon = action?.icon;

  return (
    <div className={`text-center ${compact ? 'py-6' : 'py-12'} space-y-3`}>
      <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <Icon size={26} className="text-muted-foreground" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{description}</p>
      )}
      {(action || secondary) && (
        <div className="flex justify-center items-center gap-2 pt-2">
          {action && (
            <PrimaryEl
              className="btn-primary"
              onClick={action.onClick}
              {...(action.href ? { href: action.href } : { type: 'button' as const })}
            >
              {ActionIcon && <ActionIcon size={14} />}
              {action.label}
            </PrimaryEl>
          )}
          {secondary && (
            <SecondaryEl
              className="btn-ghost text-sm"
              onClick={secondary.onClick}
              {...(secondary.href ? { href: secondary.href } : { type: 'button' as const })}
            >
              {secondary.label}
            </SecondaryEl>
          )}
        </div>
      )}
    </div>
  );
}
