'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useBailleurs } from '@/lib/bailleur-context';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

interface Bailleur {
  id: string; nom: string; pdfCouleur: string; pdfPolice: string;
  logoUrl: string | null; signatureUrl: string | null;
}

function ApparenceContent() {
  const { active, refresh } = useBailleurs();
  const [bailleur, setBailleur] = useState<Bailleur | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    if (!active) return;
    fetch(`/api/bailleurs/${active.id}`).then(r => r.json()).then(setBailleur);
  }, [active]);

  const save = async () => {
    if (!bailleur) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/bailleurs/${bailleur.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfCouleur: bailleur.pdfCouleur,
          pdfPolice: bailleur.pdfPolice,
        }),
      });
      if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }

      if (logoFile) await upload(logoFile, 'logo', bailleur.id);
      if (signatureFile) await upload(signatureFile, 'signature', bailleur.id);

      toast.success('Enregistré');
      const refreshed = await fetch(`/api/bailleurs/${bailleur.id}`).then(r => r.json());
      setBailleur(refreshed);
      setLogoFile(null);
      setSignatureFile(null);
      setPreviewKey(k => k + 1);
      refresh();
    } finally { setSaving(false); }
  };

  const upload = async (file: File, kind: 'logo' | 'signature', bailleurId: string) => {
    const fd = new FormData();
    fd.append('file', file); fd.append('kind', kind); fd.append('bailleurId', bailleurId);
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!r.ok) { const j = await r.json(); toast.error(`${kind}: ${j.error}`); }
  };

  if (!active) return <p className="text-muted-foreground">Sélectionnez un bailleur.</p>;
  if (!bailleur) return <p className="text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-semibold">Apparence du PDF</h1>
      <p className="text-sm text-muted-foreground">Bailleur : <strong>{bailleur.nom}</strong></p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="card space-y-3">
            <h2 className="font-semibold">Couleur principale</h2>
            <div className="flex items-center gap-3">
              <input type="color" className="input h-12 w-20 p-1" value={bailleur.pdfCouleur} onChange={e => setBailleur(b => b ? { ...b, pdfCouleur: e.target.value } : b)} />
              <input className="input flex-1" value={bailleur.pdfCouleur} onChange={e => setBailleur(b => b ? { ...b, pdfCouleur: e.target.value } : b)} />
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold">Logo (PDF)</h2>
            {bailleur.logoUrl && (
              <img src={`/api/uploads/${bailleur.logoUrl}?v=${previewKey}`} alt="Logo" className="h-20 object-contain bg-muted/30 rounded p-2" />
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="input" onChange={e => setLogoFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">PNG, JPG ou WEBP — 2 MB max</p>
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold">Signature (PDF)</h2>
            {bailleur.signatureUrl && (
              <img src={`/api/uploads/${bailleur.signatureUrl}?v=${previewKey}`} alt="Signature" className="h-16 object-contain bg-muted/30 rounded p-2" />
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="input" onChange={e => setSignatureFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">Préférer un PNG transparent.</p>
          </div>

          <div className="flex justify-end">
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer & Aperçu'}
            </button>
          </div>
        </div>

        <div className="card p-2">
          <p className="text-xs text-muted-foreground mb-2 px-2 pt-1">Aperçu (utilise une quittance existante)</p>
          <PdfPreview bailleurId={bailleur.id} version={previewKey} />
        </div>
      </div>
    </div>
  );
}

function PdfPreview({ bailleurId, version }: { bailleurId: string; version: number }) {
  const [quittanceId, setQuittanceId] = useState<string | null>(null);
  const { isMobile } = useIsMobile();
  useEffect(() => {
    fetch(`/api/quittances?bailleurId=${bailleurId}`).then(r => r.json()).then(list => {
      setQuittanceId(list[0]?.id ?? null);
    });
  }, [bailleurId]);
  if (!quittanceId) {
    return <p className="text-sm text-muted-foreground p-6 text-center">Créez d'abord une quittance pour voir l'aperçu.</p>;
  }
  // v3.6.2 — sur mobile : iframe inutile (pas de viewer PDF natif
  // Chrome Android + Safari iOS non responsive). Remplace par
  // bouton download.
  if (isMobile) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          Aperçu PDF disponible sur desktop. Sur mobile, téléchargez
          le PDF généré pour le visualiser dans l'app native.
        </p>
        <a
          href={`/api/quittances/${quittanceId}/pdf`}
          download
          className="btn-secondary inline-flex"
        >
          <Download size={14} /> Télécharger le PDF d'exemple
        </a>
      </div>
    );
  }
  return (
    <iframe key={version} src={`/api/quittances/${quittanceId}/pdf?inline=1`} className="w-full h-[70vh] rounded border border-border" />
  );
}

export default function ApparencePage() {
  return <AppShell><ApparenceContent /></AppShell>;
}
