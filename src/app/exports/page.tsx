'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, FileCode, Archive as ArchiveIcon } from 'lucide-react';
import { toast } from 'sonner';
import AppShell from '@/components/layout/AppShell';
import { useBailleurs } from '@/lib/bailleur-context';
import { todayIso } from '@/lib/utils';

interface Bien { id: string; nom: string }
interface Locataire { id: string; nom: string; prenom: string }

function ExportsContent() {
  const { active } = useBailleurs();
  const [biens, setBiens] = useState<Bien[]>([]);
  const [locataires, setLocataires] = useState<Locataire[]>([]);

  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(today.getFullYear() - 1);

  const [du, setDu] = useState(oneYearAgo.toISOString().slice(0, 10));
  const [au, setAu] = useState(todayIso());
  const [bienId, setBienId] = useState('');
  const [locataireId, setLocataireId] = useState('');
  const [downloading, setDownloading] = useState<'pdf' | 'xml' | null>(null);
  // v2.7.0 Feature C — Export complet ZIP. State séparé pour pouvoir
  // afficher un message rate-limit "Réessayez dans Xs" lu depuis
  // le header Retry-After (Q17 cadrage).
  const [zipping, setZipping] = useState(false);
  const [zipRateLimitMsg, setZipRateLimitMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    Promise.all([
      fetch(`/api/biens?bailleurId=${active.id}`).then(r => r.json()),
      fetch(`/api/locataires?bailleurId=${active.id}`).then(r => r.json()),
    ]).then(([b, l]) => { setBiens(b); setLocataires(l); });
  }, [active]);

  if (!active) return <p className="text-muted-foreground">Sélectionnez un bailleur.</p>;

  const downloadZip = async () => {
    if (!active) return;
    setZipping(true);
    setZipRateLimitMsg(null);
    try {
      const r = await fetch(`/api/exports/bailleur/${active.id}/zip`);
      if (r.status === 429) {
        const retryAfter = r.headers.get('retry-after') ?? '';
        const seconds = parseInt(retryAfter, 10);
        const msg = Number.isFinite(seconds) && seconds > 0
          ? `Limite atteinte. Réessayez dans ${seconds}s.`
          : 'Limite d\'exports atteinte. Réessayez plus tard.';
        setZipRateLimitMsg(msg);
        return;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(j.error || 'Erreur lors de la génération du ZIP');
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = r.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(cd);
      a.download = match?.[1] || `export-${active.id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const sizeMb = (blob.size / 1024 / 1024).toFixed(1);
      toast.success(`Archive téléchargée (${sizeMb} Mo)`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur réseau');
    } finally {
      setZipping(false);
    }
  };

  const download = async (kind: 'pdf' | 'xml') => {
    setDownloading(kind);
    try {
      const r = await fetch(`/api/exports/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bailleurId: active.id, du, au,
          bienId: bienId || null,
          locataireId: locataireId || null,
        }),
      });
      if (!r.ok) {
        const j = await r.json();
        toast.error(j.error || 'Erreur');
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = r.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/.exec(cd);
      a.download = match?.[1] || `export.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Téléchargé');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Exports</h1>
        <p className="text-sm text-muted-foreground">{active.nom}</p>
      </div>

      {/* v2.7.0 Feature C : Export complet ZIP en haut, séparé des
          exports PDF/XML filtrables (Q14 cadrage UI). */}
      <div className="card space-y-3 border-primary/40">
        <div className="flex items-start gap-3">
          <ArchiveIcon className="text-primary shrink-0 mt-0.5" size={24} />
          <div className="flex-1">
            <h2 className="font-semibold">Export complet du bailleur</h2>
            <p className="text-sm text-muted-foreground">
              Toutes les quittances + documents + locataires + biens du
              bailleur actif dans une archive ZIP organisée
              (manifest.json + arborescence par bien et locataire).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            onClick={downloadZip}
            disabled={zipping}
          >
            {zipping ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1" />
                Génération…
              </>
            ) : (
              <>
                <Download size={14} /> Exporter (ZIP)
              </>
            )}
          </button>
          {zipRateLimitMsg && (
            <span className="text-xs text-amber-600">{zipRateLimitMsg}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Limite : 1 export toutes les 5 min par utilisateur. Génération
          peut prendre plusieurs secondes selon le volume.
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold">Filtres</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Du</label>
            <input type="date" className="input" value={du} onChange={e => setDu(e.target.value)} />
          </div>
          <div>
            <label className="label">Au</label>
            <input type="date" className="input" value={au} onChange={e => setAu(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Bien (optionnel)</label>
            <select className="input" value={bienId} onChange={e => setBienId(e.target.value)}>
              <option value="">Tous les biens</option>
              {biens.map(b => <option key={b.id} value={b.id}>{b.nom}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Locataire (optionnel)</label>
            <select className="input" value={locataireId} onChange={e => setLocataireId(e.target.value)}>
              <option value="">Tous les locataires</option>
              {locataires.map(l => <option key={l.id} value={l.id}>{l.nom} {l.prenom}</option>)}
            </select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          La période est appliquée sur la <strong>date d'émission</strong> des quittances.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            <FileText className="text-primary" size={24} />
            <div>
              <h3 className="font-semibold">PDF récapitulatif</h3>
              <p className="text-xs text-muted-foreground">Tableau imprimable avec en-tête bailleur et totaux</p>
            </div>
          </div>
          <button className="btn-primary w-full" onClick={() => download('pdf')} disabled={downloading !== null}>
            <Download size={14} /> {downloading === 'pdf' ? 'Génération…' : 'Télécharger PDF'}
          </button>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            <FileCode className="text-primary" size={24} />
            <div>
              <h3 className="font-semibold">Export XML</h3>
              <p className="text-xs text-muted-foreground">Données complètes structurées pour comptabilité ou archive</p>
            </div>
          </div>
          <button className="btn-secondary w-full" onClick={() => download('xml')} disabled={downloading !== null}>
            <Download size={14} /> {downloading === 'xml' ? 'Génération…' : 'Télécharger XML'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExportsPage() {
  return <AppShell><ExportsContent /></AppShell>;
}
