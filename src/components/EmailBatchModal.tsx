'use client';

import { useEffect, useState } from 'react';
import { Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import Modal from './Modal';
import { MOIS_FR, moisLabel } from '@/lib/utils';

interface Item { id: string; nomComplet: string; email: string; hasEmail: boolean }

interface Props {
  bailleurId: string;
  onClose: () => void;
  onDone: () => void;
}

export default function EmailBatchModal({ bailleurId, onClose, onDone }: Props) {
  const now = new Date();
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [items, setItems] = useState<Item[] | null>(null);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<'config' | 'preview'>('config');

  const loadPreview = async () => {
    setRunning(true);
    try {
      const r = await fetch('/api/quittances/preview-mois', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bailleurId, mois, annee }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Erreur'); return; }
      setItems(j.items);
      setStep('preview');
    } finally { setRunning(false); }
  };

  const send = async () => {
    if (!confirm(`Envoyer ${(items?.filter(i => i.hasEmail).length ?? 0)} quittance(s) ?`)) return;
    setRunning(true);
    try {
      const r = await fetch('/api/quittances/envoyer-mois', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bailleurId, mois, annee }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      if (j.errors?.length) {
        const firstErr = j.errors[0];
        toast.warning(`${j.sent} envoyé(s), ${j.errors.length} erreur(s)`, {
          description: `Premier échec : ${firstErr.locataire} — ${firstErr.error}`,
          duration: 10000,
        });
      } else if (j.sent === 0) {
        toast.info('Aucune quittance à envoyer');
      } else {
        toast.success(`${j.sent} quittance(s) envoyée(s)`);
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally { setRunning(false); }
  };

  if (step === 'config') {
    return (
      <Modal open onClose={onClose} title="Envoyer les quittances du mois">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Seules les quittances non encore envoyées seront expédiées.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mois</label>
              <select className="input" value={mois} onChange={e => setMois(Number(e.target.value))}>
                {MOIS_FR.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Année</label>
              <input type="number" className="input" value={annee} onChange={e => setAnnee(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button className="btn-secondary" onClick={onClose} disabled={running}>Annuler</button>
            <button className="btn-primary" onClick={loadPreview} disabled={running}>
              {running ? 'Chargement…' : 'Voir l\'aperçu →'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const okList = items?.filter(i => i.hasEmail) ?? [];
  const koList = items?.filter(i => !i.hasEmail) ?? [];

  return (
    <Modal open onClose={onClose} title={`Envoi pour ${moisLabel(mois)} ${annee}`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3">
            <p className="text-xs text-muted-foreground">À envoyer</p>
            <p className="text-2xl font-semibold text-emerald-600">{okList.length}</p>
          </div>
          <div className="card p-3">
            <p className="text-xs text-muted-foreground">Bloqué (sans email)</p>
            <p className="text-2xl font-semibold text-amber-600">{koList.length}</p>
          </div>
        </div>

        {okList.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1"><CheckCircle2 size={14} className="text-emerald-600" /> Seront envoyés :</p>
            <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
              {okList.map(i => (
                <li key={i.id} className="flex justify-between border-b border-border/40 py-1">
                  <span>{i.nomComplet}</span>
                  <span className="text-muted-foreground text-xs">{i.email}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {koList.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1"><AlertTriangle size={14} className="text-amber-600" /> Ignorés (email manquant) :</p>
            <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
              {koList.map(i => (
                <li key={i.id} className="text-muted-foreground border-b border-border/40 py-1">{i.nomComplet}</li>
              ))}
            </ul>
          </div>
        )}

        {okList.length === 0 && (
          <p className="text-center text-muted-foreground py-4">Rien à envoyer pour ce mois.</p>
        )}

        <div className="flex justify-between pt-3 border-t border-border">
          <button className="btn-secondary" onClick={() => setStep('config')} disabled={running}>← Retour</button>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={running}>Annuler</button>
            <button className="btn-primary" onClick={send} disabled={running || okList.length === 0}>
              <Send size={14} /> {running ? 'Envoi…' : `Envoyer (${okList.length})`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
