'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { isoToInputDate } from '@/lib/utils';

export interface LocataireFormBien {
  id: string;
  nom: string;
  adresse: string;
  ville: string;
}

export interface LocataireFormValue {
  id: string;
  bienId: string;
  nom: string;
  prenom: string;
  email: string | null;
  telephone: string | null;
  loyerNu: number;
  charges: number;
  montantDepotGarantie: number | null;
  irlTrimestre: number | null;
  irlValeurReference: number | null;
  dateEntree: string;
  dateSortie: string | null;
  actif: boolean;
  portailActif: boolean;
  partageQuittances: boolean;
  partageEtatDesLieux: boolean;
  partageBail: boolean;
  partageDDT: boolean;
}

/**
 * Form de création / édition Locataire — extrait de
 * `/locataires/page.tsx` (Q18 cadrage Feature B). Réutilisé par :
 *   - /locataires (wrapping `<Modal>`)
 *   - /biens/wizard step 3 (inline)
 *
 * Si `lockedBienId` est fourni (wizard, locataire d'un Bien spécifique),
 * le sélecteur de Bien est masqué et la valeur préchargée.
 */
export default function LocataireForm({
  locataire,
  biens,
  lockedBienId,
  submitLabel,
  cancelLabel = 'Annuler',
  onCancel,
  onSaved,
}: {
  locataire: LocataireFormValue | null;
  biens: LocataireFormBien[];
  lockedBienId?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  onSaved: (created: { id: string }) => void;
}) {
  const initial = locataire
    ? {
        bienId: locataire.bienId,
        nom: locataire.nom, prenom: locataire.prenom,
        email: locataire.email ?? '', telephone: locataire.telephone ?? '',
        loyerNu: locataire.loyerNu, charges: locataire.charges,
        montantDepotGarantie: locataire.montantDepotGarantie ?? '',
        irlTrimestre: locataire.irlTrimestre ?? '',
        irlValeurReference: locataire.irlValeurReference ?? '',
        dateEntree: isoToInputDate(locataire.dateEntree),
        dateSortie: isoToInputDate(locataire.dateSortie),
        actif: locataire.actif,
        portailActif: locataire.portailActif ?? false,
        partageQuittances: locataire.partageQuittances ?? true,
        partageEtatDesLieux: locataire.partageEtatDesLieux ?? true,
        partageBail: locataire.partageBail ?? true,
        partageDDT: locataire.partageDDT ?? false,
      }
    : {
        bienId: lockedBienId ?? biens[0]?.id ?? '',
        nom: '', prenom: '', email: '', telephone: '',
        loyerNu: 0, charges: 0,
        montantDepotGarantie: '' as number | '',
        irlTrimestre: '' as number | '',
        irlValeurReference: '' as number | '',
        dateEntree: new Date().toISOString().slice(0, 10),
        dateSortie: '', actif: true,
        portailActif: false,
        partageQuittances: true,
        partageEtatDesLieux: true,
        partageBail: true,
        partageDDT: false,
      };
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const url = locataire ? `/api/locataires/${locataire.id}` : '/api/locataires';
      const method = locataire ? 'PUT' : 'POST';
      const body = {
        ...form,
        dateSortie: form.dateSortie || null,
        montantDepotGarantie:
          form.montantDepotGarantie === '' ? null : Number(form.montantDepotGarantie),
        irlTrimestre:
          form.irlTrimestre === '' ? null : Number(form.irlTrimestre),
        irlValeurReference:
          form.irlValeurReference === '' ? null : Number(form.irlValeurReference),
      };
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
      const created = await r.json();
      toast.success(locataire ? 'Modifié' : 'Créé');
      onSaved(created);
    } finally { setSaving(false); }
  };

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Nom *</label>
          <input className="input" value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} /></div>
        <div><label className="label">Prénom *</label>
          <input className="input" value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} /></div>
        <div><label className="label">Email</label>
          <input type="email" className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
        <div><label className="label">Téléphone</label>
          <input className="input" value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} /></div>
        {!lockedBienId && (
          <div className="col-span-2"><label className="label">Bien *</label>
            <select className="input" value={form.bienId} onChange={e => setForm(f => ({ ...f, bienId: e.target.value }))}>
              {biens.map(b => <option key={b.id} value={b.id}>{b.nom} — {b.adresse}, {b.ville}</option>)}
            </select></div>
        )}
        <div><label className="label">Loyer nu (€) *</label>
          <input type="number" step="0.01" className="input" value={form.loyerNu} onChange={e => setForm(f => ({ ...f, loyerNu: Number(e.target.value) }))} /></div>
        <div><label className="label">Charges (€) *</label>
          <input type="number" step="0.01" className="input" value={form.charges} onChange={e => setForm(f => ({ ...f, charges: Number(e.target.value) }))} /></div>
        <div className="col-span-2"><label className="label">Dépôt de garantie (€)</label>
          <input
            type="number" step="0.01"
            className="input"
            placeholder="(optionnel — utilisé pour le reçu de dépôt de garantie)"
            value={form.montantDepotGarantie}
            onChange={e => setForm(f => ({
              ...f,
              montantDepotGarantie: e.target.value === '' ? '' : Number(e.target.value),
            }))}
          /></div>
        <div className="col-span-2 grid grid-cols-2 gap-3 pt-2 border-t border-border">
          <div className="col-span-2 -mb-1">
            <p className="text-xs text-muted-foreground">
              Indexation IRL (optionnel) — pour activer la révision annuelle automatique.
            </p>
          </div>
          <div><label className="label">Trimestre IRL</label>
            <select className="input" value={form.irlTrimestre}
              onChange={e => setForm(f => ({ ...f, irlTrimestre: e.target.value === '' ? '' : Number(e.target.value) }))}>
              <option value="">— Pas d'indexation —</option>
              {[1, 2, 3, 4].map(t => <option key={t} value={t}>T{t}</option>)}
            </select></div>
          <div><label className="label">IRL de référence</label>
            <input
              type="number" step="0.01"
              className="input"
              placeholder="ex: 145.47 (au moment du bail)"
              value={form.irlValeurReference}
              onChange={e => setForm(f => ({
                ...f,
                irlValeurReference: e.target.value === '' ? '' : Number(e.target.value),
              }))}
            /></div>
        </div>
        <div><label className="label">Date d'entrée *</label>
          <input type="date" className="input" value={form.dateEntree} onChange={e => setForm(f => ({ ...f, dateEntree: e.target.value }))} /></div>
        <div><label className="label">Date de sortie</label>
          <input type="date" className="input" value={form.dateSortie} onChange={e => setForm(f => ({ ...f, dateSortie: e.target.value }))} /></div>
        <div className="col-span-2 flex items-center gap-2 pt-1">
          <input id="actif" type="checkbox" checked={form.actif} onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))} />
          <label htmlFor="actif" className="text-sm">Actif</label>
        </div>

        {/* ─── Section Portail (Phase 1 doc sharing + v2.5.0 partageDDT) ─── */}
        <div className="col-span-2 pt-3 border-t border-border space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Portail locataire
          </p>
          <div className="flex items-center gap-2">
            <input
              id="portailActif" type="checkbox"
              checked={form.portailActif}
              onChange={e => setForm(f => ({ ...f, portailActif: e.target.checked }))}
            />
            <label htmlFor="portailActif" className="text-sm">
              Portail activé
              <span className="text-xs text-muted-foreground ml-1">
                (le locataire peut consulter ses documents en ligne)
              </span>
            </label>
          </div>
          {form.portailActif && (
            <div className="pl-6 space-y-1.5 border-l-2 border-border ml-2">
              <p className="text-xs text-muted-foreground">Catégories partagées :</p>
              <div className="flex items-center gap-2">
                <input
                  id="partageQuittances" type="checkbox"
                  checked={form.partageQuittances}
                  onChange={e => setForm(f => ({ ...f, partageQuittances: e.target.checked }))}
                />
                <label htmlFor="partageQuittances" className="text-sm">Quittances mensuelles</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="partageEtatDesLieux" type="checkbox"
                  checked={form.partageEtatDesLieux}
                  onChange={e => setForm(f => ({ ...f, partageEtatDesLieux: e.target.checked }))}
                />
                <label htmlFor="partageEtatDesLieux" className="text-sm">États des lieux (entrée + sortie)</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="partageBail" type="checkbox"
                  checked={form.partageBail}
                  onChange={e => setForm(f => ({ ...f, partageBail: e.target.checked }))}
                />
                <label htmlFor="partageBail" className="text-sm">Bail / contrat</label>
              </div>
              <div className="flex items-start gap-2">
                <input
                  id="partageDDT" type="checkbox"
                  checked={form.partageDDT}
                  onChange={e => setForm(f => ({ ...f, partageDDT: e.target.checked }))}
                  className="mt-0.5"
                />
                <div>
                  <label htmlFor="partageDDT" className="text-sm">Partager DDT</label>
                  <p className="text-xs text-muted-foreground">
                    Diagnostics du bien (DPE, amiante, etc.) — annexés au bail légalement.
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Autres documents : à activer au cas par cas dans la page Documents.
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <button className="btn-secondary" onClick={onCancel} disabled={saving}>{cancelLabel}</button>
        )}
        <button className="btn-primary" onClick={submit} disabled={saving || !form.bienId}>
          {saving ? 'Enregistrement…' : (submitLabel ?? (locataire ? 'Enregistrer' : 'Créer'))}
        </button>
      </div>
    </>
  );
}
