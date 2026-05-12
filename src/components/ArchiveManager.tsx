'use client';

import { DragEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Download, Trash2, Paperclip, Folder, Eye, Eye as EyeIcon, Info } from 'lucide-react';
import { formatDateTimeFr } from '@/lib/utils';
import PdfPreviewModal from './PdfPreviewModal';
import {
  BIEN_CATEGORIES_UI_ORDER,
  LOCATAIRE_CATEGORIES_UI_ORDER,
  CATEGORY_LABELS,
  DDT_CATEGORIES,
  LOCATAIRE_TOGGLE,
  normalizeCategory,
  type ArchiveCategory,
} from '@/lib/archive-categories';

interface Archive {
  id: string;
  category: string | null;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  visibleLocataire: boolean;
  uploadedBy: { name: string | null; email: string };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}

export default function ArchiveManager({
  ownerType,
  ownerId,
  ownerLabel,
  prioritizedCategories,
}: {
  ownerType: 'Bien' | 'Locataire';
  ownerId: string;
  ownerLabel?: string;
  /**
   * Sous-ensemble priorisé affiché en `<optgroup>` "Recommandés".
   * Le reste passe dans "Plus de catégories". Utilisé par le wizard
   * Feature B step 2 (Q5 cadrage).
   */
  prioritizedCategories?: ReadonlyArray<ArchiveCategory>;
}) {
  const [archives, setArchives] = useState<Archive[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  // v2.5.0 Feature A : catégorie obligatoire à l'écriture, dropdown
  // peuplé selon ownerType, ordre par fréquence d'usage probable (Q13).
  const [category, setCategory] = useState<ArchiveCategory | ''>('');
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<{ url: string; filename: string; title: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categoryOptions = ownerType === 'Bien'
    ? BIEN_CATEGORIES_UI_ORDER
    : LOCATAIRE_CATEGORIES_UI_ORDER;
  const prioritySet = new Set<string>(prioritizedCategories ?? []);
  const priorityOptions = prioritizedCategories
    ? categoryOptions.filter(c => prioritySet.has(c))
    : null;
  const restOptions = prioritizedCategories
    ? categoryOptions.filter(c => !prioritySet.has(c))
    : null;

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/archives?ownerType=${ownerType}&ownerId=${ownerId}`);
      const j = await r.json();
      setArchives(j.archives || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [ownerType, ownerId]);

  const onUpload = async (file: File) => {
    if (!category) {
      toast.error('Sélectionnez une catégorie avant d\'uploader.');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('ownerType', ownerType);
      fd.append('ownerId', ownerId);
      fd.append('category', category);
      fd.append('file', file);
      const r = await fetch('/api/archives', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      toast.success(`${file.name} archivé`);
      setCategory('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erreur upload');
    } finally {
      setUploading(false);
    }
  };

  const onToggleVisible = async (a: Archive, next: boolean) => {
    // Optimistic update
    setArchives(prev => prev.map(x => x.id === a.id ? { ...x, visibleLocataire: next } : x));
    try {
      const r = await fetch(`/api/archives/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleLocataire: next }),
      });
      if (!r.ok) throw new Error('Erreur PATCH');
    } catch (e: unknown) {
      // Rollback
      setArchives(prev => prev.map(x => x.id === a.id ? { ...x, visibleLocataire: !next } : x));
      toast.error(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const onDelete = async (a: Archive) => {
    if (!confirm(`Supprimer "${a.filename}" ?`)) return;
    const r = await fetch(`/api/archives/${a.id}`, { method: 'DELETE' });
    if (r.ok) {
      toast.success('Supprimé');
      await load();
    } else {
      toast.error('Erreur suppression');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Folder size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-medium">
          Archives {ownerLabel ? <span className="text-muted-foreground">— {ownerLabel}</span> : null}
        </h3>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="label">Catégorie *</label>
            <select
              className="input"
              value={category}
              onChange={e => setCategory(e.target.value as ArchiveCategory | '')}
            >
              <option value="">— Sélectionner —</option>
              {priorityOptions && restOptions ? (
                <>
                  <optgroup label="Recommandés">
                    {priorityOptions.map(c => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Plus de catégories">
                    {restOptions.map(c => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </optgroup>
                </>
              ) : (
                categoryOptions.map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))
              )}
            </select>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
            }}
          />
          <button
            className="btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !category}
            title={!category ? 'Sélectionnez d\'abord une catégorie' : undefined}
          >
            <Upload size={14} /> {uploading ? 'Envoi…' : 'Choisir un fichier'}
          </button>
        </div>
        <div
          className={`border-2 border-dashed rounded-md p-4 text-center text-xs transition cursor-pointer ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border text-muted-foreground'
          }`}
          onDragOver={(e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onUpload(f);
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          {dragOver
            ? <span className="text-primary font-medium">Déposez le fichier ici</span>
            : <span>… ou glissez-déposez un fichier ici (max 25 Mo)</span>}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Chargement…</p>
      ) : archives.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Aucun fichier archivé.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded">
          {archives.map(a => {
            const norm = normalizeCategory(a.category);
            // Catégorie Locataire système (BAIL/EDL_*) → toggle gouverne,
            // checkbox visibleLocataire ignorée.
            const isSystemLoc = ownerType === 'Locataire'
              && norm != null
              && norm in LOCATAIRE_TOGGLE
              && LOCATAIRE_TOGGLE[norm as keyof typeof LOCATAIRE_TOGGLE] !== null;
            // Catégorie Bien DDT → visibilité tenant gouvernée par le toggle
            // partageDDT côté fiche locataire (Q14 hint).
            const isBienDDT = ownerType === 'Bien'
              && norm != null
              && DDT_CATEGORIES.has(norm as never);
            const label = norm ? CATEGORY_LABELS[norm] : a.category;
            return (
            <li key={a.id} className="px-3 py-2 flex items-center gap-3">
              <Paperclip size={14} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{a.filename}</p>
                <p className="text-xs text-muted-foreground">
                  {label ? <span className="badge mr-2">{label}</span> : null}
                  {formatBytes(a.size)} · {formatDateTimeFr(a.createdAt)} · {a.uploadedBy.name ?? a.uploadedBy.email}
                </p>
              </div>
              {/* Q14 hint Bien DDT : la visibilité tenant dépend du toggle
                  partageDDT côté fiche locataire (pas côté archive). */}
              {isBienDDT && (
                <span
                  className="text-xs text-muted-foreground shrink-0 inline-flex items-center gap-1"
                  title="Visible aux locataires de ce bien si « Partager DDT » est activé sur leur fiche"
                >
                  <Info size={12} /> DDT
                </span>
              )}
              {/* Visible locataire — réservé aux catégories non-système.
                  Catégories système gouvernées par les toggles fiche locataire. */}
              {ownerType === 'Locataire' && (
                <label
                  className={`flex items-center gap-1.5 text-xs shrink-0 ${isSystemLoc ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  title={isSystemLoc
                    ? 'Géré par les toggles partage* de la fiche locataire'
                    : 'Cocher pour rendre ce document visible au locataire dans son portail'}
                >
                  <input
                    type="checkbox"
                    checked={a.visibleLocataire}
                    disabled={isSystemLoc}
                    onChange={e => onToggleVisible(a, e.target.checked)}
                  />
                  <EyeIcon size={12} className={a.visibleLocataire ? 'text-foreground' : 'text-muted-foreground'} />
                </label>
              )}
              {/* View inline : modale PDF preview pour PDF, nouvel onglet
                  pour les autres types (images, text) car la modale iframe
                  est optimisée pour PDF. */}
              {a.mimeType.startsWith('application/pdf') ? (
                <button
                  className="btn-ghost p-1.5"
                  onClick={() => setPreview({
                    url: `/api/archives/${a.id}?view=1`,
                    filename: a.filename,
                    title: a.filename,
                  })}
                  title="Visualiser"
                >
                  <Eye size={14} />
                </button>
              ) : (a.mimeType.startsWith('image/') || a.mimeType.startsWith('text/')) ? (
                <a
                  className="btn-ghost p-1.5"
                  href={`/api/archives/${a.id}?view=1`}
                  target="_blank"
                  rel="noreferrer"
                  title="Visualiser"
                >
                  <Eye size={14} />
                </a>
              ) : null}
              <a
                className="btn-ghost p-1.5"
                href={`/api/archives/${a.id}`}
                title="Télécharger"
              >
                <Download size={14} />
              </a>
              <button
                className="btn-ghost p-1.5 text-red-600 hover:text-red-700"
                onClick={() => onDelete(a)}
                title="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </li>
            );
          })}
        </ul>
      )}
      {preview && (
        <PdfPreviewModal
          url={preview.url}
          filename={preview.filename}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
