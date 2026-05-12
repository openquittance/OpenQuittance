'use client';

import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import CommandPalette from '../CommandPalette';
import StaffFooter from './StaffFooter';
import { BailleurProvider } from '@/lib/bailleur-context';

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <BailleurProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        {/* pt-16 sur mobile pour ne pas chevaucher le bouton burger fixé en
            haut-gauche (cf. Sidebar). md+ a sa sidebar permanente, padding
            normal.
            v3.6.2 : min-w-0 permet à main de shrink en dessous de la
            largeur intrinsèque des enfants (sinon une table large
            forçait main > viewport → scroll horizontal + contenu
            décalé droite sur iPhone). */}
        <main className="flex-1 min-w-0 pt-16 px-4 pb-4 md:p-8 max-w-[1400px] w-full flex flex-col">
          <div className="flex-1 min-w-0">{children}</div>
          {/* v2.8.0 footer staff : liens vers pages légales du bailleur actif */}
          <StaffFooter />
        </main>
      </div>
      {/* Palette globale Cmd+K + raccourcis g+X et n */}
      <CommandPalette />
    </BailleurProvider>
  );
}
