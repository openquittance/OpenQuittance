import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/access-control';
import { fetchIRLObservations } from '@/lib/insee';
import { periodeId } from '@/lib/irl';
import { ipFromRequest, logAudit } from '@/lib/audit';
import { readInseeCredentials } from '@/lib/insee-config';

export const dynamic = 'force-dynamic';

/**
 * Synchronise la table IndiceIRL avec les valeurs publiées par l'INSEE.
 * Stratégie : upsert systématique (créer si nouveau, mettre à jour si la valeur
 * a été révisée — ce qui arrive parfois pour les indices provisoires).
 *
 * La variation annuelle (n vs n-1) est calculée localement à partir des
 * observations récupérées.
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
    const allObservations = await fetchIRLObservations(apiKey);

    // On ne garde que les 5 dernières années (≈ 20 trimestres). L'IRL a
    // toujours été publié depuis 2008 mais la révision d'un bail ne peut
    // remonter qu'à l'IRL en vigueur lors de la signature ; quelques années
    // d'historique suffisent largement. La table INSEE peut compter > 90 obs.
    const cutoffAnnee = new Date().getFullYear() - 5;
    const observations = allObservations.filter(o => o.annee >= cutoffAnnee);

    // Pour calculer les variations annuelles correctement, on a besoin du
    // trimestre n-1 de chacun, donc on conserve une carte sur l'historique
    // complet (pas seulement le filtré).
    const valuesByPeriode = new Map<number, number>();
    for (const o of allObservations) {
      valuesByPeriode.set(periodeId(o.annee, o.trimestre), o.valeur);
    }

    let inserted = 0;
    let updated = 0;
    for (const o of observations) {
      const periode = periodeId(o.annee, o.trimestre);
      const previousYearKey = periodeId(o.annee - 1, o.trimestre);
      const previousVal = valuesByPeriode.get(previousYearKey);
      const variation = previousVal && previousVal > 0
        ? ((o.valeur - previousVal) / previousVal) * 100
        : null;

      const existing = await prisma.indiceIRL.findUnique({ where: { periode } });
      if (existing) {
        if (existing.valeur !== o.valeur || existing.source !== 'insee') {
          await prisma.indiceIRL.update({
            where: { periode },
            data: { valeur: o.valeur, variation, source: 'insee' },
          });
          updated++;
        }
      } else {
        await prisma.indiceIRL.create({
          data: {
            periode,
            annee: o.annee,
            trimestre: o.trimestre,
            valeur: o.valeur,
            variation,
            source: 'insee',
          },
        });
        inserted++;
      }
    }

    // Purge les anciens indices INSEE au-delà de la fenêtre 5 ans, pour
    // éviter d'accumuler 20+ ans d'historique inutile au fil des syncs.
    const purged = await prisma.indiceIRL.deleteMany({
      where: { source: 'insee', annee: { lt: cutoffAnnee } },
    });

    await prisma.appConfig.update({
      where: { id: 'singleton' },
      data: { inseeLastSyncAt: new Date() },
    });

    await logAudit({
      actorId: session.user.id,
      action: 'config.update',
      targetType: 'IndiceIRL',
      targetId: 'sync',
      metadata: { sub: 'insee_sync', inserted, updated, purged: purged.count, total: observations.length },
      ip: ipFromRequest(req),
    });

    return NextResponse.json({
      ok: true,
      inserted,
      updated,
      totalObservations: observations.length,
      totalAvailable: allObservations.length,
      latest: observations[observations.length - 1] ?? null,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erreur INSEE inconnue' },
      { status: 502 },
    );
  }
}
