'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Users, UserPlus, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import AppShell from '@/components/layout/AppShell';
import Modal from '@/components/Modal';
import EmptyState from '@/components/EmptyState';
import LocataireForm from '@/components/LocataireForm';
import { useBailleurs } from '@/lib/bailleur-context';
import { formatMontant } from '@/lib/utils';

interface Bien { id: string; nom: string; adresse: string; ville: string }
interface Locataire {
  id: string; bienId: string; nom: string; prenom: string;
  email: string | null; telephone: string | null;
  loyerNu: number; charges: number;
  montantDepotGarantie: number | null;
  irlTrimestre: number | null; irlValeurReference: number | null;
  dateEntree: string; dateSortie: string | null; actif: boolean;
  tenantUserId: string | null;
  portailActiveLe: string | null;
  portailActif: boolean;
  partageQuittances: boolean;
  partageEtatDesLieux: boolean;
  partageBail: boolean;
  partageDDT: boolean;
  bien: { nom: string; bailleur: { nom: string } };
}

function LocatairesContent() {
  const { active } = useBailleurs();
  const [locataires, setLocataires] = useState<Locataire[]>([]);
  const [biens, setBiens] = useState<Bien[]>([]);
  const [editing, setEditing] = useState<Locataire | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  // Raccourci 'n' depuis la palette de commandes
  useEffect(() => {
    const onNew = () => setCreating(true);
    window.addEventListener('palette:new', onNew);
    return () => window.removeEventListener('palette:new', onNew);
  }, []);

  const load = async () => {
    if (!active) return;
    const [rl, rb] = await Promise.all([
      fetch(`/api/locataires?bailleurId=${active.id}`),
      fetch(`/api/biens?bailleurId=${active.id}`),
    ]);
    setLocataires(await rl.json());
    setBiens(await rb.json());
  };
  useEffect(() => { load(); }, [active]);

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    if (!s) return locataires;
    return locataires.filter(l =>
      `${l.nom} ${l.prenom} ${l.email ?? ''} ${l.bien.nom}`.toLowerCase().includes(s),
    );
  }, [locataires, search]);

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer ce locataire ?')) return;
    const r = await fetch(`/api/locataires/${id}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
    toast.success('Supprimé');
    load();
  };

  if (!active) return <p className="text-muted-foreground">Sélectionnez un bailleur.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Locataires</h1>
          <p className="text-sm text-muted-foreground">{active.nom}</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> Ajouter
        </button>
      </div>

      {locataires.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title="Aucun locataire pour ce bailleur"
            description={
              biens.length === 0
                ? "Vous devez d'abord créer un bien avant d'y rattacher un locataire."
                : 'Ajoutez votre premier locataire pour pouvoir générer des quittances.'
            }
            action={
              biens.length === 0
                ? { label: 'Créer un bien', href: '/biens', icon: Plus }
                : { label: 'Ajouter un locataire', onClick: () => setCreating(true), icon: Plus }
            }
          />
        </div>
      ) : (
        <>
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input className="input pl-9" placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Desktop ≥ md : table */}
      <div className="hidden md:block card p-0 overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>Nom</th><th>Prénom</th><th>Bien</th>
              <th className="text-right">Loyer</th><th className="text-right">Charges</th><th className="text-right">Total</th>
              <th>Email</th><th>Statut</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">Aucun résultat pour cette recherche.</td></tr>}
            {filtered.map(l => (
              <tr key={l.id}>
                <td className="font-medium">{l.nom}</td>
                <td>{l.prenom}</td>
                <td>{l.bien.nom}</td>
                <td className="text-right">{formatMontant(l.loyerNu)}</td>
                <td className="text-right">{formatMontant(l.charges)}</td>
                <td className="text-right font-medium">{formatMontant(l.loyerNu + l.charges)}</td>
                <td className="text-muted-foreground text-xs">
                  {l.email || <span className="badge-warn">absent</span>}
                </td>
                <td>{l.actif ? <span className="badge-ok">Actif</span> : <span className="badge-off">Inactif</span>}</td>
                <td className="text-right whitespace-nowrap">
                  <PortailButton locataire={l} onChanged={load} />
                  <button className="btn-ghost" onClick={() => setEditing(l)} aria-label="Modifier le locataire" title="Modifier"><Pencil size={14} /></button>
                  <button className="btn-ghost text-destructive" onClick={() => onDelete(l.id)} aria-label="Supprimer le locataire" title="Supprimer"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* v3.6.2 mobile < md : cards */}
      <ul className="md:hidden space-y-3">
        {filtered.length === 0 && (
          <li className="card text-center text-muted-foreground text-sm">Aucun résultat pour cette recherche.</li>
        )}
        {filtered.map(l => (
          <li key={l.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{l.nom} {l.prenom}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{l.bien.nom}</p>
                {l.email
                  ? <p className="text-xs text-muted-foreground truncate">{l.email}</p>
                  : <p className="text-xs"><span className="badge-warn">email absent</span></p>}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {l.actif ? <span className="badge-ok">Actif</span> : <span className="badge-off">Inactif</span>}
                <span className="font-semibold text-sm">{formatMontant(l.loyerNu + l.charges)}</span>
                <span className="text-[10px] text-muted-foreground">
                  loyer {formatMontant(l.loyerNu)} + ch. {formatMontant(l.charges)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="shrink-0">
                <PortailButton locataire={l} onChanged={load} />
              </div>
              <button className="btn-secondary flex-1 text-xs" onClick={() => setEditing(l)}>
                <Pencil size={14} /> Modifier
              </button>
              <button className="btn-secondary flex-1 text-xs text-destructive" onClick={() => onDelete(l.id)}>
                <Trash2 size={14} /> Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
        </>
      )}

      {(creating || editing) && (
        <LocataireFormModal
          locataire={editing}
          biens={biens}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function PortailButton({ locataire: l, onChanged }: { locataire: Locataire; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const isActive = !!l.portailActiveLe;

  const invite = async () => {
    if (!l.email) {
      toast.error('Renseignez un email pour ce locataire avant d\'activer le portail.');
      return;
    }
    if (isActive && !confirm(`Renvoyer un lien d'accès au portail à ${l.email} ?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/locataires/${l.id}/portail-invite`, { method: 'POST' });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Erreur'); return; }
      toast.success(isActive ? `Nouveau lien envoyé à ${l.email}` : `Invitation envoyée à ${l.email}`);
      onChanged();
    } finally { setBusy(false); }
  };

  const disable = async () => {
    if (!confirm(`Désactiver l'accès au portail pour ${l.prenom} ${l.nom} ? Les liens en attente seront invalidés.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/locataires/${l.id}/portail-invite`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Erreur'); return; }
      toast.success('Portail désactivé');
      onChanged();
    } finally { setBusy(false); }
  };

  if (isActive) {
    return (
      <button
        className="btn-ghost text-emerald-600 hover:text-emerald-700"
        onClick={(e) => { e.preventDefault(); if (e.shiftKey) disable(); else invite(); }}
        disabled={busy}
        title="Portail actif. Clic = renvoyer un lien. Maj+clic = désactiver."
      >
        <UserCheck size={14} />
      </button>
    );
  }
  return (
    <button
      className="btn-ghost"
      onClick={invite}
      disabled={busy}
      title="Inviter au portail locataire"
    >
      <UserPlus size={14} />
    </button>
  );
}

function LocataireFormModal({ locataire, biens, onClose, onSaved }: { locataire: Locataire | null; biens: Bien[]; onClose: () => void; onSaved: () => void }) {
  return (
    <Modal open onClose={onClose} title={locataire ? 'Modifier le locataire' : 'Nouveau locataire'} maxWidth="max-w-2xl">
      <LocataireForm
        locataire={locataire}
        biens={biens}
        onCancel={onClose}
        onSaved={onSaved}
      />
    </Modal>
  );
}

export default function LocatairesPage() {
  return <AppShell><LocatairesContent /></AppShell>;
}
