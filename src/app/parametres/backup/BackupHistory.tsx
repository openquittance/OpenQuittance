'use client';

import { useEffect, useState, useRef } from 'react';

interface BackupRunRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  sizeBytes: string | null;
  errorMessage: string | null;
  manifestS3Key: string | null;
  bailleursCount: number | null;
  zipsCount: number | null;
}

function formatBytes(bytes: string | null): string {
  if (!bytes) return '—';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function statusBadge(status: string): { label: string; cls: string } {
  if (status === 'success') return { label: 'Succès', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' };
  if (status === 'failed') return { label: 'Échec', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' };
  if (status === 'running') return { label: 'En cours', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' };
  return { label: status, cls: 'bg-muted text-foreground' };
}

export default function BackupHistory() {
  const [runs, setRuns] = useState<BackupRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BackupRunRow | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRuns = async () => {
    try {
      const r = await fetch('/api/admin/backup/runs');
      if (r.ok) {
        const j = await r.json();
        setRuns(j.runs ?? []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  // Auto-refresh 30s si un run est `running`
  useEffect(() => {
    const hasRunning = runs.some(r => r.status === 'running');
    if (hasRunning && !intervalRef.current) {
      intervalRef.current = setInterval(fetchRuns, 30_000);
    } else if (!hasRunning && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runs]);

  if (loading) return <p className="text-muted-foreground text-sm">Chargement de l'historique…</p>;
  if (runs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm card">
        Aucun backup pour l'instant. Lancez un backup manuel ou attendez le prochain run programmé.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Historique ({runs.length} dernier{runs.length > 1 ? 's' : ''})</h2>
        <button type="button" className="btn-sm" onClick={fetchRuns}>Actualiser</button>
      </div>
      <div className="overflow-x-auto card p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-left px-3 py-2 font-medium">Durée</th>
              <th className="text-left px-3 py-2 font-medium">Taille</th>
              <th className="text-left px-3 py-2 font-medium">Bailleurs</th>
              <th className="text-left px-3 py-2 font-medium">Statut</th>
              <th className="text-left px-3 py-2 font-medium">Erreur</th>
              <th className="text-left px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map(r => {
              const badge = statusBadge(r.status);
              return (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.startedAt).toLocaleString('fr-FR')}</td>
                  <td className="px-3 py-2">{formatDuration(r.startedAt, r.finishedAt)}</td>
                  <td className="px-3 py-2">{formatBytes(r.sizeBytes)}</td>
                  <td className="px-3 py-2">{r.bailleursCount ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${badge.cls}`}>{badge.label}</span>
                  </td>
                  <td className="px-3 py-2 max-w-[280px] truncate text-xs font-mono text-red-700 dark:text-red-400" title={r.errorMessage ?? ''}>
                    {r.errorMessage ? r.errorMessage : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" className="text-xs underline" onClick={() => setSelected(r)}>
                      Détails
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}
        >
          <div
            className="card max-w-2xl w-full max-h-[80vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Détails du backup</h3>
              <button type="button" className="text-sm" onClick={() => setSelected(null)}>×</button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap bg-muted/30 p-3 rounded">
{JSON.stringify(selected, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
