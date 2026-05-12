import { NextResponse } from 'next/server';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { locatairesEligiblesRevision } from '@/lib/irl';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  try {
    const allowed = allowedBailleurIds(session);
    const eligibles = await locatairesEligiblesRevision(allowed);
    return NextResponse.json({
      eligibles: eligibles.map(e => ({
        locataireId: e.locataire.id,
        nom: e.locataire.nom,
        prenom: e.locataire.prenom,
        bienId: e.locataire.bienId,
        prochaineDate: e.prochaineDate,
        ancienLoyer: e.calcul.ancienLoyer,
        nouveauLoyer: e.calcul.nouveauLoyer,
        variation: e.calcul.variation,
        irlReference: e.calcul.irlReference,
        irlNouveau: e.calcul.irlNouveau,
        trimestre: e.calcul.trimestre,
      })),
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
