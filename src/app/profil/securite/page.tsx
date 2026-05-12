'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Shield, ShieldCheck, Copy, Download, AlertTriangle } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';

interface TotpStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export default function SecuritePage() {
  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [step, setStep] = useState<'idle' | 'setup' | 'verify' | 'show-codes' | 'disable'>('idle');
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [token, setToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/profil/totp')
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, backupCodesRemaining: 0 }));
  }, []);

  async function startSetup() {
    setLoading(true);
    try {
      const r = await fetch('/api/profil/totp/setup', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setSecret(j.secret);
      setQr(j.qr);
      setStep('setup');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndEnable() {
    setLoading(true);
    try {
      const r = await fetch('/api/profil/totp/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setBackupCodes(j.backupCodes);
      setStep('show-codes');
      toast.success('2FA activé. Sauvegardez vos codes de secours !');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setLoading(true);
    try {
      const r = await fetch('/api/profil/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword, totpToken: disableToken }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setStatus({ enabled: false, backupCodesRemaining: 0 });
      setStep('idle');
      setDisablePassword('');
      setDisableToken('');
      toast.success('2FA désactivé.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function copyAllCodes() {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    toast.success('Codes copiés dans le presse-papiers');
  }

  function downloadCodes() {
    const blob = new Blob(
      [
        'Codes de secours OpenQuittance\n',
        '============================\n\n',
        'Conservez ces codes en lieu sûr. Chacun est utilisable UNE seule fois.\n\n',
        ...backupCodes.map((c, i) => `${(i + 1).toString().padStart(2, '0')}. ${c}\n`),
      ],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quittances-backup-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function finishShowCodes() {
    setStep('idle');
    setBackupCodes([]);
    setSecret('');
    setQr('');
    setToken('');
    fetch('/api/profil/totp').then(r => r.json()).then(setStatus);
  }

  if (!status) {
    return <AppShell><p className="text-muted-foreground">Chargement…</p></AppShell>;
  }

  return (
    <AppShell>
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Shield size={22} /> Sécurité du compte
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Authentification à deux facteurs (TOTP) compatible Google Authenticator, Authy, 1Password…
          </p>
        </div>

        {/* État courant */}
        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            {status.enabled ? (
              <ShieldCheck size={28} className="text-emerald-600" />
            ) : (
              <Shield size={28} className="text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">
                {status.enabled ? '2FA activé' : '2FA désactivé'}
              </p>
              <p className="text-xs text-muted-foreground">
                {status.enabled
                  ? `${status.backupCodesRemaining} code(s) de secours restant(s)`
                  : 'Votre compte est protégé uniquement par un mot de passe'}
              </p>
            </div>
          </div>

          {step === 'idle' && !status.enabled && (
            <button className="btn-primary" onClick={startSetup} disabled={loading}>
              Activer le 2FA
            </button>
          )}
          {step === 'idle' && status.enabled && (
            <button className="btn-secondary" onClick={() => setStep('disable')} disabled={loading}>
              Désactiver le 2FA
            </button>
          )}
        </div>

        {/* Étape 1 : QR code à scanner */}
        {step === 'setup' && (
          <div className="card space-y-4">
            <h2 className="font-medium">1. Scannez le QR code</h2>
            <p className="text-sm text-muted-foreground">
              Avec Google Authenticator, Authy, 1Password ou tout client TOTP.
            </p>
            <div className="flex flex-col items-center gap-3">
              {qr && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={qr} alt="QR code TOTP" className="border border-border rounded" />
              )}
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Saisir manuellement le secret</summary>
                <code className="block mt-2 p-2 bg-muted rounded select-all">{secret}</code>
              </details>
            </div>
            <button className="btn-primary w-full" onClick={() => setStep('verify')}>
              J'ai scanné, continuer
            </button>
          </div>
        )}

        {/* Étape 2 : vérifier un code */}
        {step === 'verify' && (
          <div className="card space-y-3">
            <h2 className="font-medium">2. Entrez un code généré</h2>
            <input
              className="input text-center text-2xl tracking-widest font-mono"
              maxLength={6}
              value={token}
              onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              autoFocus
            />
            <button
              className="btn-primary w-full"
              onClick={verifyAndEnable}
              disabled={loading || token.length !== 6}
            >
              {loading ? 'Vérification…' : 'Activer'}
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setStep('setup')}
            >
              ← Revenir au QR code
            </button>
          </div>
        )}

        {/* Étape 3 : afficher les codes de secours */}
        {step === 'show-codes' && (
          <div className="card space-y-4 border-amber-300">
            <div className="flex items-start gap-2">
              <AlertTriangle size={20} className="shrink-0 text-amber-600 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">Sauvegardez ces codes maintenant.</p>
                <p className="text-xs text-muted-foreground">
                  Ils ne seront plus affichés. Chaque code est à usage unique et permet de se connecter
                  si vous perdez votre téléphone.
                </p>
              </div>
            </div>
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
              {backupCodes.map((c, i) => (
                <li key={i} className="bg-muted px-3 py-2 rounded text-center">{c}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={copyAllCodes}>
                <Copy size={14} /> Copier
              </button>
              <button className="btn-secondary flex-1" onClick={downloadCodes}>
                <Download size={14} /> Télécharger .txt
              </button>
            </div>
            <button className="btn-primary w-full" onClick={finishShowCodes}>
              J'ai sauvegardé mes codes
            </button>
          </div>
        )}

        {/* Désactivation */}
        {step === 'disable' && (
          <div className="card space-y-3">
            <h2 className="font-medium">Désactiver le 2FA</h2>
            <p className="text-sm text-muted-foreground">
              Confirmez avec votre mot de passe et un code TOTP.
            </p>
            <div>
              <label className="label">Mot de passe</label>
              <input
                type="password"
                className="input"
                value={disablePassword}
                onChange={e => setDisablePassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Code TOTP (6 chiffres)</label>
              <input
                className="input font-mono tracking-widest"
                maxLength={6}
                value={disableToken}
                onChange={e => setDisableToken(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setStep('idle')}>
                Annuler
              </button>
              <button
                className="btn-primary flex-1"
                onClick={disable}
                disabled={loading || !disablePassword || disableToken.length !== 6}
              >
                {loading ? 'Désactivation…' : 'Désactiver'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
