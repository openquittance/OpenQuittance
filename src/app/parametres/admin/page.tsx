'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Shield, Settings, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import AppShell from '@/components/layout/AppShell';

type RegistrationMode = 'CLOSED' | 'INVITATION_ONLY';

interface AppConfig {
  appName: string;
  registrationMode: RegistrationMode;
}

const REG_LABEL: Record<RegistrationMode, { title: string; desc: string }> = {
  CLOSED: { title: 'Fermée', desc: 'Aucune nouvelle inscription possible (instance privée).' },
  INVITATION_ONLY: { title: 'Sur invitation', desc: 'Vous pouvez inviter des collaborateurs.' },
};

function AdminContent() {
  const { data: session } = useSession();
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isAdmin = session?.user?.role === 'ADMIN';

  useEffect(() => {
    fetch('/api/admin/config')
      .then(r => r.ok ? r.json() : null)
      .then(setConfig)
      .finally(() => setLoading(false));
  }, []);

  if (!isAdmin) {
    return (
      <div className="card text-center space-y-3 py-12 max-w-md mx-auto">
        <AlertTriangle className="mx-auto text-amber-600" size={32} />
        <h1 className="text-xl font-semibold">Accès refusé</h1>
        <p className="text-sm text-muted-foreground">Cette page est réservée aux administrateurs.</p>
      </div>
    );
  }

  if (loading || !config) return <p className="text-muted-foreground">Chargement…</p>;

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/config', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
      toast.success('Configuration mise à jour');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Shield className="text-primary" size={24} />
        <div>
          <h1 className="text-2xl font-semibold">Administration</h1>
          <p className="text-sm text-muted-foreground">Configuration globale de l'instance</p>
        </div>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold flex items-center gap-2"><Settings size={16} /> Configuration générale</h2>
        <div>
          <label className="label">Nom de l'application</label>
          <input
            className="input"
            value={config.appName}
            onChange={e => setConfig({ ...config, appName: e.target.value })}
          />
        </div>
        <div>
          <label className="label">Mode d'inscription</label>
          <div className="space-y-2">
            {(['CLOSED', 'INVITATION_ONLY'] as RegistrationMode[]).map(m => (
              <label key={m} className={`block p-3 rounded-md border cursor-pointer transition ${config.registrationMode === m ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input
                  type="radio"
                  name="mode"
                  className="mr-2"
                  checked={config.registrationMode === m}
                  onChange={() => setConfig({ ...config, registrationMode: m })}
                />
                <span className="font-medium">{REG_LABEL[m].title}</span>
                <p className="text-xs text-muted-foreground ml-5 mt-1">{REG_LABEL[m].desc}</p>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function AdminPage() {
  return <AppShell><AdminContent /></AppShell>;
}
