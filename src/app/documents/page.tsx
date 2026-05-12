'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Receipt, ClipboardList, Calendar, Euro, FileSignature, Building2 } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import ArchiveManager from '@/components/ArchiveManager';
import PdfPreviewModal from '@/components/PdfPreviewModal';
import { useBailleurs } from '@/lib/bailleur-context';
import { formatMontant, MOIS_FR } from '@/lib/utils';

interface Locataire {
  id: string;
  nom: string;
  prenom: string;
  loyerNu: number;
  charges: number;
  dateEntree: string;
  dateSortie: string | null;
  actif: boolean;
  montantDepotGarantie: number | null;
  bien: { id: string; nom: string; adresse: string; ville: string; bailleurId: string };
}

interface Bien {
  id: string;
  nom: string;
  adresse: string;
  codePostal: string;
  ville: string;
  actif: boolean;
}

export default function DocumentsPage() {
  // BailleurProvider est monté par AppShell, donc tout composant qui appelle
  // useBailleurs() doit être un ENFANT de AppShell, pas le parent.
  return (
    <AppShell>
      <DocumentsContent />
    </AppShell>
  );
}

function DocumentsContent() {
  const { active } = useBailleurs();
  const [locataires, setLocataires] = useState<Locataire[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [loading, setLoading] = useState(true);
  // v2.5.0 Feature A : pills switcher Bien|Locataires (Q12). Default
  // Locataires (rétro-compat — c'était l'unique vue avant v2.5.0).
  const [scope, setScope] = useState<'locataires' | 'biens'>('locataires');
  const today = new Date();
  const [mois, setMois] = useState(today.getMonth() + 1);
  const [annee, setAnnee] = useState(today.getFullYear());
  const [preview, setPreview] = useState<{ url: string; filename: string; title: string } | null>(null);

  useEffect(() => {
    if (!active) return;
    setLoading(true);
    // L'API /api/locataires retourne le tableau directement (pas wrappé).
    // /api/biens idem. Fetch les 2 en parallèle.
    Promise.all([
      fetch(`/api/locataires?bailleurId=${active.id}`).then(r => r.json()),
      fetch(`/api/biens?bailleurId=${active.id}`).then(r => r.json()),
    ])
      .then(([locArr, bienArr]: [Locataire[] | { error?: string }, Bien[] | { error?: string }]) => {
        setLocataires(Array.isArray(locArr) ? locArr.filter(l => l.actif !== false) : []);
        setBiens(Array.isArray(bienArr) ? bienArr : []);
      })
      .catch(() => { setLocataires([]); setBiens([]); })
      .finally(() => setLoading(false));
  }, [active]);

  const previewDoc = (url: string, filename: string, title: string) => {
    // PDF preview live : aperçu inline dans une modale plutôt qu'un nouvel
    // onglet. L'iframe utilise le viewer natif du navigateur.
    setPreview({ url, filename, title });
  };

  if (!active) {
    return <p className="text-muted-foreground">Sélectionnez un bailleur dans la barre latérale.</p>;
  }

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FileText size={22} /> Documents
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Génération à la volée et archives propriétaire / locataire.
          </p>
        </div>

        {/* Q12 pills switcher Bien | Locataires */}
        <div className="inline-flex rounded-md border border-border p-0.5 bg-muted">
          <button
            className={`px-4 py-1.5 text-sm font-medium rounded ${
              scope === 'locataires' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setScope('locataires')}
          >
            Locataires
          </button>
          <button
            className={`px-4 py-1.5 text-sm font-medium rounded ${
              scope === 'biens' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setScope('biens')}
          >
            Biens
          </button>
        </div>

        {scope === 'locataires' && (
        <div className="card flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Mois</label>
            <select className="input" value={mois} onChange={e => setMois(parseInt(e.target.value, 10))}>
              {MOIS_FR.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Année</label>
            <input
              type="number"
              className="input w-24"
              value={annee}
              min={2020} max={2100}
              onChange={e => setAnnee(parseInt(e.target.value, 10))}
            />
          </div>
          <p className="text-xs text-muted-foreground ml-auto">
            Mois/année utilisés pour les avis d'échéance.
          </p>
        </div>
        )}

        {loading ? (
          <p className="text-muted-foreground">Chargement…</p>
        ) : scope === 'biens' ? (
          biens.length === 0 ? (
            <p className="text-muted-foreground">Aucun bien pour ce bailleur.</p>
          ) : (
            <div className="space-y-3">
              {biens.map(b => (
                <div key={b.id} className="card space-y-3">
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-muted-foreground" />
                    <p className="font-medium">{b.nom}</p>
                    <p className="text-sm text-muted-foreground">
                      {b.adresse} · {b.codePostal} {b.ville}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <ArchiveManager
                      ownerType="Bien"
                      ownerId={b.id}
                      ownerLabel={b.nom}
                    />
                  </div>
                </div>
              ))}
            </div>
          )
        ) : locataires.length === 0 ? (
          <p className="text-muted-foreground">Aucun locataire actif pour ce bailleur.</p>
        ) : (
          <div className="space-y-3">
            {locataires.map(l => (
              <div key={l.id} className="card space-y-3">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-medium">{l.prenom} {l.nom}</p>
                    <p className="text-sm text-muted-foreground">{l.bien.nom} — {l.bien.adresse}, {l.bien.ville}</p>
                    <p className="text-xs text-muted-foreground">
                      Loyer {formatMontant(l.loyerNu)} + charges {formatMontant(l.charges)} ={' '}
                      <strong>{formatMontant(l.loyerNu + l.charges)}</strong>
                      {l.montantDepotGarantie != null && (
                        <> · Dépôt de garantie : {formatMontant(l.montantDepotGarantie)}</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-secondary"
                    onClick={() => previewDoc(
                      `/api/documents/avis-echeance?locataireId=${l.id}&mois=${mois}&annee=${annee}`,
                      `avis-echeance-${l.nom}-${mois}-${annee}.pdf`,
                      `Avis d'échéance — ${l.prenom} ${l.nom}`,
                    )}
                  >
                    <Calendar size={14} /> Avis d'échéance
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => previewDoc(
                      `/api/documents/depot-garantie?locataireId=${l.id}`,
                      `depot-garantie-${l.nom}.pdf`,
                      `Dépôt de garantie — ${l.prenom} ${l.nom}`,
                    )}
                  >
                    <Euro size={14} /> Reçu dépôt de garantie
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => previewDoc(
                      `/api/documents/etat-des-lieux?locataireId=${l.id}&type=ENTREE`,
                      `edl-entree-${l.nom}.pdf`,
                      `EDL entrée — ${l.prenom} ${l.nom}`,
                    )}
                  >
                    <ClipboardList size={14} /> EDL entrée
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => previewDoc(
                      `/api/documents/etat-des-lieux?locataireId=${l.id}&type=SORTIE`,
                      `edl-sortie-${l.nom}.pdf`,
                      `EDL sortie — ${l.prenom} ${l.nom}`,
                    )}
                  >
                    <Receipt size={14} /> EDL sortie
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={async () => {
                      const url = `/api/documents/courrier-revision?locataireId=${l.id}`;
                      const r = await fetch(url, { method: 'HEAD' });
                      if (!r.ok) {
                        toast.error('Aucune révision IRL appliquée pour ce locataire');
                        return;
                      }
                      previewDoc(url, `revision-loyer-${l.nom}.pdf`,
                        `Courrier de révision IRL — ${l.prenom} ${l.nom}`);
                    }}
                  >
                    <FileSignature size={14} /> Courrier révision IRL
                  </button>
                </div>

                <details className="text-sm pt-2 border-t border-border">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                    Archives locataire (bail, EDL, garantie loyer…)
                  </summary>
                  <div className="pt-3">
                    <ArchiveManager
                      ownerType="Locataire"
                      ownerId={l.id}
                      ownerLabel={`${l.prenom} ${l.nom}`}
                    />
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      {preview && (
        <PdfPreviewModal
          url={preview.url}
          filename={preview.filename}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
