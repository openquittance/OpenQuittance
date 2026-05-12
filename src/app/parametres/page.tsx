'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/layout/AppShell';
import { Mail, Palette, ChevronRight, Shield, Users, ScrollText, TrendingUp } from 'lucide-react';

function ParametresContent() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Paramètres</h1>
      <div className="space-y-3">
        <Link href="/parametres/email" className="card flex items-center justify-between hover:bg-accent/30 transition">
          <div className="flex items-center gap-3">
            <Mail className="text-primary" size={20} />
            <div>
              <p className="font-medium">Email</p>
              <p className="text-sm text-muted-foreground">Configurer Gmail API ou SMTP, templates d'envoi</p>
            </div>
          </div>
          <ChevronRight className="text-muted-foreground" size={18} />
        </Link>
        <Link href="/parametres/apparence" className="card flex items-center justify-between hover:bg-accent/30 transition">
          <div className="flex items-center gap-3">
            <Palette className="text-primary" size={20} />
            <div>
              <p className="font-medium">Apparence du PDF</p>
              <p className="text-sm text-muted-foreground">Couleur, logo et signature par bailleur</p>
            </div>
          </div>
          <ChevronRight className="text-muted-foreground" size={18} />
        </Link>

        {isAdmin && (
          <>
            <Link href="/parametres/membres" className="card flex items-center justify-between hover:bg-accent/30 transition border-primary/30">
              <div className="flex items-center gap-3">
                <Users className="text-primary" size={20} />
                <div>
                  <p className="font-medium">Membres et invitations</p>
                  <p className="text-sm text-muted-foreground">Inviter des collaborateurs, gérer les rôles</p>
                </div>
              </div>
              <ChevronRight className="text-muted-foreground" size={18} />
            </Link>
            <Link href="/parametres/admin" className="card flex items-center justify-between hover:bg-accent/30 transition border-primary/30">
              <div className="flex items-center gap-3">
                <Shield className="text-primary" size={20} />
                <div>
                  <p className="font-medium">Administration</p>
                  <p className="text-sm text-muted-foreground">Configuration globale (nom de l'app, mode d'inscription)</p>
                </div>
              </div>
              <ChevronRight className="text-muted-foreground" size={18} />
            </Link>
            <Link href="/parametres/journal" className="card flex items-center justify-between hover:bg-accent/30 transition border-primary/30">
              <div className="flex items-center gap-3">
                <ScrollText className="text-primary" size={20} />
                <div>
                  <p className="font-medium">Journal d'activité</p>
                  <p className="text-sm text-muted-foreground">Audit trail : connexions, mutations, exports — export CSV</p>
                </div>
              </div>
              <ChevronRight className="text-muted-foreground" size={18} />
            </Link>
          </>
        )}
        <Link href="/parametres/irl" className="card flex items-center justify-between hover:bg-accent/30 transition">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-primary" size={20} />
            <div>
              <p className="font-medium">Indexation IRL</p>
              <p className="text-sm text-muted-foreground">Saisie des indices INSEE et révisions de loyer</p>
            </div>
          </div>
          <ChevronRight className="text-muted-foreground" size={18} />
        </Link>
      </div>
    </div>
  );
}

export default function ParametresPage() {
  return <AppShell><ParametresContent /></AppShell>;
}
