'use client';

import { useState } from 'react';
import { toast } from 'sonner';

/**
 * v3.2.0-rc3 — UI Paramètres > Intégrations. ADMIN only (gating
 * côté API).
 *
 * Configure les credentials externes app-level. v3.2.0 couvre
 * Google OAuth (login NextAuth + Gmail API). Future : Stripe,
 * Slack, webhooks, etc.
 *
 * Pattern secrets `'***'` masqués (cf. backup rc10/rc11) : si l'admin
 * ne touche pas le champ, payload envoie `'***'` → route handler
 * préserve valeur DB.
 */

export interface IntegrationsConfig {
  googleClientId: string | null;          // `***` si configuré, null sinon
  googleClientSecret: string | null;
  source: 'db' | 'env' | 'none';
}

export default function IntegrationsForm({ initial }: { initial: IntegrationsConfig }) {
  const [form, setForm] = useState<IntegrationsConfig>(initial);
  const [clientIdDirty, setClientIdDirty] = useState(false);
  const [clientSecretDirty, setClientSecretDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const sourceBadge = () => {
    if (form.source === 'db') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
          ✓ Configuré via UI
        </span>
      );
    }
    if (form.source === 'env') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
          ⚠ Configuré via .env (legacy)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
        Non configuré
      </span>
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        googleClientId: clientIdDirty ? form.googleClientId : '***',
        googleClientSecret: clientSecretDirty ? form.googleClientSecret : '***',
      };
      const r = await fetch('/api/parametres/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json();
        toast.error(j.error || 'Échec sauvegarde');
        return;
      }
      const saved: IntegrationsConfig = await r.json();
      setForm(saved);
      setClientIdDirty(false);
      setClientSecretDirty(false);

      // Re-fetch GET pour s'assurer que UI reflète DB réelle
      try {
        const refresh = await fetch('/api/parametres/integrations');
        if (refresh.ok) {
          const fresh: IntegrationsConfig = await refresh.json();
          setForm(fresh);
        }
      } catch {
        // Non bloquant
      }

      toast.success('Configuration enregistrée — Gmail API appliqué immédiatement, login Google nécessite restart container');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Section Google OAuth */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold">Google OAuth (login utilisateurs + Gmail API)</h2>
          {sourceBadge()}
        </div>
        <p className="text-xs text-muted-foreground">
          Utilisé pour : (1) Connexion Google des utilisateurs ;
          (2) Envoi d'emails via Gmail API per-user.{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Google Cloud Console
          </a>
          {' · '}
          <a
            href="https://github.com/grx14/quittances-app/blob/main/docs/INSTALL.md#google-oauth"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Procédure
          </a>
          . Redirect URI :{' '}
          <code className="text-[10px]">
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/auth/callback/google
          </code>
        </p>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="label">Client ID</label>
            <input
              className="input font-mono"
              type="text"
              value={form.googleClientId ?? ''}
              onFocus={e => {
                if (e.target.value === '***') {
                  setForm(f => ({ ...f, googleClientId: '' }));
                  setClientIdDirty(true);
                }
              }}
              onChange={e => {
                setForm(f => ({ ...f, googleClientId: e.target.value }));
                setClientIdDirty(true);
              }}
              placeholder={
                form.googleClientId === '***'
                  ? '*** (déjà configuré)'
                  : 'Ex: 123456-abc.apps.googleusercontent.com'
              }
            />
          </div>
          <div>
            <label className="label">Client Secret</label>
            <input
              className="input font-mono"
              type="password"
              value={form.googleClientSecret ?? ''}
              onFocus={e => {
                if (e.target.value === '***') {
                  setForm(f => ({ ...f, googleClientSecret: '' }));
                  setClientSecretDirty(true);
                }
              }}
              onChange={e => {
                setForm(f => ({ ...f, googleClientSecret: e.target.value }));
                setClientSecretDirty(true);
              }}
              placeholder={
                form.googleClientSecret === '***'
                  ? '*** (déjà configuré)'
                  : 'GOCSPX-xxxxx'
              }
            />
          </div>
        </div>

        {/* Warnings effet immédiat vs restart */}
        <div className="space-y-2 mt-2">
          <div className="flex items-start gap-2 text-xs text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border-l-4 border-blue-500 p-2 rounded">
            <span>ℹ️</span>
            <span>
              <strong>Gmail API</strong> : changements appliqués
              <strong> immédiatement</strong> après enregistrement
              (cache invalidé).
            </span>
          </div>
          <div className="flex items-start gap-2 text-xs text-orange-800 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/30 border-l-4 border-orange-500 p-2 rounded">
            <span>⚠️</span>
            <span>
              <strong>Login Google</strong> : NextAuth lit les
              credentials au démarrage.{' '}
              <strong>Redémarrage du container nécessaire</strong>{' '}
              pour appliquer les modifications au login.
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
