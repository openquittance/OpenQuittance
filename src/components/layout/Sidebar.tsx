'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Users, Building2, FileText, FileSignature, Settings, LogOut, Briefcase, Menu, X, FileDown, Shield, TrendingUp, Cloud, Plug } from 'lucide-react';
import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { useBailleurs } from '@/lib/bailleur-context';
import ThemeToggle from './ThemeToggle';
import { LogoHorizontal } from '@/components/Logo';

const items = [
  { href: '/', label: 'Tableau de bord', icon: Home },
  { href: '/bailleurs', label: 'Bailleurs', icon: Briefcase },
  { href: '/biens', label: 'Biens', icon: Building2 },
  { href: '/locataires', label: 'Locataires', icon: Users },
  { href: '/quittances', label: 'Quittances', icon: FileText },
  { href: '/documents', label: 'Documents', icon: FileSignature },
  { href: '/exports', label: 'Exports', icon: FileDown },
  { href: '/parametres/irl', label: 'Indexation IRL', icon: TrendingUp },
  { href: '/parametres/backup', label: 'Backup', icon: Cloud },
  { href: '/parametres/integrations', label: 'Intégrations', icon: Plug },
  { href: '/parametres', label: 'Paramètres', icon: Settings },
  { href: '/profil/securite', label: 'Sécurité', icon: Shield },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { bailleurs, active, setActiveId } = useBailleurs();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <>
      <button
        className="md:hidden fixed top-3 left-3 z-40 btn-ghost p-2"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={open}
      >
        <Menu size={20} />
      </button>
      {open && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setOpen(false)} />
      )}
      <aside
        className={cn(
          'fixed md:sticky top-0 left-0 z-40 w-64 h-screen border-r border-border bg-card flex flex-col transition-transform',
          'md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          {/* v3.7.0 — inline SVG via composant Logo : suit text-foreground
              donc visible en light + dark mode. */}
          <LogoHorizontal className="h-8 w-auto text-foreground" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button
              className="md:hidden btn-ghost p-1"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {bailleurs.length > 0 && (
          <div className="px-3 py-3 border-b border-border">
            <label className="label">Bailleur actif</label>
            <div className="flex items-center gap-2">
              {/* Chip 8px en pdfCouleur du bailleur sélectionné — évite les
                  erreurs de contexte quand on jongle entre plusieurs bailleurs.
                  Cf. docs/PORTAIL-BRANDING.md (règle accents only). */}
              {active && (
                <span
                  aria-hidden="true"
                  title={`Couleur de marque : ${active.pdfCouleur}`}
                  className="inline-block rounded-full shrink-0"
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: active.pdfCouleur,
                  }}
                />
              )}
              <select
                className="input flex-1"
                value={active?.id ?? ''}
                onChange={(e) => setActiveId(e.target.value)}
              >
                {bailleurs.map(b => (
                  <option key={b.id} value={b.id}>{b.nom}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {items.map(({ href, label, icon: Icon }) => {
            const a = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition',
                  a ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
                )}
              >
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-border space-y-2">
          <button
            className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut size={16} />
            Se déconnecter
          </button>
          <div className="px-3 text-[10px] text-muted-foreground/70 text-center leading-relaxed">
            Open-source — un café ?{' '}
            <a
              href="https://fr.tipeee.com/grx14/"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Tipeee ☕
            </a>
          </div>
        </div>
      </aside>
    </>
  );
}
