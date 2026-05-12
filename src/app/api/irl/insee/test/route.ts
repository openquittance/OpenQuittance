import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireRole } from '@/lib/access-control';
import { testInseeConnection } from '@/lib/insee';
import { readInseeCredentials } from '@/lib/insee-config';

export const dynamic = 'force-dynamic';

/**
 * Test de connexion à l'API INSEE :
 *   - utilise les credentials enregistrés en base (PUT /api/admin/insee préalable)
 *   - tente le flow OAuth puis fetch la dernière observation IRL
 *   - retourne la valeur la plus récente comme preuve de bon fonctionnement
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (!await requireRole(session.user.id, 'ADMIN')) {
    return NextResponse.json({ error: 'Réservé ADMIN' }, { status: 403 });
  }

  try {
    const { apiKey } = await readInseeCredentials();
    const result = await testInseeConnection(apiKey);
    return NextResponse.json({
      ok: true,
      latest: result.latest,
      totalObservations: result.totalObservations,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur INSEE inconnue' },
      { status: 502 },
    );
  }
}
