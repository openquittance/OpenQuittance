'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, FileText, Users, Megaphone, Check, ChevronRight, ChevronLeft, Home,
} from 'lucide-react';
import { toast } from 'sonner';
import AppShell from '@/components/layout/AppShell';
import ArchiveManager from '@/components/ArchiveManager';
import LocataireForm from '@/components/LocataireForm';
import BienAnnonceForm from '@/components/BienAnnonceForm';
import { useBailleurs } from '@/lib/bailleur-context';
import {
  TYPE_BIEN_VALUES,
  DPE_CLASSE_VALUES,
} from '@/lib/validation';
import { BIEN_CATEGORIES_WIZARD_PRIORITY } from '@/lib/archive-categories';

type WizardStep = 1 | 2 | 3 | 4;

interface CreatedBien {
  id: string;
  nom: string;
  adresse: string;
  complement: string | null;
  codePostal: string;
  ville: string;
  surface: number | null;
  typeBien: string | null;
  etage: number | null;
  dpeClasse: string | null;
  dpeKwh: number | null;
  dpeGes: number | null;
  annonceTexte: string | null;
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

function StepIndicator({ current, vacant }: { current: WizardStep; vacant: boolean }) {
  const steps: { n: WizardStep; label: string; icon: typeof Building2 }[] = [
    { n: 1, label: 'Bien', icon: Building2 },
    { n: 2, label: 'Documents', icon: FileText },
    { n: 3, label: 'Locataire', icon: Users },
    { n: 4, label: 'Annonce', icon: Megaphone },
  ];
  return (
    <ol className="flex items-center gap-2 mb-6">
      {steps.map(({ n, label, icon: Icon }, idx) => {
        const disabled = n === 4 && !vacant;
        const cls = disabled
          ? 'bg-muted text-muted-foreground/50'
          : n < current ? 'bg-emerald-500 text-white'
          : n === current ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground';
        return (
          <li key={n} className="flex items-center gap-2 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${cls}`}>
              {n < current && !disabled ? <Check size={14} /> : <Icon size={14} />}
            </div>
            <span
              className={`text-sm hidden sm:inline ${
                disabled ? 'text-muted-foreground/50' : n === current ? 'font-medium' : 'text-muted-foreground'
              }`}
            >
              {label}
            </span>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-0.5 ${n < current ? 'bg-emerald-500' : 'bg-muted'}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function WizardContent() {
  const router = useRouter();
  const { active, setActiveId, bailleurs } = useBailleurs();
  const [step, setStep] = useState<WizardStep>(1);
  const [showBailleurPicker, setShowBailleurPicker] = useState(false);

  // Step 1 — Bien form state
  const [bienForm, setBienForm] = useState({
    nom: '', adresse: '', codePostal: '', ville: '', complement: '',
    surface: '' as number | '',
    typeBien: '' as string,
    etage: '' as number | '',
    dpeClasse: '' as string,
    dpeKwh: '' as number | '',
    dpeGes: '' as number | '',
  });
  const [bienSaving, setBienSaving] = useState(false);
  const [createdBien, setCreatedBien] = useState<CreatedBien | null>(null);

  // Step 3 — choix locataire ou vacant
  const [step3Choice, setStep3Choice] = useState<'locataire' | 'vacant' | null>(null);
  const [createdLocataire, setCreatedLocataire] = useState<{ id: string } | null>(null);

  const submitBien = async () => {
    if (!active) return;
    if (!bienForm.nom || !bienForm.adresse || !bienForm.codePostal || !bienForm.ville) {
      toast.error('Nom, adresse, code postal et ville sont obligatoires.');
      return;
    }
    setBienSaving(true);
    try {
      const body = {
        bailleurId: active.id,
        nom: bienForm.nom,
        adresse: bienForm.adresse,
        codePostal: bienForm.codePostal,
        ville: bienForm.ville,
        complement: bienForm.complement || null,
        actif: true,
        surface: bienForm.surface === '' ? null : Number(bienForm.surface),
        typeBien: bienForm.typeBien || null,
        etage: bienForm.etage === '' ? null : Number(bienForm.etage),
        dpeClasse: bienForm.dpeClasse || null,
        dpeKwh: bienForm.dpeKwh === '' ? null : Number(bienForm.dpeKwh),
        dpeGes: bienForm.dpeGes === '' ? null : Number(bienForm.dpeGes),
      };
      const r = await fetch('/api/biens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json();
        toast.error(j.error || 'Erreur création');
        return;
      }
      const created: CreatedBien = await r.json();
      setCreatedBien(created);
      toast.success('Bien créé');
      setStep(2);
    } finally {
      setBienSaving(false);
    }
  };

  const finishWizard = () => {
    toast.success('Logement créé.');
    router.push('/biens');
  };

  if (!active) {
    return (
      <div className="card text-center space-y-3">
        <p className="text-muted-foreground">Sélectionnez un bailleur pour créer un logement.</p>
        <button className="btn-secondary" onClick={() => router.push('/biens')}>← Retour à Biens</button>
      </div>
    );
  }

  const vacant = step3Choice === 'vacant';

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Home size={22} /> Nouveau logement
          </h1>
          <p className="text-sm text-muted-foreground">
            Bailleur : <strong>{active.nom}</strong>{' '}
            <button
              className="text-xs underline ml-1 text-muted-foreground hover:text-foreground"
              onClick={() => setShowBailleurPicker(s => !s)}
            >
              {showBailleurPicker ? 'Fermer' : 'Changer'}
            </button>
          </p>
          {showBailleurPicker && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bailleurs.map(b => (
                <button
                  key={b.id}
                  className={`px-2 py-1 text-xs rounded border ${b.id === active.id ? 'border-foreground' : 'border-border hover:border-foreground'}`}
                  onClick={() => { setActiveId(b.id); setShowBailleurPicker(false); }}
                >
                  {b.nom}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn-ghost text-sm" onClick={() => router.push('/biens')}>Quitter</button>
      </div>

      <StepIndicator current={step} vacant={vacant} />

      {step === 1 && (
        <div className="card space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <h2 className="text-lg font-semibold">Étape 1 : informations du bien</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Nom *</label>
              <input className="input" value={bienForm.nom}
                onChange={e => setBienForm(f => ({ ...f, nom: e.target.value }))}
                placeholder="Référence interne (ex. T2 centre, Studio Belleville)" />
            </div>
            <div className="col-span-2">
              <label className="label">Adresse *</label>
              <input className="input" value={bienForm.adresse}
                onChange={e => setBienForm(f => ({ ...f, adresse: e.target.value }))}
                placeholder="Numéro et rue" />
            </div>
            <div>
              <label className="label">Code postal *</label>
              <input className="input" value={bienForm.codePostal}
                onChange={e => setBienForm(f => ({ ...f, codePostal: e.target.value }))} />
            </div>
            <div>
              <label className="label">Ville *</label>
              <input className="input" value={bienForm.ville}
                onChange={e => setBienForm(f => ({ ...f, ville: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="label">Complément</label>
              <input className="input" value={bienForm.complement}
                onChange={e => setBienForm(f => ({ ...f, complement: e.target.value }))}
                placeholder="Bât. A, étage, n° d'appartement…" />
            </div>
            <div>
              <label className="label">Surface (m²)</label>
              <input type="number" step="0.1" className="input" value={bienForm.surface}
                onChange={e => setBienForm(f => ({ ...f, surface: e.target.value === '' ? '' : Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="input" value={bienForm.typeBien}
                onChange={e => setBienForm(f => ({ ...f, typeBien: e.target.value }))}>
                <option value="">— Non précisé —</option>
                {TYPE_BIEN_VALUES.map(t => (
                  <option key={t} value={t}>{TYPE_BIEN_LABELS_FR[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Étage</label>
              <input type="number" className="input" value={bienForm.etage}
                onChange={e => setBienForm(f => ({ ...f, etage: e.target.value === '' ? '' : Number(e.target.value) }))}
                placeholder="0 = rdc" />
            </div>
            <div>
              <label className="label">DPE classe</label>
              <select className="input" value={bienForm.dpeClasse}
                onChange={e => setBienForm(f => ({ ...f, dpeClasse: e.target.value }))}>
                <option value="">— Non précisé —</option>
                {DPE_CLASSE_VALUES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">DPE consommation (kWh/m²/an)</label>
              <input type="number" step="0.1" className="input" value={bienForm.dpeKwh}
                onChange={e => setBienForm(f => ({ ...f, dpeKwh: e.target.value === '' ? '' : Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">DPE émission GES (kgCO2/m²/an)</label>
              <input type="number" step="0.1" className="input" value={bienForm.dpeGes}
                onChange={e => setBienForm(f => ({ ...f, dpeGes: e.target.value === '' ? '' : Number(e.target.value) }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button className="btn-secondary" onClick={() => router.push('/biens')}>Annuler</button>
            <button className="btn-primary" onClick={submitBien} disabled={bienSaving}>
              {bienSaving ? 'Création…' : 'Créer le bien'} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 2 && createdBien && (
        <div className="card space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <h2 className="text-lg font-semibold">Étape 2 : documents propriétaire</h2>
          <p className="text-sm text-muted-foreground">
            Recommandé avant mise en location : DPE + diagnostics légaux (DDT)
            + acte de vente + assurance PNO. Étape libre — vous pouvez tout
            uploader plus tard depuis la fiche du bien.
          </p>
          <ArchiveManager
            ownerType="Bien"
            ownerId={createdBien.id}
            ownerLabel={createdBien.nom}
            prioritizedCategories={BIEN_CATEGORIES_WIZARD_PRIORITY}
          />
          <div className="flex justify-between gap-2 pt-3 border-t border-border">
            <button className="btn-secondary" onClick={() => setStep(1)}>
              <ChevronLeft size={14} /> Retour
            </button>
            <button className="btn-primary" onClick={() => setStep(3)}>
              Suivant <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 3 && createdBien && (
        <div className="card space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <h2 className="text-lg font-semibold">Étape 3 : locataire</h2>
          <div className="space-y-2">
            <label className={`flex items-start gap-3 p-3 border rounded cursor-pointer ${step3Choice === 'locataire' ? 'border-foreground bg-muted/30' : 'border-border hover:border-foreground'}`}>
              <input
                type="radio" name="step3"
                checked={step3Choice === 'locataire'}
                onChange={() => setStep3Choice('locataire')}
                className="mt-1"
              />
              <div>
                <p className="font-medium">Créer un locataire maintenant</p>
                <p className="text-xs text-muted-foreground">
                  Saisir tout de suite les infos du locataire en place ou à venir.
                </p>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-3 border rounded cursor-pointer ${step3Choice === 'vacant' ? 'border-foreground bg-muted/30' : 'border-border hover:border-foreground'}`}>
              <input
                type="radio" name="step3"
                checked={step3Choice === 'vacant'}
                onChange={() => setStep3Choice('vacant')}
                className="mt-1"
              />
              <div>
                <p className="font-medium">Logement vacant</p>
                <p className="text-xs text-muted-foreground">
                  Pas de locataire en place. Étape suivante : générer une annonce
                  locative à coller sur LeBonCoin / SeLoger.
                </p>
              </div>
            </label>
          </div>

          {step3Choice === 'locataire' && !createdLocataire && (
            <div className="pt-3 border-t border-border">
              <LocataireForm
                locataire={null}
                biens={[{ id: createdBien.id, nom: createdBien.nom, adresse: createdBien.adresse, ville: createdBien.ville }]}
                lockedBienId={createdBien.id}
                submitLabel="Créer le locataire"
                cancelLabel="Plus tard"
                onCancel={() => setStep3Choice(null)}
                onSaved={(created) => {
                  setCreatedLocataire(created);
                  toast.success('Logement + locataire créés.');
                  router.push('/biens');
                }}
              />
            </div>
          )}

          <div className="flex justify-between gap-2 pt-3 border-t border-border">
            <button className="btn-secondary" onClick={() => setStep(2)}>
              <ChevronLeft size={14} /> Retour
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                if (step3Choice === 'vacant') setStep(4);
                else finishWizard();
              }}
              disabled={!step3Choice || (step3Choice === 'locataire' && !createdLocataire)}
            >
              {step3Choice === 'vacant' ? 'Générer annonce' : 'Terminer'} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {step === 4 && createdBien && vacant && (
        <div className="card space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <h2 className="text-lg font-semibold">Étape 4 : annonce locative</h2>
          <p className="text-xs text-muted-foreground">
            Aperçu mis à jour en direct à droite. Auto-sauvé sur le bien.
          </p>
          <BienAnnonceForm
            bien={{
              ...createdBien,
              annonceTexte: createdBien.annonceTexte ?? null,
              // Bien fraîchement créé via wizard step 1 → pas de meta persistée
              annonceMeta: null,
            }}
            initialContact={{ nomBailleur: active.nom, email: '', telephone: '' }}
            initialFinances={{ loyerNu: 0, charges: 0, depotGarantie: null }}
          />
          <div className="flex justify-between gap-2 pt-3 border-t border-border">
            <button className="btn-secondary" onClick={() => setStep(3)}>
              <ChevronLeft size={14} /> Retour
            </button>
            <button className="btn-primary" onClick={finishWizard}>
              Terminer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WizardPage() {
  return <AppShell><WizardContent /></AppShell>;
}
