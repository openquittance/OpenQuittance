'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Briefcase, Building2, Users, FileText, Check, ChevronRight, ChevronLeft, Sparkles, SkipForward,
} from 'lucide-react';
import AppShell from '@/components/layout/AppShell';

// Wizard d'onboarding en 4 étapes pour les nouveaux comptes :
// 1) Bailleur  2) Bien  3) Locataire  4) Première quittance
//
// Chaque étape n'avance que si une entité a été créée. L'utilisateur peut
// "Skip" : la progression reprendra plus tard depuis le dashboard si l'état
// est encore incomplet (cf. composant OnboardingChecklist).

type Step = 1 | 2 | 3 | 4;

interface State {
  hasBailleur: boolean;
  bailleurId?: string;
  hasBien: boolean;
  bienId?: string;
  hasLocataire: boolean;
  locataireId?: string;
  hasQuittance: boolean;
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { n: Step; label: string }[] = [
    { n: 1, label: 'Bailleur' },
    { n: 2, label: 'Bien' },
    { n: 3, label: 'Locataire' },
    { n: 4, label: 'Quittance' },
  ];
  return (
    <ol className="flex items-center gap-2 mb-6">
      {steps.map(({ n, label }, idx) => (
        <li key={n} className="flex items-center gap-2 flex-1">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
              n < current ? 'bg-emerald-500 text-white'
              : n === current ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
            }`}
          >
            {n < current ? <Check size={14} /> : n}
          </div>
          <span className={`text-sm ${n === current ? 'font-medium' : 'text-muted-foreground'} hidden sm:inline`}>
            {label}
          </span>
          {idx < 3 && <div className={`flex-1 h-0.5 ${n < current ? 'bg-emerald-500' : 'bg-muted'}`} />}
        </li>
      ))}
    </ol>
  );
}

function Content() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [state, setState] = useState<State>({
    hasBailleur: false, hasBien: false, hasLocataire: false, hasQuittance: false,
  });

  // Charge l'état initial — si tout est déjà fait, on bypass.
  // /api/biens, /api/locataires, /api/quittances sont scopées par
  // bailleurId (cf. docs/MULTI-BAILLEUR.md). On charge d'abord la
  // liste des bailleurs, puis on fetche le reste avec le 1er bailleur
  // comme scope. Si 0 bailleur (vrai cas d'onboarding), on skip les
  // 3 fetches dépendants.
  useEffect(() => {
    (async () => {
      const bailleurs = await fetch('/api/bailleurs').then(r => r.json()).catch(() => []);
      const arrBailleurs = Array.isArray(bailleurs) ? bailleurs : [];
      const firstBailleurId = arrBailleurs[0]?.id;

      let arrBiens: { id: string }[] = [];
      let arrLocs: { id: string }[] = [];
      let arrQuittances: { id: string }[] = [];
      if (firstBailleurId) {
        const [biens, locataires, quittances] = await Promise.all([
          fetch(`/api/biens?bailleurId=${firstBailleurId}`).then(r => r.json()).catch(() => []),
          fetch(`/api/locataires?bailleurId=${firstBailleurId}`).then(r => r.json()).catch(() => []),
          fetch(`/api/quittances?bailleurId=${firstBailleurId}`).then(r => r.json()).catch(() => ({ quittances: [] })),
        ]);
        arrBiens = Array.isArray(biens) ? biens : [];
        arrLocs = Array.isArray(locataires) ? locataires : [];
        arrQuittances = Array.isArray(quittances?.quittances) ? quittances.quittances : [];
      }

      const next: State = {
        hasBailleur: arrBailleurs.length > 0,
        bailleurId: firstBailleurId,
        hasBien: arrBiens.length > 0,
        bienId: arrBiens[0]?.id,
        hasLocataire: arrLocs.length > 0,
        locataireId: arrLocs[0]?.id,
        hasQuittance: arrQuittances.length > 0,
      };
      setState(next);
      if (!next.hasBailleur) setStep(1);
      else if (!next.hasBien) setStep(2);
      else if (!next.hasLocataire) setStep(3);
      else if (!next.hasQuittance) setStep(4);
      else router.push('/');
    })();
  }, [router]);

  const next = () => setStep(s => (s < 4 ? ((s + 1) as Step) : s));
  const prev = () => setStep(s => (s > 1 ? ((s - 1) as Step) : s));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-1">
        <Sparkles className="mx-auto text-primary" size={32} />
        <h1 className="text-2xl font-semibold">Bienvenue !</h1>
        <p className="text-sm text-muted-foreground">
          Configurons votre première quittance en quelques minutes.
        </p>
      </div>

      <StepIndicator current={step} />

      <div className="card">
        {step === 1 && (
          <BailleurStep
            done={state.hasBailleur}
            onCreated={(id) => { setState(s => ({ ...s, hasBailleur: true, bailleurId: id })); next(); }}
          />
        )}
        {step === 2 && state.bailleurId && (
          <BienStep
            bailleurId={state.bailleurId}
            done={state.hasBien}
            onCreated={(id) => { setState(s => ({ ...s, hasBien: true, bienId: id })); next(); }}
          />
        )}
        {step === 3 && state.bienId && (
          <LocataireStep
            bienId={state.bienId}
            done={state.hasLocataire}
            onCreated={(id) => { setState(s => ({ ...s, hasLocataire: true, locataireId: id })); next(); }}
          />
        )}
        {step === 4 && state.locataireId && state.bailleurId && (
          <QuittanceStep
            locataireId={state.locataireId}
            bailleurId={state.bailleurId}
            done={state.hasQuittance}
            onDone={() => router.push('/')}
          />
        )}
      </div>

      <div className="flex justify-between text-sm">
        <button className="btn-ghost" onClick={prev} disabled={step === 1}>
          <ChevronLeft size={14} /> Précédent
        </button>
        <Link href="/" className="text-muted-foreground hover:underline flex items-center gap-1">
          <SkipForward size={12} /> Plus tard, accéder au dashboard
        </Link>
      </div>
    </div>
  );
}

// ─── Étape 1 : Bailleur ─────────────────────────────────────────────────────
function BailleurStep({ done, onCreated }: { done: boolean; onCreated: (id: string) => void }) {
  const [nom, setNom] = useState('');
  const [adresseLigne1, setAdresse1] = useState('');
  const [adresseLigne2, setAdresse2] = useState('');
  const [villeSignature, setVille] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/bailleurs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom, adresseLigne1, adresseLigne2, villeSignature,
          actif: true, pdfCouleur: '#1a3a5c', pdfPolice: 'Helvetica',
        }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Erreur'); return; }
      toast.success('Bailleur créé');
      onCreated(j.id);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Briefcase className="text-primary" size={22} />
        <div>
          <h2 className="font-semibold">Étape 1 — Votre bailleur</h2>
          <p className="text-sm text-muted-foreground">
            Personne physique ou SCI propriétaire des biens loués.
          </p>
        </div>
      </div>
      {done ? (
        <p className="text-sm text-emerald-600 flex items-center gap-1">
          <Check size={14} /> Un bailleur existe déjà.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Nom *</label>
            <input className="input" value={nom} onChange={e => setNom(e.target.value)} placeholder="SCI Beauregard" />
          </div>
          <div>
            <label className="label">Adresse ligne 1 *</label>
            <input className="input" value={adresseLigne1} onChange={e => setAdresse1(e.target.value)}
              placeholder="12 rue des Lilas" />
          </div>
          <div>
            <label className="label">Code postal et ville *</label>
            <input className="input" value={adresseLigne2} onChange={e => setAdresse2(e.target.value)}
              placeholder="75019 Paris" />
          </div>
          <div>
            <label className="label">Ville de signature *</label>
            <input className="input" value={villeSignature} onChange={e => setVille(e.target.value)}
              placeholder="Paris" />
          </div>
          <button
            className="btn-primary w-full"
            disabled={saving || !nom || !adresseLigne1 || !adresseLigne2 || !villeSignature}
            onClick={submit}
          >
            {saving ? 'Création…' : <>Créer le bailleur <ChevronRight size={14} /></>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Étape 2 : Bien ─────────────────────────────────────────────────────────
function BienStep({ bailleurId, done, onCreated }: {
  bailleurId: string; done: boolean; onCreated: (id: string) => void;
}) {
  const [nom, setNom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [codePostal, setCp] = useState('');
  const [ville, setVille] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/biens', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bailleurId, nom, adresse, codePostal, ville, actif: true }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Erreur'); return; }
      toast.success('Bien créé');
      onCreated(j.id);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Building2 className="text-primary" size={22} />
        <div>
          <h2 className="font-semibold">Étape 2 — Le bien loué</h2>
          <p className="text-sm text-muted-foreground">L'appartement ou la maison concernée.</p>
        </div>
      </div>
      {done ? (
        <p className="text-sm text-emerald-600 flex items-center gap-1">
          <Check size={14} /> Un bien existe déjà.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Nom interne *</label>
            <input className="input" value={nom} onChange={e => setNom(e.target.value)}
              placeholder="Studio Centre-Ville" />
          </div>
          <div>
            <label className="label">Adresse *</label>
            <input className="input" value={adresse} onChange={e => setAdresse(e.target.value)}
              placeholder="3 boulevard Saint-Pierre" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Code postal *</label>
              <input className="input" value={codePostal} onChange={e => setCp(e.target.value)}
                placeholder="75019" />
            </div>
            <div>
              <label className="label">Ville *</label>
              <input className="input" value={ville} onChange={e => setVille(e.target.value)} placeholder="Paris" />
            </div>
          </div>
          <button
            className="btn-primary w-full"
            disabled={saving || !nom || !adresse || !codePostal || !ville}
            onClick={submit}
          >
            {saving ? 'Création…' : <>Créer le bien <ChevronRight size={14} /></>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Étape 3 : Locataire ────────────────────────────────────────────────────
function LocataireStep({ bienId, done, onCreated }: {
  bienId: string; done: boolean; onCreated: (id: string) => void;
}) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [loyerNu, setLoyer] = useState('');
  const [charges, setCharges] = useState('');
  const [dateEntree, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      // lint-fetches: skip — POST body contient bienId, serveur valide via composite memberships
      const r = await fetch('/api/locataires', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bienId, nom, prenom,
          email: email || null,
          loyerNu: parseFloat(loyerNu),
          charges: parseFloat(charges) || 0,
          dateEntree, actif: true,
        }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Erreur'); return; }
      toast.success('Locataire créé');
      onCreated(j.id);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Users className="text-primary" size={22} />
        <div>
          <h2 className="font-semibold">Étape 3 — Le locataire</h2>
          <p className="text-sm text-muted-foreground">La personne qui loue le bien.</p>
        </div>
      </div>
      {done ? (
        <p className="text-sm text-emerald-600 flex items-center gap-1">
          <Check size={14} /> Un locataire existe déjà.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Prénom *</label>
              <input className="input" value={prenom} onChange={e => setPrenom(e.target.value)} />
            </div>
            <div>
              <label className="label">Nom *</label>
              <input className="input" value={nom} onChange={e => setNom(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Email (pour envoi quittances)</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Loyer hors charges (€) *</label>
              <input type="number" step="0.01" className="input" value={loyerNu}
                onChange={e => setLoyer(e.target.value)} />
            </div>
            <div>
              <label className="label">Charges (€)</label>
              <input type="number" step="0.01" className="input" value={charges}
                onChange={e => setCharges(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Date d'entrée *</label>
            <input type="date" className="input" value={dateEntree} onChange={e => setDate(e.target.value)} />
          </div>
          <button
            className="btn-primary w-full"
            disabled={saving || !nom || !prenom || !loyerNu}
            onClick={submit}
          >
            {saving ? 'Création…' : <>Créer le locataire <ChevronRight size={14} /></>}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Étape 4 : Première quittance ───────────────────────────────────────────
function QuittanceStep({ locataireId, bailleurId, done, onDone }: {
  locataireId: string; bailleurId: string; done: boolean; onDone: () => void;
}) {
  const today = new Date();
  const [mois, setMois] = useState(today.getMonth() + 1);
  const [annee, setAnnee] = useState(today.getFullYear());
  const [generating, setGenerating] = useState(false);
  void locataireId; // peut servir pour génération individuelle plus tard

  const generer = async () => {
    setGenerating(true);
    try {
      const r = await fetch('/api/quittances/generer-mois', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bailleurId, mois, annee,
          datePaiement: new Date(annee, mois - 1, 5).toISOString().slice(0, 10),
          dateEmission: new Date(annee, mois - 1, 1).toISOString().slice(0, 10),
        }),
      });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Erreur'); return; }
      toast.success(`${j.created || 0} quittance(s) générée(s)`);
      onDone();
    } finally { setGenerating(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FileText className="text-primary" size={22} />
        <div>
          <h2 className="font-semibold">Étape 4 — Votre première quittance</h2>
          <p className="text-sm text-muted-foreground">
            Génération automatique pour tous les locataires actifs du bailleur.
          </p>
        </div>
      </div>
      {done ? (
        <p className="text-sm text-emerald-600 flex items-center gap-1">
          <Check size={14} /> Une quittance existe déjà. Vous pouvez aller au dashboard.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mois</label>
              <select className="input" value={mois} onChange={e => setMois(parseInt(e.target.value, 10))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>
                    {new Date(2000, m - 1).toLocaleString('fr-FR', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Année</label>
              <input type="number" className="input" value={annee}
                onChange={e => setAnnee(parseInt(e.target.value, 10))} />
            </div>
          </div>
          <button className="btn-primary w-full" onClick={generer} disabled={generating}>
            {generating ? 'Génération…' : 'Générer la quittance'}
          </button>
        </div>
      )}
      {done && (
        <button className="btn-primary w-full" onClick={onDone}>
          Accéder au dashboard
        </button>
      )}
    </div>
  );
}

export default function OnboardingPage() {
  return <AppShell><Content /></AppShell>;
}
