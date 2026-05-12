'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/Spinner';
import { toast } from 'sonner';
import AppShell from '@/components/layout/AppShell';
import Modal from '@/components/Modal';
import { useBailleurs } from '@/lib/bailleur-context';

interface Bailleur {
  id: string; nom: string; rcs: string | null;
  adresseLigne1: string; adresseLigne2: string; villeSignature: string;
  pdfCouleur: string; pdfPolice: string;
  // v3.0.1 — opacité logo zone signature PDFs (0-100, default 30)
  signatureLogoOpacity: number;
  logoUrl: string | null; signatureUrl: string | null; actif: boolean;
  // v2.8.0 — informations légales
  raisonSociale: string | null;
  formeJuridique: string | null;
  siret: string | null;
  adresseLegale: string | null;
  emailRgpd: string | null;
  directeurPublication: string | null;
  hebergeur: string | null;
}

const FORME_JURIDIQUE_OPTIONS: Array<[string, string]> = [
  ['', '— Non précisé —'],
  ['SCI', 'SCI'],
  ['SARL', 'SARL'],
  ['SA', 'SA'],
  ['EURL', 'EURL'],
  ['AUTO_ENTREPRENEUR', 'Auto-entrepreneur'],
  ['PARTICULIER', 'Particulier'],
  ['AUTRE', 'Autre'],
];

function BailleursContent() {
  const { bailleurs, refresh } = useBailleurs();
  const [editing, setEditing] = useState<Bailleur | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const onNew = () => setCreating(true);
    window.addEventListener('palette:new', onNew);
    return () => window.removeEventListener('palette:new', onNew);
  }, []);

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer ce bailleur ? Cela supprimera aussi ses biens et locataires.')) return;
    const r = await fetch(`/api/bailleurs/${id}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
    toast.success('Bailleur supprimé');
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bailleurs</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {/* Desktop ≥ md : table */}
      <div className="hidden md:block card p-0 overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>Nom</th><th>Adresse</th><th>RCS</th><th>Couleur</th><th>Statut</th><th></th>
            </tr>
          </thead>
          <tbody>
            {bailleurs.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">Aucun bailleur.</td></tr>
            )}
            {bailleurs.map(b => (
              <tr key={b.id}>
                <td className="font-medium">{(b as Bailleur).nom}</td>
                <td>—</td>
                <td className="text-muted-foreground text-xs">—</td>
                <td>
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 rounded border border-border" style={{ background: (b as Bailleur).pdfCouleur }} />
                    <span className="text-xs">{(b as Bailleur).pdfCouleur}</span>
                  </span>
                </td>
                <td><span className="badge-ok">Actif</span></td>
                <td className="text-right whitespace-nowrap">
                  <button
                    className="btn-ghost"
                    aria-label="Modifier le bailleur"
                    title="Modifier"
                    onClick={async () => {
                      const r = await fetch(`/api/bailleurs/${b.id}`);
                      if (r.ok) setEditing(await r.json());
                    }}
                  ><Pencil size={14} /></button>
                  <button className="btn-ghost text-destructive" onClick={() => onDelete(b.id)} aria-label="Supprimer le bailleur" title="Supprimer"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* v3.6.2 mobile < md : cards */}
      <ul className="md:hidden space-y-3">
        {bailleurs.length === 0 && (
          <li className="card text-center text-muted-foreground text-sm">Aucun bailleur.</li>
        )}
        {bailleurs.map(b => {
          const bb = b as Bailleur;
          return (
            <li key={bb.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{bb.nom}</p>
                  <p className="text-xs text-muted-foreground inline-flex items-center gap-2 mt-1">
                    <span className="w-3 h-3 rounded-sm border border-border shrink-0" style={{ background: bb.pdfCouleur }} />
                    <span className="truncate">{bb.pdfCouleur}</span>
                  </p>
                </div>
                <span className="badge-ok shrink-0">Actif</span>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex-1 text-xs"
                  onClick={async () => {
                    const r = await fetch(`/api/bailleurs/${bb.id}`);
                    if (r.ok) setEditing(await r.json());
                  }}
                >
                  <Pencil size={14} /> Modifier
                </button>
                <button
                  className="btn-secondary flex-1 text-xs text-destructive"
                  onClick={() => onDelete(bb.id)}
                >
                  <Trash2 size={14} /> Supprimer
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {(creating || editing) && (
        <BailleurForm
          bailleur={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function BailleurForm({ bailleur, onClose, onSaved }: { bailleur: Bailleur | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Bailleur>>(bailleur ?? {
    nom: '', rcs: '', adresseLigne1: '', adresseLigne2: '', villeSignature: '',
    pdfCouleur: '#1a3a5c', pdfPolice: 'Helvetica',
    signatureLogoOpacity: 30,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  // v2.8.0 — onglet "Légal" pour mentions légales + politique RGPD
  const [tab, setTab] = useState<'infos' | 'legal'>('infos');

  const submit = async () => {
    setSaving(true);
    try {
      const url = bailleur ? `/api/bailleurs/${bailleur.id}` : '/api/bailleurs';
      const method = bailleur ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
      const saved = await r.json();
      if (logoFile) await upload(logoFile, 'logo', saved.id);
      if (signatureFile) await upload(signatureFile, 'signature', saved.id);
      toast.success(bailleur ? 'Modifié' : 'Créé');
      onSaved();
    } finally { setSaving(false); }
  };

  const upload = async (file: File, kind: 'logo' | 'signature', bailleurId: string) => {
    const fd = new FormData();
    fd.append('file', file); fd.append('kind', kind); fd.append('bailleurId', bailleurId);
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    if (!r.ok) { const j = await r.json(); toast.error(`${kind}: ${j.error}`); }
  };

  const tabBtn = (key: 'infos' | 'legal', label: string) => (
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
    <Modal open onClose={onClose} title={bailleur ? 'Modifier le bailleur' : 'Nouveau bailleur'} maxWidth="max-w-2xl">
      <div className="flex gap-1 mb-4 border-b border-border">
        {tabBtn('infos', 'Infos')}
        {tabBtn('legal', 'Légal')}
      </div>

      {tab === 'infos' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Nom commercial *</label>
              <input className="input" value={form.nom ?? ''} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} placeholder="Nom affiché aux locataires" />
              <p className="text-xs text-muted-foreground mt-1">
                Affiché aux locataires dans l&apos;app et les emails. Pour la
                dénomination légale, voir l&apos;onglet Légal.
              </p>
            </div>
            <div>
              <label className="label">Adresse *</label>
              <input className="input" value={form.adresseLigne1 ?? ''} onChange={e => setForm(f => ({ ...f, adresseLigne1: e.target.value }))} placeholder="Numéro et rue" />
            </div>
            <div>
              <label className="label">Code postal + ville *</label>
              <input className="input" value={form.adresseLigne2 ?? ''} onChange={e => setForm(f => ({ ...f, adresseLigne2: e.target.value }))} placeholder="00000 Ville" />
            </div>
            <div>
              <label className="label">Ville pour &quot;Fait à …&quot; *</label>
              <input className="input" value={form.villeSignature ?? ''} onChange={e => setForm(f => ({ ...f, villeSignature: e.target.value }))} placeholder="Ville de la signature" />
            </div>
            <div>
              <label className="label">Couleur PDF</label>
              <input type="color" className="input h-10 p-1" value={form.pdfCouleur ?? '#1a3a5c'} onChange={e => setForm(f => ({ ...f, pdfCouleur: e.target.value }))} />
            </div>
            <div>
              <label className="label">Logo {form.logoUrl && '(remplacer)'}</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="input" onChange={e => setLogoFile(e.target.files?.[0] ?? null)} />
            </div>
            <div>
              <label className="label">Signature {form.signatureUrl && '(remplacer)'}</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="input" onChange={e => setSignatureFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="col-span-2">
              <label className="label">
                Transparence du logo sur signature : {form.signatureLogoOpacity ?? 30}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={form.signatureLogoOpacity ?? 30}
                onChange={e => setForm(f => ({ ...f, signatureLogoOpacity: Number(e.target.value) }))}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Le logo est superposé sur la signature manuscrite dans tous les
                documents PDF générés (quittances, avis d&apos;échéance, EDL, dépôt
                garantie, courrier IRL). Réduisez la transparence si la signature
                est masquée par le logo. 0 = logo invisible, 100 = logo opaque.
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Ces informations sont obligatoires en cas de commercialisation
            (LCEN art. 6 + RGPD art. 13). Vous pouvez les laisser vides en
            usage strictement personnel — les pages /mentions-legales et
            /politique-confidentialite afficheront « Non renseigné ».
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Raison sociale</label>
              <input className="input" value={form.raisonSociale ?? ''}
                onChange={e => setForm(f => ({ ...f, raisonSociale: e.target.value }))}
                placeholder="Ex : SCI Beauregard (si différent du nom commercial)" />
            </div>
            <div>
              <label className="label">Forme juridique</label>
              <select className="input" value={form.formeJuridique ?? ''}
                onChange={e => setForm(f => ({ ...f, formeJuridique: e.target.value || null }))}>
                {FORME_JURIDIQUE_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">SIRET (14 chiffres)</label>
              <input className="input" value={form.siret ?? ''}
                onChange={e => setForm(f => ({ ...f, siret: e.target.value }))}
                placeholder="12345678900012" />
            </div>
            <div className="col-span-2">
              <label className="label">Siège social / adresse légale</label>
              <input className="input" value={form.adresseLegale ?? ''}
                onChange={e => setForm(f => ({ ...f, adresseLegale: e.target.value }))}
                placeholder="Adresse complète siège social (si différent de l'adresse de correspondance)" />
            </div>
            <div className="col-span-2">
              <label className="label">Email contact RGPD</label>
              <input type="email" className="input" value={form.emailRgpd ?? ''}
                onChange={e => setForm(f => ({ ...f, emailRgpd: e.target.value }))}
                placeholder="rgpd@bailleur.fr" />
            </div>
            <div className="col-span-2">
              <label className="label">Directeur de la publication</label>
              <input className="input" value={form.directeurPublication ?? ''}
                onChange={e => setForm(f => ({ ...f, directeurPublication: e.target.value }))}
                placeholder="Nom du responsable légal (par défaut : nom commercial)" />
            </div>
            <div className="col-span-2">
              <label className="label">Hébergeur</label>
              <textarea className="input" rows={2} value={form.hebergeur ?? ''}
                onChange={e => setForm(f => ({ ...f, hebergeur: e.target.value }))}
                placeholder="Auto-hébergement sur VM dédiée du bailleur (par défaut)" />
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4">
        <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
        <button className="btn-primary" onClick={submit} disabled={saving}>
          {saving && <Spinner />}
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </Modal>
  );
}

export default function BailleursPage() {
  return <AppShell><BailleursContent /></AppShell>;
}
