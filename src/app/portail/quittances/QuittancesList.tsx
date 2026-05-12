'use client';

import { useState } from 'react';
import { Eye, Download } from 'lucide-react';
import PdfPreviewModal from '@/components/PdfPreviewModal';
import { formatMontant, moisLabel, formatDateFr } from '@/lib/utils';

export interface QuittanceRow {
  id: string;
  mois: number;
  annee: number;
  montantTotal: number;
  datePaiement: string;
  bienAdresse: string;
}

export default function QuittancesList({ quittances }: { quittances: QuittanceRow[] }) {
  const [preview, setPreview] = useState<{ url: string; filename: string; title: string } | null>(null);

  const view = (q: QuittanceRow) => {
    setPreview({
      url: `/api/portail/quittances/${q.id}/pdf`,
      filename: `Quittance_${moisLabel(q.mois)}_${q.annee}.pdf`,
      title: `Quittance ${moisLabel(q.mois)} ${q.annee}`,
    });
  };

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b border-border">
            <tr>
              <th className="px-4 py-3">Mois</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Payé le</th>
              <th className="px-4 py-3">Adresse</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {quittances.map(q => (
              <tr key={q.id} className="border-b border-border/50">
                <td className="px-4 py-3 font-medium">{moisLabel(q.mois)} {q.annee}</td>
                <td className="px-4 py-3">{formatMontant(q.montantTotal)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDateFr(q.datePaiement)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{q.bienAdresse}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    className="btn-ghost p-1.5"
                    onClick={() => view(q)}
                    aria-label="Visualiser"
                    title="Visualiser"
                  >
                    <Eye size={14} />
                  </button>
                  <a
                    className="btn-ghost p-1.5"
                    href={`/api/portail/quittances/${q.id}/pdf?download=1`}
                    aria-label="Télécharger"
                    title="Télécharger"
                  >
                    <Download size={14} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {quittances.map(q => (
          <div key={q.id} className="card space-y-2">
            <div className="flex justify-between items-start">
              <p className="font-semibold">{moisLabel(q.mois)} {q.annee}</p>
              <p className="font-semibold">{formatMontant(q.montantTotal)}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Payé le {formatDateFr(q.datePaiement)} · {q.bienAdresse}
            </p>
            {/* v3.6.1 mobile : bouton Aperçu masqué (modal iframe
                non responsive iOS, viewer absent Android). L'unique
                action "Télécharger" ouvre le PDF dans l'app native. */}
            <div className="flex gap-2 pt-1">
              <a
                className="btn-secondary flex-1 text-xs"
                href={`/api/portail/quittances/${q.id}/pdf?download=1`}
              >
                <Download size={14} /> Télécharger
              </a>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <PdfPreviewModal
          url={preview.url}
          filename={preview.filename}
          title={preview.title}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
