'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

/**
 * v3.1.0 — UI Paramètres > Backup. ADMIN only (gating côté API).
 *
 * Sécurité côté UX :
 *   - Secrets (accessKeyId, secretKey, envPassphrase) reçus en `***` masqué.
 *     Si l'utilisateur ne touche pas le champ, on PUT `***` → API préserve
 *     la valeur DB existante.
 *   - Passphrase env : checkbox confirmation IRRÉCUPÉRABLE obligatoire pour
 *     enregistrer une nouvelle valeur (≠ `***`).
 */

export interface BackupConfig {
  instanceId: string | null;
  backupEnabled: boolean;
  backupStorageType: 's3' | 'drive';
  backupS3Endpoint: string | null;
  backupS3Region: string | null;
  backupS3Bucket: string | null;
  backupS3ForcePathStyle: boolean;
  backupS3AccessKeyId: string | null; // `***` ou null
  backupS3SecretKey: string | null;
  backupDriveFolderId: string | null;
  backupDriveAccountEmail: string | null;
  backupDriveConnected: boolean;
  // v3.1.0-rc10 — credentials Google Drive saisis via UI (plus dans .env).
  googleDriveClientId: string | null; // `***` si configuré, null sinon
  googleDriveClientSecret: string | null;
  backupSchedule: string | null;
  backupRetentionDays: number;
  backupEnvPassphrase: string | null;
  backupNotifySuccess: boolean;
  backupLastRunAt: string | null;
  backupLastStatus: string | null;
  backupLastError: string | null;
}

const PROVIDER_PRESETS: Record<string, { endpoint: string; region: string; forcePathStyle: boolean }> = {
  b2: { endpoint: 'https://s3.eu-central-003.backblazeb2.com', region: 'eu-central-003', forcePathStyle: false },
  r2: { endpoint: 'https://<account>.r2.cloudflarestorage.com', region: 'auto', forcePathStyle: false },
  wasabi: { endpoint: 'https://s3.eu-central-1.wasabisys.com', region: 'eu-central-1', forcePathStyle: false },
  aws: { endpoint: 'https://s3.eu-west-1.amazonaws.com', region: 'eu-west-1', forcePathStyle: false },
  minio: { endpoint: 'http://localhost:9000', region: 'us-east-1', forcePathStyle: true },
};

const SCHEDULE_PRESETS: Record<string, string> = {
  'daily-3': '0 3 * * *',
  'weekly-sun-3': '0 3 * * 0',
  'twice-weekly': '0 3 * * 1,4',
};

interface ConnTestResult {
  ok: boolean;
  error?: string;
  failedAt?: 'head' | 'put' | 'delete';
}

export default function BackupForm({ initial }: { initial: BackupConfig }) {
  const [form, setForm] = useState<BackupConfig>(initial);
  const [provider, setProvider] = useState<string>('custom');
  const [schedulePreset, setSchedulePreset] = useState<string>(
    Object.entries(SCHEDULE_PRESETS).find(([, v]) => v === initial.backupSchedule)?.[0] ?? 'custom',
  );
  const [accessKeyDirty, setAccessKeyDirty] = useState(false);
  const [secretKeyDirty, setSecretKeyDirty] = useState(false);
  const [passphraseDirty, setPassphraseDirty] = useState(false);
  const [driveClientIdDirty, setDriveClientIdDirty] = useState(false);
  const [driveClientSecretDirty, setDriveClientSecretDirty] = useState(false);
  const [confirmIrrecuperable, setConfirmIrrecuperable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);
  const [testResult, setTestResult] = useState<ConnTestResult | null>(null);

  const applyProvider = (key: string) => {
    setProvider(key);
    if (key === 'custom') return;
    const preset = PROVIDER_PRESETS[key];
    if (!preset) return;
    setForm(f => ({
      ...f,
      backupS3Endpoint: preset.endpoint,
      backupS3Region: preset.region,
      backupS3ForcePathStyle: preset.forcePathStyle,
    }));
  };

  const applySchedulePreset = (key: string) => {
    setSchedulePreset(key);
    if (key === 'custom') return;
    const cron = SCHEDULE_PRESETS[key];
    if (cron) setForm(f => ({ ...f, backupSchedule: cron }));
  };

  const passphraseValid = !passphraseDirty || (form.backupEnvPassphrase && form.backupEnvPassphrase.length >= 12 && confirmIrrecuperable);

  // Toast feedback OAuth callback (?drive_connected=1 / ?drive_error=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('drive_connected') === '1') {
      toast.success('Compte Google Drive connecté');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('drive_error')) {
      toast.error(`Échec connexion Drive : ${params.get('drive_error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const save = async () => {
    if (form.backupEnabled && passphraseDirty && !confirmIrrecuperable) {
      toast.error('Cochez la confirmation IRRÉCUPÉRABLE');
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      const payload = {
        backupEnabled: form.backupEnabled,
        backupStorageType: form.backupStorageType,
        backupS3Endpoint: form.backupS3Endpoint || null,
        backupS3Region: form.backupS3Region || null,
        backupS3Bucket: form.backupS3Bucket || null,
        backupS3ForcePathStyle: form.backupS3ForcePathStyle,
        backupS3AccessKeyId: accessKeyDirty ? form.backupS3AccessKeyId : '***',
        backupS3SecretKey: secretKeyDirty ? form.backupS3SecretKey : '***',
        backupDriveFolderId: form.backupDriveFolderId || null,
        googleDriveClientId: driveClientIdDirty ? form.googleDriveClientId : '***',
        googleDriveClientSecret: driveClientSecretDirty ? form.googleDriveClientSecret : '***',
        backupSchedule: form.backupSchedule || null,
        backupRetentionDays: form.backupRetentionDays,
        backupEnvPassphrase: passphraseDirty ? form.backupEnvPassphrase : '***',
        backupNotifySuccess: form.backupNotifySuccess,
      };
      const r = await fetch('/api/parametres/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const j = await r.json();
        toast.error(j.error || 'Échec sauvegarde');
        return;
      }
      const saved: BackupConfig = await r.json();
      setForm(saved);
      setAccessKeyDirty(false);
      setSecretKeyDirty(false);
      setPassphraseDirty(false);
      setDriveClientIdDirty(false);
      setDriveClientSecretDirty(false);
      setConfirmIrrecuperable(false);
      // v3.1.0-rc9 — re-fetch GET pour confirmer ce qui est en DB.
      // Évite tout drift entre la valeur retournée par POST et l'état
      // serveur (notamment si scheduler reload modifie autre chose).
      try {
        const refresh = await fetch('/api/parametres/backup');
        if (refresh.ok) {
          const fresh: BackupConfig = await refresh.json();
          setForm(fresh);
        }
      } catch {
        // Non bloquant — saved du POST suffit.
      }
      toast.success(
        saved.backupEnabled
          ? 'Configuration enregistrée — backup activé'
          : 'Configuration enregistrée — backup désactivé',
      );
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch('/api/admin/backup/test-connection', { method: 'POST' });
      const result: ConnTestResult = await r.json();
      setTestResult(result);
      if (result.ok && !result.error) toast.success('Connexion S3 OK');
      else if (result.ok && result.error) toast.warning('Connexion partielle');
      else toast.error(`Échec ${result.failedAt}: ${result.error}`);
    } finally {
      setTesting(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const r = await fetch('/api/admin/backup/run', { method: 'POST' });
      if (r.status === 202) {
        toast.success('Backup démarré en arrière-plan');
      } else {
        const j = await r.json();
        toast.error(j.error || 'Échec démarrage');
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Toggle activation */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Backup automatique</h2>
            <p className="text-xs text-muted-foreground">
              Sauvegarde DB + uploads + .env vers S3-compatible (B2 / R2 / Wasabi / AWS).
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.backupEnabled}
            onClick={() => setForm(f => ({ ...f, backupEnabled: !f.backupEnabled }))}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              form.backupEnabled ? 'bg-green-600' : 'bg-muted'
            }`}
          >
            <span className="sr-only">
              {form.backupEnabled ? 'Désactiver le backup' : 'Activer le backup'}
            </span>
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                form.backupEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-medium ${form.backupEnabled ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
            État : {form.backupEnabled ? '✅ Activé' : '⏸️ Désactivé'}
          </span>
          {form.instanceId && (
            <p className="text-xs text-muted-foreground font-mono">
              Instance ID : <span className="select-all">{form.instanceId}</span>
            </p>
          )}
        </div>
      </div>

      {form.backupEnabled && (
        <>
          {/* Storage type toggle */}
          <div className="card space-y-3">
            <h2 className="font-semibold">Type de stockage</h2>
            <div className="grid grid-cols-2 gap-2">
              {[
                ['s3', 'S3-compatible (B2 / R2 / Wasabi / AWS)'],
                ['drive', 'Google Drive'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, backupStorageType: key as 's3' | 'drive' }))}
                  className={`px-3 py-3 text-sm border rounded ${
                    form.backupStorageType === key ? 'border-foreground bg-muted/40' : 'border-border hover:bg-muted/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {form.backupStorageType === 's3'
                ? 'Bucket S3-compatible (Backblaze B2, Cloudflare R2, Wasabi, AWS S3, MinIO local).'
                : 'Compte Google Drive personnel — scope minimal drive.file (l\'app accède uniquement aux fichiers qu\'elle crée).'}
            </p>
          </div>

          {form.backupStorageType === 'drive' && (
            <div className="card space-y-3">
              <h2 className="font-semibold">Google Drive — Configuration Google Cloud</h2>
              <p className="text-xs text-muted-foreground">
                Créez vos credentials OAuth 2.0 dans{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Google Cloud Console
                </a>
                {' '}(procédure complète :{' '}
                <a href="https://github.com/grx14/quittances-app/blob/main/docs/BACKUP.md#configurer-un-backup-google-drive" target="_blank" rel="noopener noreferrer" className="underline">
                  docs/BACKUP.md
                </a>
                ). Redirect URI :{' '}
                <code className="text-[10px]">{`${typeof window !== 'undefined' ? window.location.origin : ''}/api/admin/backup/drive/oauth/callback`}</code>
              </p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="label">Google Client ID</label>
                  <input
                    className="input font-mono"
                    type="text"
                    value={form.googleDriveClientId ?? ''}
                    onFocus={e => {
                      if (e.target.value === '***') {
                        setForm(f => ({ ...f, googleDriveClientId: '' }));
                        setDriveClientIdDirty(true);
                      }
                    }}
                    onChange={e => {
                      setForm(f => ({ ...f, googleDriveClientId: e.target.value }));
                      setDriveClientIdDirty(true);
                    }}
                    placeholder={
                      form.googleDriveClientId === '***'
                        ? '*** (déjà configuré)'
                        : 'Ex: 123456-abc.apps.googleusercontent.com'
                    }
                  />
                </div>
                <div>
                  <label className="label">Google Client Secret</label>
                  <input
                    className="input font-mono"
                    type="password"
                    value={form.googleDriveClientSecret ?? ''}
                    onFocus={e => {
                      if (e.target.value === '***') {
                        setForm(f => ({ ...f, googleDriveClientSecret: '' }));
                        setDriveClientSecretDirty(true);
                      }
                    }}
                    onChange={e => {
                      setForm(f => ({ ...f, googleDriveClientSecret: e.target.value }));
                      setDriveClientSecretDirty(true);
                    }}
                    placeholder={
                      form.googleDriveClientSecret === '***'
                        ? '*** (déjà configuré)'
                        : 'GOCSPX-xxxxx'
                    }
                  />
                </div>
              </div>
              {form.googleDriveClientId === '***' && form.googleDriveClientSecret === '***' && (
                <p className="text-xs text-green-700 dark:text-green-400">
                  ✓ Credentials Google configurés
                </p>
              )}
              <div className="border-t border-border pt-3">
                {form.backupDriveConnected ? (
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm">
                        <span className="text-green-700 dark:text-green-400">●</span> Compte Drive connecté
                        {form.backupDriveAccountEmail && (
                          <span className="ml-1 font-mono">({form.backupDriveAccountEmail})</span>
                        )}
                      </p>
                    </div>
                    <a
                      href="/api/admin/backup/drive/oauth/start"
                      className="btn-sm"
                    >
                      Reconnecter
                    </a>
                  </div>
                ) : form.googleDriveClientId === '***' && form.googleDriveClientSecret === '***' ? (
                  <a
                    href="/api/admin/backup/drive/oauth/start"
                    className="btn-primary inline-block"
                  >
                    Connecter Google Drive
                  </a>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Saisissez vos credentials Google ci-dessus puis cliquez sur "Enregistrer"
                    avant de pouvoir vous connecter.
                  </div>
                )}
              </div>
              <div>
                <label className="label">ID du dossier Drive cible</label>
                <input
                  className="input font-mono"
                  value={form.backupDriveFolderId ?? ''}
                  onChange={e => setForm(f => ({ ...f, backupDriveFolderId: e.target.value }))}
                  placeholder="1aBcDeFgHiJkLmNoPqRsTuVwXyZ"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ouvrez le dossier dans Drive — l'URL contient
                  <code className="mx-1">/folders/&lt;ID&gt;</code>. Copiez l'ID ici.
                  Le dossier doit être accessible au compte Google connecté.
                </p>
              </div>
            </div>
          )}

          {form.backupStorageType === 's3' && (
          <div className="card space-y-3">
            <h2 className="font-semibold">Fournisseur S3</h2>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {[
                ['b2', 'Backblaze B2'],
                ['r2', 'Cloudflare R2'],
                ['wasabi', 'Wasabi'],
                ['aws', 'AWS S3'],
                ['custom', 'Personnalisé'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyProvider(key)}
                  className={`px-3 py-2 text-sm border rounded ${
                    provider === key ? 'border-foreground bg-muted/40' : 'border-border hover:bg-muted/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Endpoint URL</label>
                <input
                  className="input"
                  value={form.backupS3Endpoint ?? ''}
                  onChange={e => setForm(f => ({ ...f, backupS3Endpoint: e.target.value }))}
                  placeholder="https://s3.region.exemple.com"
                />
              </div>
              <div>
                <label className="label">Région</label>
                <input
                  className="input"
                  value={form.backupS3Region ?? ''}
                  onChange={e => setForm(f => ({ ...f, backupS3Region: e.target.value }))}
                  placeholder="eu-west-1 ou auto"
                />
              </div>
              <div>
                <label className="label">Bucket</label>
                <input
                  className="input"
                  value={form.backupS3Bucket ?? ''}
                  onChange={e => setForm(f => ({ ...f, backupS3Bucket: e.target.value }))}
                  placeholder="openquittance-backups"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.backupS3ForcePathStyle}
                    onChange={e => setForm(f => ({ ...f, backupS3ForcePathStyle: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Force path-style (MinIO local)</span>
                </label>
              </div>
            </div>
          </div>
          )}

          {form.backupStorageType === 's3' && (
          <div className="card space-y-3">
            <h2 className="font-semibold">Identifiants S3</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Access Key ID</label>
                <input
                  className="input font-mono"
                  type="text"
                  value={form.backupS3AccessKeyId ?? ''}
                  onFocus={e => {
                    if (e.target.value === '***') {
                      setForm(f => ({ ...f, backupS3AccessKeyId: '' }));
                      setAccessKeyDirty(true);
                    }
                  }}
                  onChange={e => {
                    setForm(f => ({ ...f, backupS3AccessKeyId: e.target.value }));
                    setAccessKeyDirty(true);
                  }}
                  placeholder={form.backupS3AccessKeyId === '***' ? '*** (déjà configuré)' : 'AKIA...'}
                />
              </div>
              <div>
                <label className="label">Secret Access Key</label>
                <input
                  className="input font-mono"
                  type="password"
                  value={form.backupS3SecretKey ?? ''}
                  onFocus={e => {
                    if (e.target.value === '***') {
                      setForm(f => ({ ...f, backupS3SecretKey: '' }));
                      setSecretKeyDirty(true);
                    }
                  }}
                  onChange={e => {
                    setForm(f => ({ ...f, backupS3SecretKey: e.target.value }));
                    setSecretKeyDirty(true);
                  }}
                  placeholder={form.backupS3SecretKey === '***' ? '*** (déjà configuré)' : ''}
                />
              </div>
            </div>
          </div>
          )}

          {/* Schedule */}
          <div className="card space-y-3">
            <h2 className="font-semibold">Planification</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['daily-3', 'Quotidien 3h'],
                ['weekly-sun-3', 'Hebdo dimanche 3h'],
                ['twice-weekly', 'Lundi + jeudi 3h'],
                ['custom', 'Personnalisé'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applySchedulePreset(key)}
                  className={`px-3 py-2 text-sm border rounded ${
                    schedulePreset === key ? 'border-foreground bg-muted/40' : 'border-border hover:bg-muted/20'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {schedulePreset === 'custom' && (
              <div>
                <label className="label">Cron expression (5 champs)</label>
                <input
                  className="input font-mono"
                  value={form.backupSchedule ?? ''}
                  onChange={e => setForm(f => ({ ...f, backupSchedule: e.target.value }))}
                  placeholder="0 3 * * *  (minute heure jour mois jourSemaine)"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ex : <code>0 3 * * *</code> = quotidien 3h ; <code>*/15 * * * *</code> = toutes les 15 min.
                </p>
              </div>
            )}
            <div>
              <label className="label">
                Rétention : {form.backupRetentionDays} jour{form.backupRetentionDays > 1 ? 's' : ''}
              </label>
              <input
                type="range"
                min={7}
                max={365}
                step={1}
                value={form.backupRetentionDays}
                onChange={e => setForm(f => ({ ...f, backupRetentionDays: Number(e.target.value) }))}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Backups plus anciens supprimés automatiquement après chaque run.
              </p>
            </div>
          </div>

          {/* Passphrase env */}
          <div className="card space-y-3">
            <h2 className="font-semibold">Chiffrement du fichier .env</h2>
            <div className="rounded border-l-4 border-red-500 bg-red-50 dark:bg-red-950/30 p-3 text-sm">
              <p className="font-semibold text-red-800 dark:text-red-300">⚠️ IRRÉCUPÉRABLE si perdue</p>
              <p className="text-red-700 dark:text-red-200 mt-1">
                Cette passphrase chiffre votre fichier <code>.env</code> qui contient les clés
                <code className="mx-1">ENCRYPTION_SECRET</code> et
                <code className="mx-1">UPLOADS_ENCRYPTION_KEY</code>. Sans cette passphrase, vos
                backups sont totalement <strong>inutilisables</strong>. Sauvegardez-la dans un
                gestionnaire de mots de passe externe (1Password, Bitwarden, KeePass).
              </p>
            </div>
            <div>
              <label className="label">Passphrase</label>
              <input
                className="input font-mono"
                type="password"
                value={form.backupEnvPassphrase ?? ''}
                onFocus={e => {
                  if (e.target.value === '***') {
                    setForm(f => ({ ...f, backupEnvPassphrase: '' }));
                    setPassphraseDirty(true);
                  }
                }}
                onChange={e => {
                  setForm(f => ({ ...f, backupEnvPassphrase: e.target.value }));
                  setPassphraseDirty(true);
                }}
                placeholder={form.backupEnvPassphrase === '***' ? '*** (déjà configurée)' : 'Minimum 12 caractères'}
              />
              {passphraseDirty && (
                <label className="flex items-start gap-2 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmIrrecuperable}
                    onChange={e => setConfirmIrrecuperable(e.target.checked)}
                    className="w-4 h-4 mt-0.5"
                  />
                  <span className="text-sm">
                    Je comprends que cette passphrase est <strong>IRRÉCUPÉRABLE</strong> et je
                    l'ai sauvegardée dans un gestionnaire de mots de passe externe.
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* Notif */}
          <div className="card space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.backupNotifySuccess}
                onChange={e => setForm(f => ({ ...f, backupNotifySuccess: e.target.checked }))}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Notifier aussi les backups réussis</span>
            </label>
            <p className="text-xs text-muted-foreground">
              Les échecs sont toujours notifiés par email. Cochez pour recevoir aussi les confirmations de succès.
            </p>
          </div>
        </>
      )}

      {/* Last run status */}
      {form.backupLastRunAt && (
        <div className="card">
          <h2 className="font-semibold mb-2">Dernier backup</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><span className="text-muted-foreground">Date :</span> {new Date(form.backupLastRunAt).toLocaleString('fr-FR')}</span>
            <span>
              <span className="text-muted-foreground">Statut :</span>{' '}
              <span className={form.backupLastStatus === 'success' ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                {form.backupLastStatus}
              </span>
            </span>
            {form.backupLastError && (
              <span className="basis-full text-red-700 dark:text-red-400 font-mono text-xs">
                {form.backupLastError}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div className={`card border-l-4 ${testResult.ok && !testResult.error ? 'border-green-500' : testResult.ok ? 'border-yellow-500' : 'border-red-500'}`}>
          <p className="font-semibold">
            {testResult.ok && !testResult.error
              ? '✅ Connexion S3 fonctionnelle'
              : testResult.ok
                ? '⚠️ Test partiel'
                : `❌ Échec à l'étape ${testResult.failedAt}`}
          </p>
          {testResult.error && (
            <p className="text-sm text-muted-foreground font-mono mt-1">{testResult.error}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          className="btn"
          onClick={testConnection}
          disabled={testing || !form.backupS3Endpoint || !form.backupS3Bucket}
        >
          {testing ? 'Test…' : 'Tester la connexion'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={runNow}
          disabled={running || !form.backupEnabled}
        >
          {running ? 'Démarrage…' : 'Backup maintenant'}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={save}
          disabled={saving || !passphraseValid}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
