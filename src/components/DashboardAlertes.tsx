'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Info, ArrowRight, Bell } from 'lucide-react';

interface Alerte {
  type: 'bail_expire' | 'revision_irl' | 'quittance_manquante';
  severity: 'info' | 'warning';
  locataireId: string;
  label: string;
  detail: string;
  action: { label: string; href: string };
}

export default function DashboardAlertes({ bailleurId }: { bailleurId: string }) {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/alertes?bailleurId=${bailleurId}`)
      .then(r => r.json())
      .then(j => setAlertes(j.alertes || []))
      .catch(() => setAlertes([]))
      .finally(() => setLoading(false));
  }, [bailleurId]);

  if (loading) return null;
  if (alertes.length === 0) return null;

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <Bell size={18} className="text-amber-600" />
        <h2 className="font-medium">Alertes ({alertes.length})</h2>
      </div>
      <ul className="divide-y divide-border">
        {alertes.map((a, i) => (
          <li key={i} className="py-2.5 flex items-start gap-3">
            {a.severity === 'warning' ? (
              <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <Info size={16} className="text-sky-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{a.label}</p>
              <p className="text-xs text-muted-foreground">{a.detail}</p>
            </div>
            <Link
              href={a.action.href}
              className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
            >
              {a.action.label} <ArrowRight size={12} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
