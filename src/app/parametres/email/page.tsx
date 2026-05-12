'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCircle2, Send, AlertCircle } from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import AppShell from '@/components/layout/AppShell';

/**
 * Whitelist DOMPurify pour la signature email (v2.9.1 hotfix).
 * Tags HTML basiques + attrs href/src/alt/style. Retire scripts,
 * onclick, onload, iframe, data:, javascript: URIs.
 */
const SIGNATURE_PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'img', 'span', 'div', 'table', 'tr', 'td', 'th', 'tbody', 'thead', 'ul', 'ol', 'li', 'hr', 'h1', 'h2', 'h3', 'h4'],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'style', 'width', 'height', 'class'],
  // Bloque javascript: + data: URIs (sauf data:image)
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpeg|gif|webp);base64,|#|\/)/i,
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'style'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit'],
};

interface Parametres {
  emailMethod: 'gmail_api' | 'smtp';
  smtpHost: string | null; smtpPort: number | null;
  smtpUser: string | null;
  emailObjetTemplate: string; emailCorpsTemplate: string;
  emailSignatureHtml: string | null;
  gmailEmail: string | null;
  gmailConnected: boolean;
  gmailScope: string | null;
  smtpPassConfigured: boolean;
}

function EmailSettings() {
  const params = useSearchParams();
  const [p, setP] = useState<Parametres | null>(null);
  const [smtpPass, setSmtpPass] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch('/api/parametres').then(r => r.json()).then(setP);
    if (params.get('connected')) toast.success('Compte Gmail connecté');
    const err = params.get('error');
    if (err === 'missing_gmail_send_scope') {
      toast.error('Gmail n\'a pas accordé le scope gmail.send. Vérifiez l\'OAuth consent screen dans Google Cloud.', { duration: 8000 });
    } else if (err === 'no_refresh_token') {
      toast.error('Pas de refresh_token reçu. Reconnectez avec "Forcer le consent".', { duration: 8000 });
    } else if (err) {
      toast.error(`Erreur Gmail: ${err}`);
    }
  }, [params]);

  if (!p) return <p className="text-muted-foreground">Chargement…</p>;

  const set = <K extends keyof Parametres>(k: K, v: Parametres[K]) => setP({ ...p, [k]: v });

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        emailMethod: p.emailMethod,
        smtpHost: p.smtpHost,
        smtpPort: p.smtpPort,
        smtpUser: p.smtpUser,
        emailObjetTemplate: p.emailObjetTemplate,
        emailCorpsTemplate: p.emailCorpsTemplate,
        emailSignatureHtml: p.emailSignatureHtml,
      };
      if (smtpPass) body.smtpPass = smtpPass;
      const r = await fetch('/api/parametres', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
      const updated = await r.json();
      setP(updated);
      setSmtpPass('');
      toast.success('Enregistré');
    } finally { setSaving(false); }
  };

  const sendTest = async () => {
    if (!testEmail) { toast.error('Saisir un destinataire'); return; }
    setTesting(true);
    try {
      const r = await fetch('/api/parametres/test-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail }),
      });
      if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
      toast.success('Email envoyé');
    } finally { setTesting(false); }
  };

  const disconnectGmail = async () => {
    if (!confirm('Déconnecter le compte Gmail ?')) return;
    const r = await fetch('/api/gmail/disconnect', { method: 'POST' });
    if (r.ok) {
      toast.success('Déconnecté');
      const refreshed = await fetch('/api/parametres').then(r => r.json());
      setP(refreshed);
    }
  };

  const testGmailConnection = async () => {
    setTesting(true);
    try {
      const r = await fetch('/api/gmail/test', { method: 'POST' });
      const j = await r.json();
      if (j.ok) {
        toast.success(`Connexion OK — ${j.email}`, {
          description: j.hasGmailSend ? 'Le scope gmail.send est bien accordé.' : 'Mais le scope gmail.send manque !',
          duration: 6000,
        });
      } else {
        toast.error(j.error || 'Échec', {
          description: j.hint || `Scopes accordés: ${j.scope || 'inconnu'}`,
          duration: 12000,
        });
      }
    } finally { setTesting(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-semibold">Configuration email</h1>

      <section className="card space-y-3">
        <h2 className="font-semibold">Méthode d'envoi</h2>
        <div className="flex gap-3">
          {(['gmail_api', 'smtp'] as const).map(m => (
            <button
              key={m}
              className={`flex-1 px-4 py-3 rounded-md border transition ${p.emailMethod === m ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}
              onClick={() => set('emailMethod', m)}
            >
              <p className="font-medium text-sm">{m === 'gmail_api' ? 'Gmail API' : 'SMTP'}</p>
              <p className="text-xs text-muted-foreground mt-1">{m === 'gmail_api' ? 'Recommandé' : 'Avancé'}</p>
            </button>
          ))}
        </div>
      </section>

      {p.emailMethod === 'gmail_api' && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Gmail API</h2>
          {p.gmailConnected ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 flex-wrap">
                <CheckCircle2 className="text-emerald-600" size={20} />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-medium">Connecté en tant que {p.gmailEmail}</p>
                  <p className="text-xs text-muted-foreground">
                    Scope : {p.gmailScope?.includes('gmail.send')
                      ? <span className="text-emerald-700">gmail.send accordé ✓</span>
                      : <span className="text-amber-700">gmail.send MANQUANT</span>}
                  </p>
                </div>
                <button className="btn-secondary" onClick={testGmailConnection} disabled={testing}>
                  {testing ? 'Test…' : 'Tester'}
                </button>
                <button className="btn-secondary" onClick={disconnectGmail}>Déconnecter</button>
              </div>
              {!p.gmailScope?.includes('gmail.send') && (
                <div className="text-xs text-amber-800 dark:text-amber-300 p-3 rounded bg-amber-50 dark:bg-amber-900/20">
                  <p className="font-medium mb-1">⚠ Le scope <code>gmail.send</code> n'a pas été accordé.</p>
                  <p>Dans Google Cloud Console :</p>
                  <ol className="list-decimal ml-5 mt-1 space-y-0.5">
                    <li>Activez <a className="underline" href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer">Gmail API</a></li>
                    <li>Dans <a className="underline" href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer">OAuth consent screen → Scopes</a>, ajoutez <code>https://www.googleapis.com/auth/gmail.send</code></li>
                    <li>Si l'app est en mode Testing, ajoutez votre email dans Test users</li>
                    <li>Cliquez Déconnecter ci-dessus puis reconnectez Gmail</li>
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted">
              <AlertCircle className="text-amber-600" size={20} />
              <p className="text-sm flex-1">Aucun compte Gmail connecté.</p>
              <a className="btn-primary" href="/api/gmail/auth">Connecter Gmail</a>
            </div>
          )}
        </section>
      )}

      {p.emailMethod === 'smtp' && (
        <section className="card space-y-3">
          <h2 className="font-semibold">SMTP</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Host</label>
              <input className="input" value={p.smtpHost ?? ''} onChange={e => set('smtpHost', e.target.value)} />
            </div>
            <div>
              <label className="label">Port</label>
              <input type="number" className="input" value={p.smtpPort ?? 587} onChange={e => set('smtpPort', Number(e.target.value))} />
            </div>
            <div>
              <label className="label">Email (user)</label>
              <input className="input" value={p.smtpUser ?? ''} onChange={e => set('smtpUser', e.target.value)} />
            </div>
            <div>
              <label className="label">Mot de passe d'application {p.smtpPassConfigured && '(configuré — laisser vide pour conserver)'}</label>
              <input type="password" className="input" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder={p.smtpPassConfigured ? '••••••••' : ''} />
            </div>
          </div>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">Templates email</h2>
        <p className="text-xs text-muted-foreground">Variables : {'{nom}'} {'{prenom}'} {'{mois}'} {'{annee}'} {'{montant}'} {'{bailleur}'}</p>
        <div>
          <label className="label">Objet</label>
          <input className="input" value={p.emailObjetTemplate} onChange={e => set('emailObjetTemplate', e.target.value)} />
        </div>
        <div>
          <label className="label">Corps</label>
          <textarea className="input min-h-[140px]" value={p.emailCorpsTemplate} onChange={e => set('emailCorpsTemplate', e.target.value)} />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Signature email (HTML)</h2>
        <p className="text-xs text-muted-foreground">
          Coller le code HTML de votre signature (logo, coordonnées, mention légale).
          Pour inclure une image, utilisez une URL publique ou du data URI base64.
          Laissez vide pour envoyer en texte simple uniquement.
        </p>
        <textarea
          className="input min-h-[200px] font-mono text-xs"
          value={p.emailSignatureHtml ?? ''}
          onChange={e => set('emailSignatureHtml', e.target.value)}
          placeholder="<table>...</table>"
        />
        {p.emailSignatureHtml && (
          <div>
            <p className="label">Aperçu</p>
            <SignaturePreview html={p.emailSignatureHtml} />
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Test d'envoi</h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="label">Destinataire</label>
            <input className="input" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="adresse@example.com" />
          </div>
          <button className="btn-secondary" onClick={sendTest} disabled={testing}>
            <Send size={14} /> {testing ? 'Envoi…' : 'Tester'}
          </button>
        </div>
      </section>

      <div className="flex justify-end">
        <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </div>
  );
}

/**
 * Preview signature email — sanitize HTML via DOMPurify avant injection
 * (v2.9.1 hotfix). Risque XSS self-targeting admin-only mitigé.
 */
function SignaturePreview({ html }: { html: string }) {
  const safe = useMemo(() => DOMPurify.sanitize(html, SIGNATURE_PURIFY_CONFIG), [html]);
  return (
    <div
      className="border border-border rounded p-3 bg-card"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

export default function EmailSettingsPage() {
  return <AppShell><Suspense><EmailSettings /></Suspense></AppShell>;
}
