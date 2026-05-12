'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { toast } from 'sonner';
import { Shield } from 'lucide-react';

export default function Verify2FAPage() {
  const router = useRouter();
  const { update } = useSession();
  const [token, setToken] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch('/api/2fa-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useBackup ? { backupCode } : { totpToken: token }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || 'Code invalide');
        return;
      }
      // Force NextAuth à refaire tourner le JWT callback : il verra
      // mfaVerifiedAt set et libèrera mfaPending.
      await update();
      router.push('/');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="card w-full max-w-md space-y-5">
        <div className="text-center space-y-2">
          <Shield className="mx-auto text-primary" size={36} />
          <h1 className="text-xl font-semibold">Validation à deux facteurs</h1>
          <p className="text-sm text-muted-foreground">
            Vous êtes connecté via Google. Veuillez valider avec votre code TOTP pour terminer.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {!useBackup ? (
            <div>
              <label className="label">Code TOTP (6 chiffres)</label>
              <input
                className="input text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                required
                autoFocus
                value={token}
                onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          ) : (
            <div>
              <label className="label">Code de secours</label>
              <input
                className="input font-mono"
                required
                autoFocus
                placeholder="XXXXX-XXXXX"
                value={backupCode}
                onChange={e => setBackupCode(e.target.value.toUpperCase())}
              />
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Vérification…' : 'Valider'}
          </button>
        </form>

        <div className="flex justify-between text-xs">
          <button
            type="button"
            className="text-muted-foreground hover:underline"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Annuler et se déconnecter
          </button>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => { setUseBackup(!useBackup); setToken(''); setBackupCode(''); }}
          >
            {useBackup ? 'Utiliser un code TOTP' : 'Utiliser un code de secours'}
          </button>
        </div>
      </div>
    </div>
  );
}
