'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Shield } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import IntegrationsForm, { type IntegrationsConfig } from './IntegrationsForm';

function IntegrationsContent() {
  const { data: session } = useSession();
  const [config, setConfig] = useState<IntegrationsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = session?.user?.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    fetch('/api/parametres/integrations')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setConfig)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (loading) return <p className="text-muted-foreground">Chargement…</p>;

  if (!isAdmin) {
    return (
      <div className="card border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 max-w-2xl">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 mt-0.5 text-yellow-700 dark:text-yellow-400" />
          <div>
            <p className="font-semibold">Accès ADMIN requis</p>
            <p className="text-sm text-muted-foreground mt-1">
              Configuration des intégrations externes réservée aux administrateurs
              (clés OAuth + API tierces).
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="text-red-700 dark:text-red-400">Erreur : {error}</p>;
  }

  if (!config) return null;

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Intégrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Credentials OAuth et API tierces utilisés par OpenQuittance
          (Google login, Gmail API, etc.). Configurés ici plutôt que dans
          le fichier <code>.env</code> côté serveur.
        </p>
      </div>

      <IntegrationsForm initial={config} />
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <AppShell>
      <IntegrationsContent />
    </AppShell>
  );
}
