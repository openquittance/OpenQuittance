import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { updateAppConfig } from '@/lib/app-config';
import { logAudit, ipFromRequest } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/install/complete
 *
 * v3.3.0-rc1 — finalise l'install : marque
 * `AppConfig.setupCompleted=true`. Requiert session ADMIN active.
 *
 * Appelé par InstallWizard après création admin + bailleur.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Non authentifié' },
      { status: 401 },
    );
  }
  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') {
    return NextResponse.json(
      { error: 'Réservé aux administrateurs' },
      { status: 403 },
    );
  }

  await updateAppConfig({ setupCompleted: true });

  await logAudit({
    actorId: session.user.id,
    action: 'install.completed',
    targetType: 'AppConfig',
    targetId: 'singleton',
    metadata: { viaWizard: true },
    ip: ipFromRequest(req),
  });

  return NextResponse.json({ ok: true });
}
