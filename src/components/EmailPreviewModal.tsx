'use client';

import { useEffect, useState } from 'react';
import { Send, Mail, AlertTriangle, Download } from 'lucide-react';
import { toast } from 'sonner';
import Modal from './Modal';
import { useIsMobile } from '@/lib/hooks/useIsMobile';

interface PreviewData {
  to: string; subject: string; body: string;
  method: 'gmail_api' | 'smtp';
  gmailEmail: string | null; smtpUser: string | null;
  pdfUrl: string;
}

interface Props {
  quittanceId: string;
  fallbackEmail?: string;
  onClose: () => void;
  onSent: () => void;
}

export default function EmailPreviewModal({ quittanceId, fallbackEmail, onClose, onSent }: Props) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [to, setTo] = useState('');
  const [editedSubject, setEditedSubject] = useState('');
  const [editedBody, setEditedBody] = useState('');
  const [sending, setSending] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const { isMobile } = useIsMobile();

  useEffect(() => {
    fetch(`/api/quittances/${quittanceId}/preview`)
      .then(r => r.json())
      .then((d: PreviewData) => {
        setData(d);
        setTo(d.to || fallbackEmail || '');
        setEditedSubject(d.subject);
        setEditedBody(d.body);
      });
  }, [quittanceId, fallbackEmail]);

  if (!data) {
    return (
      <Modal open onClose={onClose} title="Aperçu de l'email" maxWidth="max-w-3xl">
        <p className="text-muted-foreground">Chargement…</p>
      </Modal>
    );
  }

  const send = async () => {
    if (!to) { toast.error('Destinataire requis'); return; }
    setSending(true);
    try {
      const r = await fetch(`/api/quittances/${quittanceId}/email`, {
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
      onSent();
    } finally { setSending(false); }
  };

  const fromLabel = data.method === 'gmail_api'
    ? (data.gmailEmail ? `Gmail • ${data.gmailEmail}` : 'Gmail (non connecté)')
    : (data.smtpUser ? `SMTP • ${data.smtpUser}` : 'SMTP (non configuré)');

  return (
    <Modal open onClose={onClose} title="Aperçu et envoi" maxWidth="max-w-4xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Mail size={14} /> Envoyé via {fromLabel}
          </div>

          {!to && (
            <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
              <AlertTriangle size={14} /> Aucun email enregistré pour ce locataire.
            </div>
          )}

          <div>
            <label className="label">Destinataire</label>
            <input className="input" value={to} onChange={e => setTo(e.target.value)} placeholder="adresse@example.com" />
          </div>
          <div>
            <label className="label">Objet</label>
            <input className="input" value={editedSubject} readOnly />
          </div>
          <div>
            <label className="label">Corps</label>
            <textarea className="input min-h-[180px]" value={editedBody} readOnly />
          </div>
          <p className="text-xs text-muted-foreground">
            Pour modifier le template, allez dans Paramètres &gt; Email.
          </p>
        </div>

        {/* v3.6.2 — sur mobile : iframe PDF inutile (Chrome Android
            sans viewer, Safari iOS non responsive). Remplace par
            lien download direct. */}
        {isMobile ? (
          <div className="space-y-3">
            <span className="text-xs text-muted-foreground">Pièce jointe</span>
            <a
              href={data.pdfUrl.replace(/([?&])(?:inline|view)=1(&|$)/g, (_m, p, s) => s ? p : '')}
              download
              className="btn-secondary w-full"
            >
              <Download size={16} /> Télécharger l'aperçu PDF
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Pièce jointe : aperçu PDF</span>
              <button className="text-xs text-primary hover:underline" onClick={() => setShowPdf(s => !s)}>
                {showPdf ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            {showPdf ? (
              <iframe src={data.pdfUrl} className="w-full h-[500px] rounded border border-border" />
            ) : (
              <div className="border border-dashed border-border rounded p-6 text-center text-sm text-muted-foreground bg-muted/30">
                Aperçu masqué (cliquez "Afficher" ci-dessus pour le charger)
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-border mt-4">
        <button className="btn-secondary" onClick={onClose} disabled={sending}>Annuler</button>
        <button className="btn-primary" onClick={send} disabled={sending || !to}>
          <Send size={14} /> {sending ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </Modal>
  );
}
