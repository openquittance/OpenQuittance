'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  Home, Briefcase, Building2, Users, FileText, FileSignature, FileDown,
  Settings, Shield, ScrollText, TrendingUp, Plus, LogOut, Search, Sparkles,
} from 'lucide-react';
import { signOut } from 'next-auth/react';

// Palette de commandes globale (Cmd+K / Ctrl+K). Utilise cmdk pour le
// composant de base et son fuzzy-matching natif.
//
// Raccourcis additionnels gérés à part (en dehors de la palette ouverte) :
//   g + b → /bailleurs
//   g + l → /locataires
//   g + i → /biens
//   g + q → /quittances
//   g + d → /documents
//   g + r → /parametres/irl
//   n     → bouton "Nouveau" de la page courante (event window 'palette:new')

interface PaletteItem {
  group: string;
  label: string;
  hint?: string;
  icon: typeof Home;
  shortcut?: string;
  perform: () => void;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Listener global : Cmd/Ctrl+K ouvre/ferme, et la séquence "g X" navigue.
  useEffect(() => {
    let gPressed = false;
    let gTimeout: ReturnType<typeof setTimeout> | null = null;

    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      // Si déjà dans un input, on n'intercepte pas les raccourcis
      if (isTypingTarget(e.target)) return;
      // Palette ouverte → cmdk gère tout
      if (open) return;

      // Séquence "g X"
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        gPressed = true;
        if (gTimeout) clearTimeout(gTimeout);
        gTimeout = setTimeout(() => { gPressed = false; }, 800);
        return;
      }
      if (gPressed) {
        gPressed = false;
        if (gTimeout) clearTimeout(gTimeout);
        switch (e.key.toLowerCase()) {
          case 'b': router.push('/bailleurs'); break;
          case 'l': router.push('/locataires'); break;
          case 'i': router.push('/biens'); break;
          case 'q': router.push('/quittances'); break;
          case 'd': router.push('/documents'); break;
          case 'r': router.push('/parametres/irl'); break;
          case 'h': router.push('/'); break;
          case 's': router.push('/profil/securite'); break;
        }
        return;
      }

      // "n" tout court → demande aux pages d'ouvrir leur action "Nouveau"
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) {
        window.dispatchEvent(new CustomEvent('palette:new'));
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (gTimeout) clearTimeout(gTimeout);
    };
  }, [open, router]);

  const items: PaletteItem[] = [
    { group: 'Navigation', label: 'Tableau de bord', hint: 'g h', icon: Home, perform: () => router.push('/') },
    { group: 'Navigation', label: 'Bailleurs', hint: 'g b', icon: Briefcase, perform: () => router.push('/bailleurs') },
    { group: 'Navigation', label: 'Biens', hint: 'g i', icon: Building2, perform: () => router.push('/biens') },
    { group: 'Navigation', label: 'Locataires', hint: 'g l', icon: Users, perform: () => router.push('/locataires') },
    { group: 'Navigation', label: 'Quittances', hint: 'g q', icon: FileText, perform: () => router.push('/quittances') },
    { group: 'Navigation', label: 'Documents', hint: 'g d', icon: FileSignature, perform: () => router.push('/documents') },
    { group: 'Navigation', label: 'Exports', icon: FileDown, perform: () => router.push('/exports') },
    { group: 'Navigation', label: 'Indexation IRL', hint: 'g r', icon: TrendingUp, perform: () => router.push('/parametres/irl') },
    { group: 'Navigation', label: 'Paramètres', icon: Settings, perform: () => router.push('/parametres') },
    { group: 'Navigation', label: 'Journal d\'activité', icon: ScrollText, perform: () => router.push('/parametres/journal') },
    { group: 'Compte', label: 'Sécurité — 2FA', hint: 'g s', icon: Shield, perform: () => router.push('/profil/securite') },
    { group: 'Compte', label: 'Wizard d\'onboarding', icon: Sparkles, perform: () => router.push('/onboarding') },
    { group: 'Actions', label: 'Nouveau locataire', hint: 'n', icon: Plus, perform: () => { router.push('/locataires'); setTimeout(() => window.dispatchEvent(new CustomEvent('palette:new')), 100); } },
    { group: 'Actions', label: 'Nouveau bien', icon: Plus, perform: () => { router.push('/biens'); setTimeout(() => window.dispatchEvent(new CustomEvent('palette:new')), 100); } },
    { group: 'Actions', label: 'Nouveau bailleur', icon: Plus, perform: () => { router.push('/bailleurs'); setTimeout(() => window.dispatchEvent(new CustomEvent('palette:new')), 100); } },
    { group: 'Compte', label: 'Se déconnecter', icon: LogOut, perform: () => signOut({ callbackUrl: '/login' }) },
  ];

  // Regroupe par section
  const groups = items.reduce<Record<string, PaletteItem[]>>((acc, it) => {
    (acc[it.group] = acc[it.group] || []).push(it);
    return acc;
  }, {});

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Palette de commandes"
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-20 sm:pt-32 px-3"
    >
      <div
        className="w-full max-w-xl bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 border-b border-border">
          <Search size={16} className="text-muted-foreground" />
          <Command.Input
            placeholder="Tapez pour rechercher une page ou une action…"
            className="flex-1 py-3 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
            Aucun résultat.
          </Command.Empty>
          {Object.entries(groups).map(([groupName, groupItems]) => (
            <Command.Group
              key={groupName}
              heading={groupName}
              className="text-[11px] uppercase tracking-wider text-muted-foreground px-2 pt-2 pb-1"
            >
              {groupItems.map(it => {
                const Icon = it.icon;
                return (
                  <Command.Item
                    key={it.label}
                    onSelect={() => { setOpen(false); it.perform(); }}
                    className="flex items-center gap-2 px-2 py-2 rounded text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-foreground text-foreground/80"
                  >
                    <Icon size={14} className="text-muted-foreground" />
                    <span className="flex-1">{it.label}</span>
                    {it.hint && (
                      <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                        {it.hint}
                      </kbd>
                    )}
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))}
        </Command.List>
        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground flex items-center gap-3">
          <span><kbd className="bg-muted px-1 py-0.5 rounded">↑</kbd> <kbd className="bg-muted px-1 py-0.5 rounded">↓</kbd> naviguer</span>
          <span><kbd className="bg-muted px-1 py-0.5 rounded">↵</kbd> sélectionner</span>
          <span className="ml-auto"><kbd className="bg-muted px-1 py-0.5 rounded">⌘K</kbd> rouvrir</span>
        </div>
      </div>
    </Command.Dialog>
  );
}
