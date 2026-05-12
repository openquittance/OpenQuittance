'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TrendingUp, Plus, AlertCircle, FileSignature, History, Mail, Eye, Paperclip, Check, Cloud, RefreshCw, ChevronDown, Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Modal from '@/components/Modal';
import PdfPreviewModal from '@/components/PdfPreviewModal';
import AppShell from '@/components/layout/AppShell';
import { formatDateFr, formatDateTimeFr } from '@/lib/utils';
import { useBailleurs } from '@/lib/bailleur-context';

interface Indice {
  id: string;
  periode: number;
  annee: number;
  trimestre: number;
  valeur: number;
  variation: number | null;
  source: string;
  createdAt: string;
}

interface Eligible {
  locataireId: string;
  nom: string;
  prenom: string;
  prochaineDate: string;
  ancienLoyer: number;
  nouveauLoyer: number;
  variation: number;
  irlReference: number;
  irlNouveau: number;
  trimestre: number;
}

interface Revision {
  id: string;
  locataireId: string;
  dateEffet: string;
  ancienLoyer: number;
  nouveauLoyer: number;
  irlReference: number;
  irlNouveau: number;
  trimestre: number;
  statut: string;
  courrierArchiveId: string | null;
  recommandeEnvoyeLe: string | null;
  recommandeNumero: string | null;
  preuveDepotArchiveId: string | null;
}

interface RevisionAvecLocataire extends Revision {
  locataireNom: string;
  locatairePrenom: string;
}

export default function IRLPage() {
  return <AppShell><IRLContent /></AppShell>;
}

function IRLContent() {
  const { active } = useBailleurs();
  const [indices, setIndices] = useState<Indice[]>([]);
  const [eligibles, setEligibles] = useState<Eligible[]>([]);
  const [revisions, setRevisions] = useState<RevisionAvecLocataire[]>([]);
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [trimestre, setTrimestre] = useState(1);
  const [valeur, setValeur] = useState('');
  const [variation, setVariation] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    // Le bailleur actif est requis pour scoper /api/locataires côté serveur
    // (cf. docs/MULTI-BAILLEUR.md). Sans active.id, on évite les 400 silent.
    if (!active?.id) return;
    const [r1, r2, locs] = await Promise.all([
      fetch('/api/irl/indices').then(r => r.json()),
      fetch('/api/irl/eligibles').then(r => r.json()),
      fetch(`/api/locataires?bailleurId=${active.id}`).then(r => r.json()),
    ]);
    setIndices(r1.indices || []);
    setEligibles(r2.eligibles || []);

    // Charge les révisions de chaque locataire indexé pour l'historique global
    const allLocs: Array<{ id: string; nom: string; prenom: string; irlTrimestre: number | null }> =
      Array.isArray(locs) ? locs : [];
    const indexedLocs = allLocs.filter(l => l.irlTrimestre != null);
    const revs = await Promise.all(
      indexedLocs.map(async l => {
        const r = await fetch(`/api/irl/revisions?locataireId=${l.id}`).then(r => r.json());
        return ((r.revisions || []) as Revision[]).map(rev => ({
          ...rev,
          locataireNom: l.nom,
          locatairePrenom: l.prenom,
        }));
      }),
    );
    setRevisions(
      revs.flat().sort((a, b) => new Date(b.dateEffet).getTime() - new Date(a.dateEffet).getTime()),
    );
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [active?.id]);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/irl/indices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annee, trimestre,
          valeur: parseFloat(valeur),
          variation: variation ? parseFloat(variation) : null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast.success(`IRL ${annee}T${trimestre} = ${valeur} enregistré`);
      setValeur(''); setVariation('');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const appliquer = async (e: Eligible) => {
    if (!confirm(
      `Appliquer la révision pour ${e.prenom} ${e.nom} ?\n\n` +
      `Loyer : ${e.ancienLoyer} € → ${e.nouveauLoyer} € (${e.variation >= 0 ? '+' : ''}${e.variation.toFixed(2)}%)\n` +
      `Le loyer du locataire sera mis à jour.`,
    )) return;
    const dateEffet = e.prochaineDate.slice(0, 10);
    const r = await fetch('/api/irl/revisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locataireId: e.locataireId,
        irlNouveau: e.irlNouveau,
        trimestre: e.trimestre,
        dateEffet,
        apply: true,
      }),
    });
    if (r.ok) {
      toast.success('Révision appliquée');
      await load();
    } else {
      const j = await r.json();
      toast.error(j.error || 'Erreur');
    }
  };

  return (
    <>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <TrendingUp size={22} /> Indexation IRL
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Indice de Référence des Loyers (INSEE). Saisissez les valeurs trimestrielles publiées sur{' '}
            <a href="https://www.insee.fr/fr/statistiques/serie/001763852" target="_blank" rel="noreferrer"
               className="text-primary hover:underline">insee.fr</a>.
          </p>
        </div>

        {/* Synchronisation INSEE (admin only) */}
        <InseeSection onSynced={load} />

        {/* Saisie d'un indice */}
        <div className="card space-y-3">
          <h2 className="font-medium">Ajouter / mettre à jour un indice</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Année</label>
              <input type="number" className="input" value={annee}
                onChange={e => setAnnee(parseInt(e.target.value, 10))} />
            </div>
            <div>
              <label className="label">Trimestre</label>
              <select className="input" value={trimestre}
                onChange={e => setTrimestre(parseInt(e.target.value, 10))}>
                {[1, 2, 3, 4].map(t => <option key={t} value={t}>T{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Valeur IRL</label>
              <input type="number" step="0.01" className="input"
                placeholder="ex: 145.47" value={valeur} onChange={e => setValeur(e.target.value)} />
            </div>
            <div>
              <label className="label">Variation % (info)</label>
              <input type="number" step="0.01" className="input"
                placeholder="optionnel" value={variation} onChange={e => setVariation(e.target.value)} />
            </div>
          </div>
          <button className="btn-primary" disabled={saving || !valeur} onClick={submit}>
            <Plus size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>

        {/* Révisions éligibles */}
        {eligibles.length > 0 && (
          <div className="card space-y-3 border-amber-300">
            <div className="flex items-center gap-2">
              <AlertCircle size={18} className="text-amber-600" />
              <h2 className="font-medium">Révisions disponibles ({eligibles.length})</h2>
            </div>
            <ul className="divide-y divide-border">
              {eligibles.map(e => (
                <li key={e.locataireId} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{e.prenom} {e.nom}</p>
                    <p className="text-xs text-muted-foreground">
                      Prochaine révision : {new Date(e.prochaineDate).toLocaleDateString('fr-FR')} ·
                      IRL T{e.trimestre} : {e.irlReference} → {e.irlNouveau}
                    </p>
                    <p className="text-sm">
                      <strong>{e.ancienLoyer.toFixed(2)} €</strong> → <strong>{e.nouveauLoyer.toFixed(2)} €</strong>
                      {' '}<span className={e.variation >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                        ({e.variation >= 0 ? '+' : ''}{e.variation.toFixed(2)}%)
                      </span>
                    </p>
                  </div>
                  <button className="btn-primary" onClick={() => appliquer(e)}>
                    Appliquer
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Historique des révisions appliquées */}
        {revisions.length > 0 && (
          <div className="card space-y-3">
            <div className="flex items-center gap-2">
              <History size={18} className="text-muted-foreground" />
              <h2 className="font-medium">Historique des révisions</h2>
            </div>
            <ul className="divide-y divide-border">
              {revisions.map(r => (
                <RevisionRow key={r.id} revision={r} onUpdate={load} />
              ))}
            </ul>
          </div>
        )}

        {/* Liste des indices saisis */}
        <div className="card">
          <h2 className="font-medium mb-3">Indices enregistrés</h2>
          {indices.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              Aucun indice. Saisissez au moins un IRL pour pouvoir réviser les loyers.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b border-border">
                <tr><th className="pb-2">Période</th><th className="pb-2">Valeur</th>
                  <th className="pb-2">Variation</th><th className="pb-2">Source</th>
                  <th className="pb-2">Saisi le</th></tr>
              </thead>
              <tbody>
                {indices.map(i => (
                  <tr key={i.id} className="border-b border-border/50">
                    <td className="py-2 font-mono">{i.annee}T{i.trimestre}</td>
                    <td className="py-2">{i.valeur.toFixed(2)}</td>
                    <td className="py-2">{i.variation != null ? `${i.variation.toFixed(2)}%` : '—'}</td>
                    <td className="py-2"><span className="badge-off">{i.source}</span></td>
                    <td className="py-2 text-xs text-muted-foreground">{formatDateTimeFr(i.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Section INSEE ───────────────────────────────────────────────────────────
function InseeSection({ onSynced }: { onSynced: () => void }) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [config, setConfig] = useState<{
    configured: boolean; hasSecret: boolean; inseeLastSyncAt: string | null;
  } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    if (!isAdmin) return;
    const r = await fetch('/api/admin/insee');
    if (r.ok) setConfig(await r.json());
  };

  // Auto-sync silencieuse : si la dernière sync date de plus de 7 jours
  // (ou n'a jamais été faite), on déclenche une sync en arrière-plan dès
  // qu'un admin ouvre cette page. Toast informatif si nouveaux indices.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
      const r = await fetch('/api/admin/insee').then(x => x.json()).catch(() => null);
      if (!r) return;
      const lastSync = r.inseeLastSyncAt ? new Date(r.inseeLastSyncAt).getTime() : 0;
      const sevenDaysMs = 7 * 24 * 3600 * 1000;
      if (Date.now() - lastSync > sevenDaysMs) {
        try {
          const res = await fetch('/api/irl/insee/sync', { method: 'POST' });
          const j = await res.json();
          if (cancelled) return;
          if (res.ok && (j.inserted > 0 || j.updated > 0)) {
            toast.success(
              `IRL synchronisé automatiquement : ${j.inserted} nouveau(x), ${j.updated} mis à jour`,
              { duration: 6000 },
            );
            await load();
          }
        } catch { /* silent */ }
      }
    })();
    return () => { cancelled = true; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [isAdmin]);

  if (!isAdmin) return null;

  const test = async () => {
    setTesting(true);
    try {
      const r = await fetch('/api/irl/insee/test', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || 'Erreur INSEE', { duration: 8000 });
        return;
      }
      toast.success(
        `Connexion OK — ${j.totalObservations} observations dispo, dernière : T${j.latest.trimestre} ${j.latest.annee} = ${j.latest.valeur}`,
        { duration: 8000 },
      );
    } finally { setTesting(false); }
  };

  const sync = async () => {
    if (!confirm('Synchroniser tous les indices IRL depuis l\'INSEE ?\n\nLes valeurs déjà saisies manuellement seront remplacées par les valeurs officielles.')) return;
    setSyncing(true);
    try {
      const r = await fetch('/api/irl/insee/sync', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || 'Erreur sync', { duration: 8000 });
        return;
      }
      toast.success(
        `Sync OK — ${j.inserted} nouveau(x), ${j.updated} mis à jour sur ${j.totalObservations} total`,
        { duration: 8000 },
      );
      await load();
      onSynced();
    } finally { setSyncing(false); }
  };

  const remove = async () => {
    if (!confirm('Supprimer la configuration INSEE ?')) return;
    const r = await fetch('/api/admin/insee', { method: 'DELETE' });
    if (r.ok) { toast.success('Configuration supprimée'); await load(); }
    else toast.error('Erreur suppression');
  };

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud size={18} className="text-primary" />
          <h2 className="font-medium">Synchronisation automatique INSEE</h2>
          <span className="badge-ok">prêt à l'emploi</span>
        </div>
        <button className="text-xs text-muted-foreground hover:underline flex items-center gap-1"
          onClick={() => setShowHelp(true)}>
          <ChevronDown size={12} /> En savoir plus
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        L'API BDM de l'INSEE (« Séries Chronologiques ») est en accès libre,
        aucune clé n'est requise. La synchro se déclenche automatiquement
        lorsque vous ouvrez cette page si la dernière a plus de 7 jours,
        ou manuellement avec le bouton ci-dessous.
        {config?.inseeLastSyncAt && (
          <> Dernière sync : <strong>{formatDateTimeFr(config.inseeLastSyncAt)}</strong>.</>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        Seules les 5 dernières années sont stockées localement (≈ 20 trimestres),
        suffisant pour les révisions de baux en cours.
      </p>

      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={test} disabled={testing}>
          {testing ? 'Test…' : 'Tester la connexion'}
        </button>
        <button className="btn-primary" onClick={sync} disabled={syncing}>
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
        </button>
        <button className="btn-ghost text-xs" onClick={() => setShowConfig(true)}>
          Clé API (optionnelle)
        </button>
        {config?.hasSecret && (
          <button className="btn-ghost text-xs text-red-600" onClick={remove}>
            <Trash2 size={12} /> Effacer la clé
          </button>
        )}
      </div>

      {showConfig && (
        <InseeConfigModal
          existing={config}
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); load(); }}
        />
      )}
      {showHelp && <InseeHelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function InseeConfigModal({
  existing, onClose, onSaved,
}: {
  existing: { configured: boolean; hasSecret: boolean } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!apiKey) { toast.error('API key requise'); return; }
    setSaving(true);
    try {
      // On envoie la clé dans inseeApiSecret (chiffré côté serveur).
      // inseeApiKey reste vide ou rempli avec un identifiant d'app si fourni.
      const r = await fetch('/api/admin/insee', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inseeApiKey: 'key', inseeApiSecret: apiKey }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Erreur'); return; }
      toast.success('Clé API enregistrée');
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Configuration INSEE" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="label">
            API Key {existing?.hasSecret && '(laissez vide pour conserver l\'actuelle)'}
          </label>
          <input
            type="password"
            className="input font-mono text-xs"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={existing?.hasSecret ? '••••••••' : 'collez votre clé ici'}
          />
          <p className="text-xs text-muted-foreground mt-1">
            La clé sera chiffrée (AES-256-GCM) avant stockage en base.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={submit} disabled={saving || !apiKey}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function InseeHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title="API INSEE — Séries Chronologiques (BDM)" maxWidth="max-w-2xl">
      <div className="space-y-4 text-sm">
        <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-200 p-3 rounded text-sm">
          <p className="font-medium">Bonne nouvelle : pas besoin de clé API.</p>
          <p className="text-xs mt-1">
            L'INSEE a basculé l'API BDM (renommée « Séries Chronologiques ») en
            mode <strong>Key Less</strong> : l'accès est anonyme et gratuit.
            Cliquez simplement sur <strong>"Synchroniser maintenant"</strong> pour
            récupérer toutes les valeurs IRL publiées.
          </p>
        </div>
        <p>
          La synchro interroge l'endpoint :
          <code className="block mt-1 text-xs p-2 bg-muted rounded">
            GET https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/001763852
          </code>
          puis met à jour la table des indices avec la source <code>insee</code>{' '}
          (les valeurs saisies manuellement sont préservées et marquées{' '}
          <code>manual</code>).
        </p>
        <div className="bg-muted p-3 rounded text-xs">
          <p className="font-medium mb-1">À retenir :</p>
          <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
            <li>Aucun compte INSEE requis.</li>
            <li>L'IRL est publié vers le 15 du dernier mois de chaque trimestre.</li>
            <li>La synchro est manuelle, à relancer après chaque publication.</li>
          </ul>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Si l'INSEE rétablit l'authentification
          </summary>
          <div className="mt-2 space-y-1 text-muted-foreground">
            <p>
              Le bouton <em>"Clé API (optionnelle)"</em> permet de saisir une
              clé qui sera envoyée dans les headers, au cas où l'INSEE ferait
              évoluer son plan. Procédure :
            </p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Compte sur <a href="https://portail-api.insee.fr/" target="_blank" rel="noreferrer" className="text-primary hover:underline">portail-api.insee.fr</a></li>
              <li>Catalog → Séries Chronologiques → Subscribe</li>
              <li>Applications → créer une app, lier la souscription, copier l'API key</li>
            </ol>
          </div>
        </details>
        <div className="flex justify-end pt-2">
          <button className="btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </Modal>
  );
}

function RevisionRow({
  revision: r,
  onUpdate,
}: {
  revision: RevisionAvecLocataire;
  onUpdate: () => void;
}) {
  const [showRecommande, setShowRecommande] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const sent = !!r.recommandeEnvoyeLe;

  const courrierUrl = r.courrierArchiveId
    ? `/api/archives/${r.courrierArchiveId}?view=1`
    : `/api/documents/courrier-revision?revisionId=${r.id}`;
  const preuveUrl = r.preuveDepotArchiveId ? `/api/archives/${r.preuveDepotArchiveId}?view=1` : null;

  return (
    <li className="py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {r.locatairePrenom} {r.locataireNom}
            <span className="text-xs text-muted-foreground ml-2">
              — effet {new Date(r.dateEffet).toLocaleDateString('fr-FR')}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {r.ancienLoyer.toFixed(2)} € → {r.nouveauLoyer.toFixed(2)} € · IRL T{r.trimestre} {r.irlReference} → {r.irlNouveau} ·
            <span className="badge-off ml-1">{r.statut}</span>
            {sent ? (
              <span className="badge-ok ml-1">
                <Check size={10} className="inline" /> recommandé envoyé {new Date(r.recommandeEnvoyeLe!).toLocaleDateString('fr-FR')}
              </span>
            ) : (
              <span className="badge-warn ml-1">recommandé en attente</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary text-xs"
            onClick={() => setPreviewPdf(courrierUrl)}
            title="Visualiser le courrier de révision"
          >
            {r.courrierArchiveId ? <Eye size={14} /> : <FileSignature size={14} />}
            {r.courrierArchiveId ? ' Voir courrier' : ' Courrier'}
          </button>
          <button className="btn-secondary text-xs" onClick={() => setShowRecommande(true)}>
            <Mail size={14} /> {sent ? 'Modifier envoi' : 'Marquer envoyé'}
          </button>
          {preuveUrl && (
            <button
              className="btn-ghost text-xs p-1.5"
              onClick={() => setPreviewPdf(preuveUrl)}
              title="Voir la preuve de dépôt"
            >
              <Paperclip size={14} />
            </button>
          )}
        </div>
      </div>
      {sent && r.recommandeNumero && (
        <p className="text-xs text-muted-foreground pl-2">
          N° de suivi : <code className="text-foreground">{r.recommandeNumero}</code>
        </p>
      )}
      {showRecommande && (
        <RecommandeModal
          revision={r}
          onClose={() => setShowRecommande(false)}
          onSaved={() => { setShowRecommande(false); onUpdate(); }}
        />
      )}
      {previewPdf && (
        <PdfPreviewModal
          url={previewPdf}
          filename={`revision-${r.locataireNom}.pdf`}
          title={`Révision IRL — ${r.locatairePrenom} ${r.locataireNom}`}
          onClose={() => setPreviewPdf(null)}
        />
      )}
    </li>
  );
}

function RecommandeModal({
  revision,
  onClose,
  onSaved,
}: {
  revision: RevisionAvecLocataire;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(
    revision.recommandeEnvoyeLe?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [numero, setNumero] = useState(revision.recommandeNumero ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      let r: Response;
      if (file) {
        const fd = new FormData();
        fd.append('recommandeEnvoyeLe', date);
        if (numero) fd.append('recommandeNumero', numero);
        fd.append('file', file);
        r = await fetch(`/api/irl/revisions/${revision.id}/recommande`, { method: 'POST', body: fd });
      } else {
        r = await fetch(`/api/irl/revisions/${revision.id}/recommande`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recommandeEnvoyeLe: date, recommandeNumero: numero || null }),
        });
      }
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error || 'Erreur');
        return;
      }
      toast.success('Envoi recommandé enregistré');
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Marquer le recommandé envoyé" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div>
          <label className="label">Date d'envoi *</label>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Numéro de suivi (optionnel)</label>
          <input
            className="input font-mono"
            placeholder="Ex: 1A 12345 6789 0"
            value={numero}
            onChange={e => setNumero(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Preuve de dépôt (récépissé scanné, optionnel)</label>
          <input
            type="file"
            accept="image/*,application/pdf"
            className="text-xs"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            PDF ou image, max 10 Mo. Sera archivé sur le locataire.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button className="btn-primary" onClick={submit} disabled={saving || !date}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
