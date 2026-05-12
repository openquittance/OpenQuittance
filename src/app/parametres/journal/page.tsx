'use client';

import { useEffect, useState } from 'react';
import { ScrollText, Download, Filter, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/layout/AppShell';
import { formatDateTimeFr } from '@/lib/utils';

interface LogEntry {
  id: string;
  createdAt: string;
  actorId: string;
  actorEmail: string;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: string | null;
  ip: string | null;
}

const ACTION_OPTIONS = [
  '', 'user.login', 'user.logout', 'user.register', 'user.role_change',
  'user.totp_enabled', 'user.totp_disabled', 'user.invite', 'user.invite_accepted',
  'bailleur.create', 'bailleur.update', 'bailleur.delete',
  'bien.create', 'bien.update', 'bien.delete',
  'locataire.create', 'locataire.update', 'locataire.delete',
  'quittance.create', 'quittance.update', 'quittance.delete',
  'quittance.email_sent', 'quittance.email_failed',
  'irl.revision_applied',
  'document.generate', 'archive.upload', 'archive.delete',
  'export.pdf', 'export.xml', 'config.update',
];

function Content() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'ADMIN';

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [actionFilter, setActionFilter] = useState('');
  const [sinceFilter, setSinceFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      if (actionFilter) params.set('action', actionFilter);
      if (sinceFilter) params.set('since', sinceFilter);
      const r = await fetch(`/api/audit?${params.toString()}`);
      const j = await r.json();
      if (r.ok) {
        setLogs(j.logs);
        setTotal(j.total);
        setPageSize(j.pageSize);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => { if (isAdmin) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, actionFilter, sinceFilter, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="card text-center space-y-3 py-12 max-w-md mx-auto">
        <AlertTriangle className="mx-auto text-amber-600" size={32} />
        <h1 className="text-xl font-semibold">Accès refusé</h1>
        <p className="text-sm text-muted-foreground">Le journal d'activité est réservé aux administrateurs.</p>
      </div>
    );
  }

  const totalPages = Math.ceil(total / pageSize);
  const exportUrl = (() => {
    const p = new URLSearchParams();
    p.set('format', 'csv');
    if (actionFilter) p.set('action', actionFilter);
    if (sinceFilter) p.set('since', sinceFilter);
    return `/api/audit?${p.toString()}`;
  })();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScrollText size={22} /> Journal d'activité
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Toutes les actions sensibles : connexions, mutations, exports… {total > 0 && `(${total} entrées)`}
          </p>
        </div>
        <a className="btn-secondary" href={exportUrl}>
          <Download size={14} /> Export CSV
        </a>
      </div>

      <div className="card flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="label flex items-center gap-1"><Filter size={12} /> Action</label>
          <select className="input" value={actionFilter} onChange={e => { setActionFilter(e.target.value); setPage(0); }}>
            {ACTION_OPTIONS.map(a => (
              <option key={a} value={a}>{a || '— Toutes —'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Depuis</label>
          <input type="date" className="input" value={sinceFilter}
            onChange={e => { setSinceFilter(e.target.value); setPage(0); }} />
        </div>
        {(actionFilter || sinceFilter) && (
          <button className="btn-ghost text-xs" onClick={() => { setActionFilter(''); setSinceFilter(''); setPage(0); }}>
            Réinitialiser
          </button>
        )}
      </div>

      {loading ? (
        <div className="card p-0 overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-4 py-3 flex gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-3 flex-1 animate-pulse bg-muted/70 rounded" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, r) => (
            <div key={r} className="px-4 py-3 flex gap-4 items-center border-b border-border/50">
              {Array.from({ length: 6 }).map((_, c) => (
                <div key={c} className="h-4 flex-1 animate-pulse bg-muted/70 rounded" />
              ))}
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-muted-foreground italic">Aucune entrée pour ces critères.</p>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Auteur</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Cible</th>
                <th className="px-4 py-2">IP</th>
                <th className="px-4 py-2">Détail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-border/50 align-top">
                  <td className="px-4 py-2 whitespace-nowrap text-xs">{formatDateTimeFr(l.createdAt)}</td>
                  <td className="px-4 py-2 text-xs">
                    <div>{l.actorName || l.actorEmail}</div>
                    {l.actorName && <div className="text-muted-foreground">{l.actorEmail}</div>}
                  </td>
                  <td className="px-4 py-2"><code className="text-xs">{l.action}</code></td>
                  <td className="px-4 py-2 text-xs">
                    {l.targetType ? `${l.targetType}` : '—'}
                    {l.targetId && <span className="text-muted-foreground"> · {l.targetId.slice(0, 8)}…</span>}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono">{l.ip ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">
                    {l.metadata ? (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">JSON</summary>
                        <pre className="mt-1 text-[10px] bg-muted p-2 rounded max-w-md overflow-x-auto">
{(() => {
  try { return JSON.stringify(JSON.parse(l.metadata), null, 2); }
  catch { return l.metadata; }
})()}
                        </pre>
                      </details>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-between items-center text-sm">
          <button
            className="btn-ghost"
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            <ChevronLeft size={14} /> Précédent
          </button>
          <span className="text-xs text-muted-foreground">Page {page + 1} / {totalPages}</span>
          <button
            className="btn-ghost"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            Suivant <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <AppShell><Content /></AppShell>;
}
