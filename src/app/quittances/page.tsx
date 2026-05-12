'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Download, Mail, Eye, Trash2, Send, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import AppShell from '@/components/layout/AppShell';
import Modal from '@/components/Modal';
import EmailPreviewModal from '@/components/EmailPreviewModal';
import EmailBatchModal from '@/components/EmailBatchModal';
import PdfPreviewModal from '@/components/PdfPreviewModal';
import { useBailleurs } from '@/lib/bailleur-context';
import { formatMontant, formatDateFr, formatDateTimeFr, moisLabel, todayIso, MOIS_FR, genererCommentaire } from '@/lib/utils';

interface Locataire { id: string; nom: string; prenom: string; email: string | null }
interface Quittance {
  id: string; mois: number; annee: number; montantTotal: number; loyerNu: number; charges: number;
  datePaiement: string; dateEmission: string; pdfGenere: boolean; emailEnvoye: boolean;
  dateEmail: string | null;
  avoirAppliqueLoyer: number; avoirAppliqueCharges: number;
  montantPercu: number | null;
  surplusLoyer: number; surplusCharges: number;
  commentaire: string | null;
  locataire: { id: string; nom: string; prenom: string; email: string | null;
    bien: { id: string; nom: string; bailleur: { id: string; nom: string } } };
}

function QuittancesContent() {
  const { active } = useBailleurs();
  const [quittances, setQuittances] = useState<Quittance[]>([]);
  const [locataires, setLocataires] = useState<Locataire[]>([]);
  const now = new Date();
  const [filterMois, setFilterMois] = useState<number | ''>('');
  const [filterAnnee, setFilterAnnee] = useState<number | ''>(now.getFullYear());
  const [filterLoc, setFilterLoc] = useState<string>('');
  const [filterSent, setFilterSent] = useState<string>('');
  const [showCreate, setShowCreate] = useState(false);
  const [showGen, setShowGen] = useState(false);
  const [showSendAll, setShowSendAll] = useState(false);
  const [preview, setPreview] = useState<{ id: string; filename: string; title: string } | null>(null);
  const [emailingId, setEmailingId] = useState<{ id: string; fallback: string } | null>(null);
  const [editingQ, setEditingQ] = useState<Quittance | null>(null);

  const load = async () => {
    if (!active) return;
    const params = new URLSearchParams({ bailleurId: active.id });
    if (filterMois) params.set('mois', String(filterMois));
    if (filterAnnee) params.set('annee', String(filterAnnee));
    if (filterLoc) params.set('locataireId', filterLoc);
    if (filterSent) params.set('sent', filterSent);
    const [rq, rl] = await Promise.all([
      fetch('/api/quittances?' + params.toString()),
      fetch(`/api/locataires?bailleurId=${active.id}`),
    ]);
    setQuittances(await rq.json());
    setLocataires(await rl.json());
  };
  useEffect(() => { load(); }, [active, filterMois, filterAnnee, filterLoc, filterSent]);

  const onDownload = (id: string) => window.open(`/api/quittances/${id}/pdf`, '_blank');

  const onSendOne = async (q: Quittance) => {
    let to = q.locataire.email ?? '';
    if (!to) {
      const input = prompt('Aucun email enregistré pour ce locataire. Saisir un destinataire :');
      if (!input) return;
      to = input;
    } else {
      if (!confirm(`Envoyer la quittance à ${to} ?`)) return;
    }
    const r = await fetch(`/api/quittances/${q.id}/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    if (!r.ok) {
      const j = await r.json();
      toast.error(j.error || 'Échec', { duration: 8000 });
      return;
    }
    toast.success('Email envoyé');
    load();
  };

  const onPreviewSend = (q: Quittance) => {
    setEmailingId({ id: q.id, fallback: q.locataire.email ?? '' });
  };

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer cette quittance ?')) return;
    const r = await fetch(`/api/quittances/${id}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
    toast.success('Supprimé');
    load();
  };

  const annees = useMemo(() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
  }, []);

  if (!active) return <p className="text-muted-foreground">Sélectionnez un bailleur.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Quittances</h1>
          <p className="text-sm text-muted-foreground">{active.nom}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" onClick={() => setShowSendAll(true)}>
            <Send size={16} /> Envoyer le mois
          </button>
          <button className="btn-secondary" onClick={() => setShowGen(true)}>
            Générer le mois
          </button>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Quittance unitaire
          </button>
        </div>
      </div>

      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Mois</label>
            <select className="input" value={filterMois} onChange={e => setFilterMois(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Tous</option>
              {MOIS_FR.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Année</label>
            <select className="input" value={filterAnnee} onChange={e => setFilterAnnee(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Toutes</option>
              {annees.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Locataire</label>
            <select className="input" value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
              <option value="">Tous</option>
              {locataires.map(l => <option key={l.id} value={l.id}>{l.nom} {l.prenom}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Statut email</label>
            <select className="input" value={filterSent} onChange={e => setFilterSent(e.target.value)}>
              <option value="">Tous</option>
              <option value="1">Envoyées</option>
              <option value="0">Non envoyées</option>
            </select>
          </div>
        </div>
      </div>

      {/* Desktop ≥ md : table */}
      <div className="hidden md:block card p-0 overflow-hidden">
        <table className="table-base">
          <thead>
            <tr>
              <th>Locataire</th><th>Bien</th><th>Période</th>
              <th className="text-right">Montant</th>
              <th>Paiement</th><th>PDF</th><th>Envoyé le</th><th></th>
            </tr>
          </thead>
          <tbody>
            {quittances.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">Aucune quittance.</td></tr>}
            {quittances.map(q => (
              <tr key={q.id}>
                <td className="font-medium">{q.locataire.nom} {q.locataire.prenom}</td>
                <td>{q.locataire.bien.nom}</td>
                <td>{moisLabel(q.mois)} {q.annee}</td>
                <td className="text-right font-medium">{formatMontant(q.montantTotal)}</td>
                <td>{formatDateFr(q.datePaiement)}</td>
                <td>{q.pdfGenere ? <span className="badge-ok">Oui</span> : <span className="badge-off">Non</span>}</td>
                <td className="text-xs">
                  {q.emailEnvoye
                    ? <span title={formatDateTimeFr(q.dateEmail)}>
                        <span className="badge-ok">{formatDateTimeFr(q.dateEmail)}</span>
                      </span>
                    : <span className="badge-off">Non</span>}
                </td>
                <td className="text-right whitespace-nowrap">
                  <button title="Aperçu PDF" aria-label="Aperçu PDF" className="btn-ghost" onClick={() => setPreview({
                    id: q.id,
                    filename: `Quittance_${moisLabel(q.mois)}_${q.annee}.pdf`,
                    title: `Quittance ${moisLabel(q.mois)} ${q.annee}`,
                  })}><Eye size={14} /></button>
                  <button title="Télécharger" aria-label="Télécharger PDF" className="btn-ghost" onClick={() => onDownload(q.id)}><Download size={14} /></button>
                  <button title="Modifier" aria-label="Modifier la quittance" className="btn-ghost" onClick={() => setEditingQ(q)}><Pencil size={14} /></button>
                  <button title="Aperçu email avant envoi" aria-label="Aperçu email" className="btn-ghost" onClick={() => onPreviewSend(q)}><Send size={14} /></button>
                  <button title="Envoyer directement" aria-label="Envoyer email" className="btn-ghost" onClick={() => onSendOne(q)}><Mail size={14} /></button>
                  <button title="Supprimer" aria-label="Supprimer la quittance" className="btn-ghost text-destructive" onClick={() => onDelete(q.id)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* v3.6.2 mobile < md : cards */}
      <ul className="md:hidden space-y-3">
        {quittances.length === 0 && (
          <li className="card text-center text-muted-foreground text-sm">Aucune quittance.</li>
        )}
        {quittances.map(q => (
          <li key={q.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{q.locataire.nom} {q.locataire.prenom}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{q.locataire.bien.nom}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{moisLabel(q.mois)} {q.annee}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold">{formatMontant(q.montantTotal)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">payé {formatDateFr(q.datePaiement)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {q.pdfGenere ? <span className="badge-ok">PDF</span> : <span className="badge-off">Pas de PDF</span>}
              {q.emailEnvoye
                ? <span className="badge-ok">Envoyé {formatDateTimeFr(q.dateEmail)}</span>
                : <span className="badge-off">Email non envoyé</span>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button className="btn-secondary text-xs" title="Aperçu PDF" onClick={() => setPreview({
                id: q.id,
                filename: `Quittance_${moisLabel(q.mois)}_${q.annee}.pdf`,
                title: `Quittance ${moisLabel(q.mois)} ${q.annee}`,
              })}><Eye size={14} /> Aperçu</button>
              <button className="btn-secondary text-xs" title="Télécharger" onClick={() => onDownload(q.id)}><Download size={14} /> PDF</button>
              <button className="btn-secondary text-xs" title="Modifier" onClick={() => setEditingQ(q)}><Pencil size={14} /> Édit.</button>
              <button className="btn-secondary text-xs" title="Aperçu email avant envoi" onClick={() => onPreviewSend(q)}><Send size={14} /> Email</button>
              <button className="btn-secondary text-xs" title="Envoyer directement" onClick={() => onSendOne(q)}><Mail size={14} /> Envoyer</button>
              <button className="btn-secondary text-xs text-destructive" title="Supprimer" onClick={() => onDelete(q.id)}><Trash2 size={14} /> Suppr.</button>
            </div>
          </li>
        ))}
      </ul>

      {showCreate && <CreerQuittanceModal locataires={locataires} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      {showGen && <GenererMoisModal bailleurId={active.id} onClose={() => setShowGen(false)} onDone={() => { setShowGen(false); load(); }} />}
      {showSendAll && <EmailBatchModal bailleurId={active.id} onClose={() => setShowSendAll(false)} onDone={() => { setShowSendAll(false); load(); }} />}
      {/* v3.6.2 — bascule PdfPreviewModal (au lieu de Modal+iframe brut)
          pour bénéficier du bypass mobile (download programmatique
          sur Chrome Android / Safari iOS). */}
      {preview && (
        <PdfPreviewModal
          url={`/api/quittances/${preview.id}/pdf?inline=1`}
          filename={preview.filename}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}
      {emailingId && (
        <EmailPreviewModal
          quittanceId={emailingId.id}
          fallbackEmail={emailingId.fallback}
          onClose={() => setEmailingId(null)}
          onSent={() => { setEmailingId(null); load(); }}
        />
      )}
      {editingQ && (
        <EditQuittanceModal
          quittance={editingQ}
          onClose={() => setEditingQ(null)}
          onSaved={() => { setEditingQ(null); load(); }}
        />
      )}
    </div>
  );
}

function EditQuittanceModal({ quittance, onClose, onSaved }: { quittance: Quittance; onClose: () => void; onSaved: () => void }) {
  const isoDate = (s: string) => new Date(s).toISOString().slice(0, 10);
  const [form, setForm] = useState({
    loyerNu: quittance.loyerNu,
    charges: quittance.charges,
    datePaiement: isoDate(quittance.datePaiement),
    dateEmission: isoDate(quittance.dateEmission),
    avoirAppliqueLoyer: quittance.avoirAppliqueLoyer ?? 0,
    avoirAppliqueCharges: quittance.avoirAppliqueCharges ?? 0,
    montantPercu: quittance.montantPercu == null ? '' : String(quittance.montantPercu),
    surplusLoyer: quittance.surplusLoyer ?? 0,
    surplusCharges: quittance.surplusCharges ?? 0,
    commentaire: quittance.commentaire ?? '',
  });
  const [commentaireDirty, setCommentaireDirty] = useState(!!quittance.commentaire);
  const [saving, setSaving] = useState(false);

  const total = +((form.loyerNu - form.avoirAppliqueLoyer) + (form.charges - form.avoirAppliqueCharges)).toFixed(2);
  const percuNum = form.montantPercu ? Number(form.montantPercu) : null;
  const tropPercu = percuNum != null && percuNum > total ? +(percuNum - total).toFixed(2) : 0;

  useEffect(() => {
    if (commentaireDirty) return;
    setForm(f => ({ ...f, commentaire: genererCommentaire({
      avoirAppliqueLoyer: f.avoirAppliqueLoyer,
      avoirAppliqueCharges: f.avoirAppliqueCharges,
      surplusLoyer: f.surplusLoyer,
      surplusCharges: f.surplusCharges,
      montantPercu: percuNum,
      montantTotal: total,
      loyerNu: f.loyerNu,
      charges: f.charges,
      moisActuel: quittance.mois,
      anneeActuelle: quittance.annee,
    })}));
  }, [form.avoirAppliqueLoyer, form.avoirAppliqueCharges, form.surplusLoyer, form.surplusCharges, form.loyerNu, form.charges, percuNum, total, commentaireDirty, quittance.mois, quittance.annee]);

  const regenererCommentaire = () => {
    setForm(f => ({ ...f, commentaire: genererCommentaire({
      avoirAppliqueLoyer: f.avoirAppliqueLoyer,
      avoirAppliqueCharges: f.avoirAppliqueCharges,
      surplusLoyer: f.surplusLoyer,
      surplusCharges: f.surplusCharges,
      montantPercu: percuNum,
      montantTotal: total,
      loyerNu: f.loyerNu,
      charges: f.charges,
      moisActuel: quittance.mois,
      anneeActuelle: quittance.annee,
    })}));
    setCommentaireDirty(false);
  };

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch(`/api/quittances/${quittance.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loyerNu: form.loyerNu, charges: form.charges,
          datePaiement: form.datePaiement, dateEmission: form.dateEmission,
          avoirAppliqueLoyer: form.avoirAppliqueLoyer,
          avoirAppliqueCharges: form.avoirAppliqueCharges,
          montantPercu: percuNum,
          surplusLoyer: form.surplusLoyer, surplusCharges: form.surplusCharges,
          commentaire: form.commentaire || null,
        }),
      });
      if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
      toast.success('Quittance modifiée. Le PDF sera régénéré au prochain téléchargement.');
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Modifier la quittance — ${moisLabel(quittance.mois)} ${quittance.annee}`} maxWidth="max-w-2xl">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Locataire : <strong>{quittance.locataire.nom} {quittance.locataire.prenom}</strong>
          {quittance.emailEnvoye && <span className="ml-2 badge-warn">Déjà envoyée par email — modifier nécessitera de la renvoyer</span>}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Loyer nu (€)</label>
            <input type="number" step="0.01" className="input" value={form.loyerNu} onChange={e => setForm(f => ({ ...f, loyerNu: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Charges (€)</label>
            <input type="number" step="0.01" className="input" value={form.charges} onChange={e => setForm(f => ({ ...f, charges: Number(e.target.value) }))} />
          </div>
          <div>
            <label className="label">Date de paiement</label>
            <input type="date" className="input" value={form.datePaiement} onChange={e => setForm(f => ({ ...f, datePaiement: e.target.value }))} />
          </div>
          <div>
            <label className="label">Date d'émission</label>
            <input type="date" className="input" value={form.dateEmission} onChange={e => setForm(f => ({ ...f, dateEmission: e.target.value }))} />
          </div>
        </div>

        <details className="border border-border rounded-md p-3" open={form.avoirAppliqueLoyer > 0 || form.avoirAppliqueCharges > 0 || form.surplusLoyer > 0 || form.surplusCharges > 0 || !!form.commentaire}>
          <summary className="text-sm font-medium cursor-pointer">Régularisation</summary>
          <div className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Avoir reporté sur loyer (€)</label>
                <input type="number" step="0.01" className="input" value={form.avoirAppliqueLoyer} onChange={e => setForm(f => ({ ...f, avoirAppliqueLoyer: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Avoir reporté sur charges (€)</label>
                <input type="number" step="0.01" className="input" value={form.avoirAppliqueCharges} onChange={e => setForm(f => ({ ...f, avoirAppliqueCharges: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <label className="label">Somme perçue (€)</label>
              <input type="number" step="0.01" className="input" value={form.montantPercu} onChange={e => setForm(f => ({ ...f, montantPercu: e.target.value }))} placeholder={String(total)} />
            </div>
            {tropPercu > 0 && (
              <p className="text-xs text-amber-700">Trop-perçu détecté : {formatMontant(tropPercu)} — à répartir ci-dessous</p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Surplus loyer (à reporter)</label>
                <input type="number" step="0.01" className="input" value={form.surplusLoyer} onChange={e => setForm(f => ({ ...f, surplusLoyer: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Surplus charges (à reporter)</label>
                <input type="number" step="0.01" className="input" value={form.surplusCharges} onChange={e => setForm(f => ({ ...f, surplusCharges: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">Commentaire</label>
                {(form.avoirAppliqueLoyer > 0 || form.avoirAppliqueCharges > 0 || form.surplusLoyer > 0 || form.surplusCharges > 0) && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={regenererCommentaire}
                    title="Régénérer à partir des chiffres saisis"
                  >
                    {commentaireDirty ? 'Régénérer auto' : 'Auto ✓'}
                  </button>
                )}
              </div>
              <textarea
                className="input min-h-[80px]"
                value={form.commentaire}
                onChange={e => { setForm(f => ({ ...f, commentaire: e.target.value })); setCommentaireDirty(true); }}
              />
            </div>
          </div>
        </details>

        <div className="card p-3 flex justify-between items-center bg-muted/40">
          <span className="text-sm">Total dû :</span>
          <span className="font-semibold text-lg">{formatMontant(total)}</span>
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

interface FullLocataire {
  id: string; nom: string; prenom: string; email: string | null;
  loyerNu: number; charges: number;
}

function CreerQuittanceModal({ locataires, onClose, onSaved }: { locataires: Locataire[]; onClose: () => void; onSaved: () => void }) {
  const { active } = useBailleurs();
  const now = new Date();
  const [locataireId, setLocataireId] = useState(locataires[0]?.id ?? '');
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [datePaiement, setDatePaiement] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const [dateEmission, setDateEmission] = useState(todayIso());

  const [locataireData, setLocataireData] = useState<FullLocataire | null>(null);
  const [solde, setSolde] = useState<{ soldeLoyer: number; soldeCharges: number; total: number } | null>(null);

  const [avoirAppliqueLoyer, setAvoirAppliqueLoyer] = useState(0);
  const [avoirAppliqueCharges, setAvoirAppliqueCharges] = useState(0);
  const [montantPercu, setMontantPercu] = useState<string>('');
  const [surplusLoyer, setSurplusLoyer] = useState(0);
  const [surplusCharges, setSurplusCharges] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [commentaireDirty, setCommentaireDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Charger les infos du locataire + solde d'avoir disponible.
  // bailleurId requis pour /api/locataires (scope multi-bailleur, cf.
  // docs/MULTI-BAILLEUR.md). Si pas de bailleur actif, skip.
  useEffect(() => {
    if (!locataireId) { setLocataireData(null); setSolde(null); return; }
    if (!active?.id) return;
    Promise.all([
      fetch(`/api/locataires?bailleurId=${active.id}`).then(r => r.json()),
      fetch(`/api/locataires/${locataireId}/avoir`).then(r => r.json()),
    ]).then(([list, soldeData]) => {
      const found = (list as FullLocataire[]).find(l => l.id === locataireId);
      if (found) setLocataireData(found);
      setSolde(soldeData);
      // Pré-remplir l'avoir avec le solde disponible
      setAvoirAppliqueLoyer(Math.max(0, soldeData.soldeLoyer || 0));
      setAvoirAppliqueCharges(Math.max(0, soldeData.soldeCharges || 0));
    });
  }, [locataireId, active?.id]);

  const total = useMemo(() => {
    if (!locataireData) return 0;
    return +((locataireData.loyerNu - avoirAppliqueLoyer) + (locataireData.charges - avoirAppliqueCharges)).toFixed(2);
  }, [locataireData, avoirAppliqueLoyer, avoirAppliqueCharges]);

  const percuNum = montantPercu ? Number(montantPercu) : null;
  const tropPercu = percuNum != null && percuNum > total ? +(percuNum - total).toFixed(2) : 0;

  // Auto-suggest répartition surplus sur charges en priorité
  useEffect(() => {
    if (tropPercu > 0) {
      setSurplusCharges(tropPercu);
      setSurplusLoyer(0);
    } else {
      setSurplusLoyer(0);
      setSurplusCharges(0);
    }
  }, [tropPercu]);

  // Auto-générer le commentaire selon les chiffres tant que l'user n'a pas tapé
  useEffect(() => {
    if (commentaireDirty) return;
    setCommentaire(genererCommentaire({
      avoirAppliqueLoyer, avoirAppliqueCharges,
      surplusLoyer, surplusCharges,
      montantPercu: percuNum,
      montantTotal: total,
      loyerNu: locataireData?.loyerNu, charges: locataireData?.charges,
      moisActuel: mois, anneeActuelle: annee,
    }));
  }, [avoirAppliqueLoyer, avoirAppliqueCharges, surplusLoyer, surplusCharges, percuNum, total, mois, annee, commentaireDirty, locataireData]);

  const regenererCommentaire = () => {
    setCommentaire(genererCommentaire({
      avoirAppliqueLoyer, avoirAppliqueCharges,
      surplusLoyer, surplusCharges,
      montantPercu: percuNum,
      montantTotal: total,
      loyerNu: locataireData?.loyerNu, charges: locataireData?.charges,
      moisActuel: mois, anneeActuelle: annee,
    }));
    setCommentaireDirty(false);
  };

  const submit = async () => {
    setSaving(true);
    try {
      // lint-fetches: skip — POST body contient locataireId, serveur valide via composite memberships
      const r = await fetch('/api/quittances', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locataireId, mois, annee, datePaiement, dateEmission,
          avoirAppliqueLoyer, avoirAppliqueCharges,
          montantPercu: percuNum,
          surplusLoyer, surplusCharges,
          commentaire: commentaire || null,
        }),
      });
      if (!r.ok) { const j = await r.json(); toast.error(j.error); return; }
      toast.success('Quittance créée');
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Nouvelle quittance" maxWidth="max-w-2xl">
      <div className="space-y-3">
        <div>
          <label className="label">Locataire</label>
          <select className="input" value={locataireId} onChange={e => setLocataireId(e.target.value)}>
            {locataires.map(l => <option key={l.id} value={l.id}>{l.nom} {l.prenom}</option>)}
          </select>
        </div>

        {solde && solde.total > 0 && (
          <div className="card p-3 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300/40">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              Avoir disponible pour ce locataire : {formatMontant(solde.total)}
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Loyer : {formatMontant(solde.soldeLoyer)} · Charges : {formatMontant(solde.soldeCharges)} (préremplis ci-dessous, modifiables)
            </p>
          </div>
        )}

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
          <div>
            <label className="label">Date de paiement</label>
            <input type="date" className="input" value={datePaiement} onChange={e => setDatePaiement(e.target.value)} />
          </div>
          <div>
            <label className="label">Date d'émission</label>
            <input type="date" className="input" value={dateEmission} onChange={e => setDateEmission(e.target.value)} />
          </div>
        </div>

        {locataireData && (
          <div className="card p-3 bg-muted/30 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Loyer nu</span><span className="font-medium">{formatMontant(locataireData.loyerNu)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Charges</span><span className="font-medium">{formatMontant(locataireData.charges)}</span></div>
            {avoirAppliqueLoyer > 0 && <div className="flex justify-between text-emerald-700"><span>Avoir loyer</span><span>−{formatMontant(avoirAppliqueLoyer)}</span></div>}
            {avoirAppliqueCharges > 0 && <div className="flex justify-between text-emerald-700"><span>Avoir charges</span><span>−{formatMontant(avoirAppliqueCharges)}</span></div>}
            <div className="flex justify-between border-t pt-2"><span className="font-medium">Total dû</span><span className="font-semibold">{formatMontant(total)}</span></div>
          </div>
        )}

        <details className="border border-border rounded-md p-3">
          <summary className="text-sm font-medium cursor-pointer">Régularisation (avoir, trop-perçu, commentaire)</summary>
          <div className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Avoir reporté sur loyer (€)</label>
                <input type="number" step="0.01" className="input" value={avoirAppliqueLoyer} onChange={e => setAvoirAppliqueLoyer(Number(e.target.value))} />
              </div>
              <div>
                <label className="label">Avoir reporté sur charges (€)</label>
                <input type="number" step="0.01" className="input" value={avoirAppliqueCharges} onChange={e => setAvoirAppliqueCharges(Number(e.target.value))} />
              </div>
            </div>
            <div>
              <label className="label">Somme effectivement perçue (€) — laisser vide si conforme au total</label>
              <input type="number" step="0.01" className="input" value={montantPercu} onChange={e => setMontantPercu(e.target.value)} placeholder={String(total)} />
            </div>
            {tropPercu > 0 && (
              <div className="card p-3 bg-amber-50 dark:bg-amber-900/20">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                  Trop-perçu de {formatMontant(tropPercu)} — à reporter au mois suivant
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">Répartition (par défaut sur charges) :</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Sur loyer</label>
                    <input type="number" step="0.01" className="input" value={surplusLoyer} onChange={e => setSurplusLoyer(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="label">Sur charges</label>
                    <input type="number" step="0.01" className="input" value={surplusCharges} onChange={e => setSurplusCharges(Number(e.target.value))} />
                  </div>
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label !mb-0">Commentaire (apparaît sur la quittance + dans le mail)</label>
                {(avoirAppliqueLoyer > 0 || avoirAppliqueCharges > 0 || surplusLoyer > 0 || surplusCharges > 0) && (
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={regenererCommentaire}
                    title="Régénérer à partir des chiffres saisis"
                  >
                    {commentaireDirty ? 'Régénérer auto' : 'Auto ✓'}
                  </button>
                )}
              </div>
              <textarea
                className="input min-h-[80px]"
                value={commentaire}
                onChange={e => { setCommentaire(e.target.value); setCommentaireDirty(true); }}
                placeholder="Sera généré automatiquement si vous saisissez un avoir ou un trop-perçu"
              />
            </div>
          </div>
        </details>

        <div className="flex justify-end gap-2 pt-3">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={submit} disabled={saving || !locataireId}>{saving ? 'Création…' : 'Créer'}</button>
        </div>
      </div>
    </Modal>
  );
}

function GenererMoisModal({ bailleurId, onClose, onDone }: { bailleurId: string; onClose: () => void; onDone: () => void }) {
  const now = new Date();
  const [mois, setMois] = useState(now.getMonth() + 1);
  const [annee, setAnnee] = useState(now.getFullYear());
  const [datePaiement, setDatePaiement] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const [dateEmission, setDateEmission] = useState(todayIso());
  const [running, setRunning] = useState(false);

  const submit = async () => {
    setRunning(true);
    try {
      const r = await fetch('/api/quittances/generer-mois', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bailleurId, mois, annee, datePaiement, dateEmission }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);

      if (j.total === 0) {
        toast.warning('Aucun locataire actif sur ce bailleur', {
          description: 'Créez ou activez des locataires avant de générer.',
        });
      } else if (j.created === 0 && j.skipped.length > 0) {
        toast.info(`${j.skipped.length} quittance(s) déjà existante(s) — rien à créer`);
      } else {
        toast.success(`${j.created} quittance(s) créée(s)`, {
          description: j.skipped.length ? `${j.skipped.length} ignorée(s) (déjà existantes)` : undefined,
        });
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally { setRunning(false); }
  };

  return (
    <Modal open onClose={onClose} title="Générer toutes les quittances du mois">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Une quittance sera créée pour chaque locataire actif (sauf doublons).</p>
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
        <div>
          <label className="label">Date de paiement</label>
          <input type="date" className="input" value={datePaiement} onChange={e => setDatePaiement(e.target.value)} />
        </div>
        <div>
          <label className="label">Date d'émission</label>
          <input type="date" className="input" value={dateEmission} onChange={e => setDateEmission(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <button className="btn-secondary" onClick={onClose} disabled={running}>Annuler</button>
          <button className="btn-primary" onClick={submit} disabled={running}>{running ? 'Génération…' : 'Générer'}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function QuittancesPage() {
  return <AppShell><QuittancesContent /></AppShell>;
}
