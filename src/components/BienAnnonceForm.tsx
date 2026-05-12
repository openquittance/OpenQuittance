'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildAnnonce,
  type AnnonceBien,
  type AnnonceEquipements,
  type AnnonceContact,
  type AnnonceFinances,
  type AnnonceAdresseChoice,
} from '@/lib/annonce-template';

/**
 * Format JSON persisté dans Bien.annonceMeta (v2.6.1-rc2). Permet à
 * l'admin de rouvrir l'onglet Annonce et retrouver ses saisies.
 */
export interface BienAnnonceMeta {
  equipements: AnnonceEquipements;
  finances: AnnonceFinances;
  contact: AnnonceContact;
  disponibilite: string;
  adresseChoice: AnnonceAdresseChoice;
}

export interface BienAnnonceFormBien {
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
  // v2.6.1-rc2 : meta persisté (équipements, contact, dispo, adresseChoice).
  // Si présent, hydrate les inputs au mount (priorité sur initialContact /
  // initialFinances). Si null, fallback sur les initials passés au form.
  annonceMeta?: BienAnnonceMeta | null;
}

/**
 * Form équipements + preview annonce live + copier + auto-save sur
 * Bien.annonceTexte (debounce 200ms).
 *
 * Réutilisé par :
 *   - Wizard step 4 (logement vacant après création)
 *   - Modale BienForm onglet "Annonce" (régénération sur Bien existant)
 *
 * v2.6.1 polish : initialContact / initialFinances permettent de
 * pré-remplir depuis le Bailleur actif + le locataire actif éventuel.
 */
const DEFAULT_EQ: AnnonceEquipements = {
  meuble: false,
  cuisineEquipee: false,
  laveLinge: false,
  ascenseur: false,
  balcon: false,
  parking: false,
  jardin: false,
  cave: false,
  chargesIncluses: false,
};

export default function BienAnnonceForm({
  bien,
  initialContact,
  initialFinances,
  onSavedTexte,
}: {
  bien: BienAnnonceFormBien;
  initialContact: AnnonceContact;
  initialFinances: AnnonceFinances;
  onSavedTexte?: (texte: string) => void;
}) {
  // v2.6.1-rc2 : hydrate priorité annonceMeta persisté, fallback initials.
  const meta = bien.annonceMeta ?? null;
  const [eq, setEq] = useState<AnnonceEquipements>(meta?.equipements ?? DEFAULT_EQ);
  const [finances, setFinances] = useState<AnnonceFinances>(meta?.finances ?? initialFinances);
  const [contact, setContact] = useState<AnnonceContact>(meta?.contact ?? initialContact);
  const [dispo, setDispo] = useState<string>(meta?.disponibilite ?? '');
  const [adresseChoice, setAdresseChoice] = useState<AnnonceAdresseChoice>(
    meta?.adresseChoice ?? { includeAdresse: true, includeSecteur: false, secteurText: '' },
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const annonceText = useMemo(() => {
    const annonceBien: AnnonceBien = {
      typeBien: (bien.typeBien as AnnonceBien['typeBien']) ?? null,
      surface: bien.surface,
      etage: bien.etage,
      adresse: bien.adresse,
      complement: bien.complement,
      codePostal: bien.codePostal,
      ville: bien.ville,
      dpeClasse: (bien.dpeClasse as AnnonceBien['dpeClasse']) ?? null,
      dpeKwh: bien.dpeKwh,
      dpeGes: bien.dpeGes,
    };
    return buildAnnonce({
      bien: annonceBien,
      equipements: eq,
      contact,
      finances,
      disponibilite: dispo || null,
      adresseChoice,
    });
  }, [bien, eq, contact, finances, dispo, adresseChoice]);

  // Auto-save annonceTexte + annonceMeta — debounce 200ms (Q6 + Q17 +
  // v2.6.1-rc2 persistance inputs).
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const annonceMeta: BienAnnonceMeta = {
        equipements: eq,
        finances,
        contact,
        disponibilite: dispo,
        adresseChoice,
      };
      fetch(`/api/biens/${bien.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annonceTexte: annonceText, annonceMeta }),
      })
        .then(r => { if (r.ok) onSavedTexte?.(annonceText); })
        .catch(() => { /* silent */ });
    }, 200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [annonceText, bien.id, eq, finances, contact, dispo, adresseChoice, onSavedTexte]);

  const copyAnnonce = async () => {
    try {
      await navigator.clipboard.writeText(annonceText);
      toast.success('Annonce copiée dans le presse-papier');
    } catch {
      toast.error('Impossible de copier — sélectionnez le texte manuellement.');
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Loyer & dépôt</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Loyer nu (€)</label>
              <input type="number" step="0.01" className="input"
                value={finances.loyerNu}
                onChange={e => setFinances(f => ({ ...f, loyerNu: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Charges (€)</label>
              <input type="number" step="0.01" className="input"
                value={finances.charges}
                onChange={e => setFinances(f => ({ ...f, charges: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="label">Dépôt (€)</label>
              <input type="number" step="0.01" className="input"
                value={finances.depotGarantie ?? ''}
                onChange={e => setFinances(f => ({ ...f, depotGarantie: e.target.value === '' ? null : Number(e.target.value) }))} />
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Équipements</p>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ['meuble', 'Meublé'],
              ['cuisineEquipee', 'Cuisine équipée'],
              ['laveLinge', 'Lave-linge'],
              ['ascenseur', 'Ascenseur'],
              ['balcon', 'Balcon'],
              ['parking', 'Parking'],
              ['jardin', 'Jardin'],
              ['cave', 'Cave'],
              ['chargesIncluses', 'Charges incluses'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={eq[key]}
                  onChange={e => setEq(s => ({ ...s, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Affichage adresse</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={adresseChoice.includeAdresse}
              onChange={e => setAdresseChoice(c => ({ ...c, includeAdresse: e.target.checked }))}
            />
            Inclure l'adresse complète dans l'annonce
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={adresseChoice.includeSecteur}
              onChange={e => setAdresseChoice(c => ({ ...c, includeSecteur: e.target.checked }))}
            />
            Inclure un secteur / quartier
          </label>
          {adresseChoice.includeSecteur && (
            <input className="input" value={adresseChoice.secteurText}
              onChange={e => setAdresseChoice(c => ({ ...c, secteurText: e.target.value }))}
              placeholder="ex : Belleville, Bastille, centre-ville…" />
          )}
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Disponibilité</p>
          <input className="input" value={dispo}
            onChange={e => setDispo(e.target.value)}
            placeholder="ex : immédiate, 1er juin 2026, sous 2 semaines…" />
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Contact</p>
          <div className="grid grid-cols-1 gap-2">
            <input className="input" placeholder="Nom bailleur"
              value={contact.nomBailleur}
              onChange={e => setContact(c => ({ ...c, nomBailleur: e.target.value }))} />
            <input className="input" placeholder="Email"
              value={contact.email ?? ''}
              onChange={e => setContact(c => ({ ...c, email: e.target.value }))} />
            <input className="input" placeholder="Téléphone"
              value={contact.telephone ?? ''}
              onChange={e => setContact(c => ({ ...c, telephone: e.target.value }))} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Aperçu annonce</h3>
          <button className="btn-secondary btn-sm" onClick={copyAnnonce}>
            <Copy size={14} /> Copier
          </button>
        </div>
        <pre className="text-xs whitespace-pre-wrap font-mono bg-muted/30 p-3 rounded border border-border min-h-[400px]">
          {annonceText}
        </pre>
      </div>
    </div>
  );
}
