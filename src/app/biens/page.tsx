'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import AppShell from '@/components/layout/AppShell';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import ArchiveManager from '@/components/ArchiveManager';
import BienAnnonceForm from '@/components/BienAnnonceForm';
import { useBailleurs } from '@/lib/bailleur-context';
import { TYPE_BIEN_VALUES, DPE_CLASSE_VALUES } from '@/lib/validation';

interface Bien {
  id: string; bailleurId: string; nom: string; adresse: string;
  codePostal: string; ville: string; complement: string | null; actif: boolean;
  // v2.6.0 Feature B : métadonnées propriétaire (tous nullable)
  surface: number | null;
  typeBien: string | null;
  etage: number | null;
  dpeClasse: string | null;
  dpeKwh: number | null;
  dpeGes: number | null;
  annonceTexte: string | null;
  annonceMeta: import('@/components/BienAnnonceForm').BienAnnonceMeta | null;
  coverPhotoArchiveId: string | null;
  _count?: { locataires: number };
}

const TYPE_BIEN_LABELS_FR: Record<string, string> = {
  STUDIO: 'Studio',
  T1: 'T1',
  T2: 'T2',
  T3: 'T3',
  T4: 'T4',
  T5_PLUS: 'T5+',
  MAISON: 'Maison',
  CHAMBRE: 'Chambre',
  LOCAL_COMMERCIAL: 'Local commercial',
  AUTRE: 'Autre',
};

function BiensContent() {
  const router = useRouter();
  const { active } = useBailleurs();
  const [biens, setBiens] = useState<Bien[]>([]);
  const [editing, setEditing] = useState<Bien | null>(null);

  // v2.6.0 Feature B : palette + bouton "+ Nouveau logement" routent
  // vers le wizard. Le form modale BienForm reste accessible pour
  // l'édition d'un Bien existant (clic Pencil).
  useEffect(() => {
    const onNew = () => router.push('/biens/wizard');
    window.addEventListener('palette:new', onNew);
    return () => window.removeEventListener('palette:new', onNew);
  }, [router]);

  const load = async () => {
    if (!active) return;
    const r = await fetch(`/api/biens?bailleurId=${active.id}`);
    setBiens(await r.json());
  };
  useEffect(() => { load(); }, [active]);

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer ce bien ?')) return;
    const r = await fetch(`/api/biens/${id}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
    toast.success('Supprimé');
    load();
  };

  if (!active) return <p className="text-muted-foreground">Sélectionnez un bailleur.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Biens</h1>
          <p className="text-sm text-muted-foreground">{active.nom}</p>
        </div>
        <button className="btn-primary" onClick={() => router.push('/biens/wizard')}>
          <Plus size={16} /> Nouveau logement
        </button>
      </div>

      {biens.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Building2}
            title="Aucun bien pour ce bailleur"
            description="Ajoutez le premier logement que vous mettez en location."
            action={{ label: 'Nouveau logement', onClick: () => router.push('/biens/wizard'), icon: Plus }}
          />
        </div>
      ) : (
      <>
        {/* Desktop ≥ md : table */}
        <div className="hidden md:block card p-0 overflow-hidden">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nom</th><th>Adresse</th><th>CP</th><th>Ville</th><th>Locataires</th><th>Statut</th><th></th>
              </tr>
            </thead>
            <tbody>
              {biens.map(b => (
                <tr key={b.id}>
                  <td className="font-medium">{b.nom}</td>
                  <td>{b.adresse}{b.complement && <span className="text-muted-foreground"> — {b.complement}</span>}</td>
                  <td>{b.codePostal}</td>
                  <td>{b.ville}</td>
                  <td>{b._count?.locataires ?? 0}</td>
                  <td>{b.actif ? <span className="badge-ok">Actif</span> : <span className="badge-off">Inactif</span>}</td>
                  <td className="text-right">
                    <button className="btn-ghost" onClick={() => setEditing(b)} aria-label="Modifier le bien" title="Modifier"><Pencil size={14} /></button>
                    <button className="btn-ghost text-destructive" onClick={() => onDelete(b.id)} aria-label="Supprimer le bien" title="Supprimer"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* v3.6.2 mobile < md : cards */}
        <ul className="md:hidden space-y-3">
          {biens.map(b => (
            <li key={b.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{b.nom}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {b.adresse}{b.complement ? ' — ' + b.complement : ''}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {b.codePostal} {b.ville}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {b.actif ? <span className="badge-ok">Actif</span> : <span className="badge-off">Inactif</span>}
                  <span className="text-[10px] text-muted-foreground">
                    {b._count?.locataires ?? 0} locataire{(b._count?.locataires ?? 0) > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary flex-1 text-xs" onClick={() => setEditing(b)}>
                  <Pencil size={14} /> Modifier
                </button>
                <button className="btn-secondary flex-1 text-xs text-destructive" onClick={() => onDelete(b.id)}>
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      </>
      )}

      {editing && (
        <BienForm
          bien={editing}
          bailleurId={active.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function BienForm({ bien, bailleurId, onClose, onSaved }: { bien: Bien | null; bailleurId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Bien>>(bien ?? {
    bailleurId, nom: '', adresse: '', codePostal: '', ville: '', complement: '', actif: true,
  });
  const [saving, setSaving] = useState(false);
  // v2.5.0 Feature A : onglet Documents seulement en édition (besoin
  // d'un bien.id existant pour rattacher les archives ownerType=Bien).
  // v2.6.1 polish : 3e onglet Annonce pour régénérer une annonce sur
  // un Bien existant (pré-remplit depuis locataire actif si présent).
  const [tab, setTab] = useState<'infos' | 'docs' | 'annonce'>('infos');
  const [annonceInitial, setAnnonceInitial] = useState<{ loyerNu: number; charges: number; depotGarantie: number | null } | null>(null);
  const [bailleurInfo, setBailleurInfo] = useState<{ nom: string; email: string | null; telephone: string | null } | null>(null);

  // Pré-fetch locataire actif + bailleur quand l'onglet Annonce est ouvert
  // (lazy — pas de fetch tant que l'admin ne clique pas sur Annonce).
  useEffect(() => {
    if (tab !== 'annonce' || !bien) return;
    if (annonceInitial && bailleurInfo) return; // déjà fetché
    (async () => {
      // Locataire actif sur ce bien (le plus récent par dateEntree desc)
      const locRes = await fetch(`/api/locataires?bailleurId=${bailleurId}`);
      if (locRes.ok) {
        const locs = await locRes.json();
        const activeLoc = Array.isArray(locs)
          ? locs.find((l: { bienId: string; actif: boolean }) => l.bienId === bien.id && l.actif !== false)
          : null;
        if (activeLoc) {
          setAnnonceInitial({
            loyerNu: activeLoc.loyerNu ?? 0,
            charges: activeLoc.charges ?? 0,
            depotGarantie: activeLoc.montantDepotGarantie ?? null,
          });
        } else {
          setAnnonceInitial({ loyerNu: 0, charges: 0, depotGarantie: null });
        }
      }
      const bRes = await fetch(`/api/bailleurs/${bailleurId}`);
      if (bRes.ok) {
        const b = await bRes.json();
        // Bailleur n'a pas de champ email — l'admin saisit manuellement
        // dans le form annonce. Téléphone dispo (cf. schema.prisma:200).
        setBailleurInfo({
          nom: b.nom ?? '',
          email: null,
          telephone: b.telephone ?? null,
        });
      } else {
        setBailleurInfo({ nom: '', email: null, telephone: null });
      }
    })();
  }, [tab, bien, bailleurId, annonceInitial, bailleurInfo]);

  const submit = async () => {
    setSaving(true);
    try {
      const url = bien ? `/api/biens/${bien.id}` : '/api/biens';
      const method = bien ? 'PUT' : 'POST';
      // Coerce nullable numérique → null si vide (PUT partial).
      const cleanForm = {
        ...form,
        surface: form.surface == null ? null : Number(form.surface),
        etage: form.etage == null ? null : Number(form.etage),
        dpeKwh: form.dpeKwh == null ? null : Number(form.dpeKwh),
        dpeGes: form.dpeGes == null ? null : Number(form.dpeGes),
        typeBien: form.typeBien || null,
        dpeClasse: form.dpeClasse || null,
      };
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cleanForm, bailleurId }),
      });
      if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
      toast.success(bien ? 'Modifié' : 'Créé');
      onSaved();
    } finally { setSaving(false); }
  };

  const tabBtn = (key: 'infos' | 'docs' | 'annonce', label: string) => (
    <button
      key={key}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
        tab === key ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
      onClick={() => setTab(key)}
    >
      {label}
    </button>
  );

  return (
    <Modal open onClose={onClose} title={bien ? 'Modifier le bien' : 'Nouveau bien'} maxWidth={tab === 'annonce' ? 'max-w-4xl' : undefined}>
      {bien && (
        <div className="flex gap-1 mb-4 border-b border-border">
          {tabBtn('infos', 'Infos')}
          {tabBtn('docs', 'Documents')}
          {tabBtn('annonce', 'Annonce')}
        </div>
      )}
      {tab === 'docs' && bien ? (
        <div className="space-y-3">
          <ArchiveManager
            ownerType="Bien"
            ownerId={bien.id}
            ownerLabel={bien.nom}
          />
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            Documents propriétaire (acte vente, DPE, diagnostics, copro, fiscalité…).
            Les diagnostics légaux (DPE, amiante, élec, gaz, plomb, ERP) peuvent être
            partagés avec les locataires en activant « Partager DDT » sur leur fiche.
          </p>
          <div className="flex justify-end pt-2">
            <button className="btn-secondary" onClick={onClose}>Fermer</button>
          </div>
        </div>
      ) : tab === 'annonce' && bien ? (
        <div className="space-y-3">
          {annonceInitial && bailleurInfo ? (
            <BienAnnonceForm
              bien={{
                id: bien.id,
                nom: bien.nom,
                adresse: bien.adresse,
                complement: bien.complement,
                codePostal: bien.codePostal,
                ville: bien.ville,
                surface: bien.surface,
                typeBien: bien.typeBien,
                etage: bien.etage,
                dpeClasse: bien.dpeClasse,
                dpeKwh: bien.dpeKwh,
                dpeGes: bien.dpeGes,
                annonceTexte: bien.annonceTexte,
                annonceMeta: bien.annonceMeta,
              }}
              initialContact={{
                nomBailleur: bailleurInfo.nom,
                email: bailleurInfo.email,
                telephone: bailleurInfo.telephone,
              }}
              initialFinances={annonceInitial}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            Loyer/charges/dépôt pré-remplis depuis le locataire actif (si présent).
            Modifiez librement pour l'annonce — les valeurs ne sont pas écrites
            sur la fiche locataire. Auto-sauvé sur le bien.
          </p>
          <div className="flex justify-end pt-2">
            <button className="btn-secondary" onClick={onClose}>Fermer</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Nom *</label>
            <input className="input" value={form.nom ?? ''} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Référence interne (ex. T2 centre, Studio rue X)" />
          </div>
          <div>
            <label className="label">Adresse *</label>
            <input className="input" value={form.adresse ?? ''} onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} placeholder="Numéro et rue" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Code postal *</label>
              <input className="input" value={form.codePostal ?? ''} onChange={e => setForm(f => ({ ...f, codePostal: e.target.value }))} placeholder="00000" />
            </div>
            <div>
              <label className="label">Ville *</label>
              <input className="input" value={form.ville ?? ''} onChange={e => setForm(f => ({ ...f, ville: e.target.value }))} placeholder="Ville" />
            </div>
          </div>
          <div>
            <label className="label">Complément (apparaît dans la quittance)</label>
            <input className="input" value={form.complement ?? ''} onChange={e => setForm(f => ({ ...f, complement: e.target.value }))} placeholder="Bât. A, étage, n° d'appartement…" />
          </div>

          {/* v2.6.1 polish : édition métadonnées propriétaire */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
            <div>
              <label className="label">Surface (m²)</label>
              <input type="number" step="0.1" className="input"
                value={form.surface ?? ''}
                onChange={e => setForm(f => ({ ...f, surface: e.target.value === '' ? null : Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={form.typeBien ?? ''}
                onChange={e => setForm(f => ({ ...f, typeBien: e.target.value || null }))}>
                <option value="">— Non précisé —</option>
                {TYPE_BIEN_VALUES.map(t => <option key={t} value={t}>{TYPE_BIEN_LABELS_FR[t]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Étage</label>
              <input type="number" className="input"
                value={form.etage ?? ''}
                onChange={e => setForm(f => ({ ...f, etage: e.target.value === '' ? null : Number(e.target.value) }))}
                placeholder="0 = rdc" />
            </div>
            <div>
              <label className="label">DPE classe</label>
              <select className="input" value={form.dpeClasse ?? ''}
                onChange={e => setForm(f => ({ ...f, dpeClasse: e.target.value || null }))}>
                <option value="">—</option>
                {DPE_CLASSE_VALUES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">DPE kWh/m²/an</label>
              <input type="number" step="0.1" className="input"
                value={form.dpeKwh ?? ''}
                onChange={e => setForm(f => ({ ...f, dpeKwh: e.target.value === '' ? null : Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">DPE GES (kgCO2)</label>
              <input type="number" step="0.1" className="input"
                value={form.dpeGes ?? ''}
                onChange={e => setForm(f => ({ ...f, dpeGes: e.target.value === '' ? null : Number(e.target.value) }))} />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <input id="actif" type="checkbox" checked={!!form.actif} onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))} />
            <label htmlFor="actif" className="text-sm">Actif</label>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
            <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function BiensPage() {
  return <AppShell><BiensContent /></AppShell>;
}
