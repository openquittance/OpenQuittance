import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { requireResourceInScope, handleScopeError } from '@/lib/multi-bailleur';
import { moisLabel, formatMontant } from '@/lib/utils';

export const dynamic = 'force-dynamic';

function fillTemplate(tpl: string, args: { nom: string; prenom: string; mois: number; annee: number; montant: number; bailleur: string }): string {
  return tpl
    .replace(/\{nom\}/g, args.nom)
    .replace(/\{prenom\}/g, args.prenom)
    .replace(/\{mois\}/g, moisLabel(args.mois))
    .replace(/\{annee\}/g, String(args.annee))
    .replace(/\{montant\}/g, formatMontant(args.montant))
    .replace(/\{bailleur\}/g, args.bailleur);
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  try {
    const quittance = await requireResourceInScope(session, allowed =>
      prisma.quittance.findFirst({
        where: {
          id: params.id,
          locataire: { bien: { bailleurId: { in: allowed } } },
        },
        include: { locataire: { include: { bien: { include: { bailleur: true } } } } },
      })
    );

    const parametres = await prisma.parametres.findUnique({ where: { userId: session.user!.id } });
    if (!parametres) return NextResponse.json({ error: 'Configurez votre email d\'abord' }, { status: 404 });

    const args = {
      nom: quittance.locataire.nom,
      prenom: quittance.locataire.prenom,
      mois: quittance.mois,
      annee: quittance.annee,
      montant: quittance.montantTotal,
      bailleur: quittance.locataire.bien.bailleur.nom,
    };
    let body = fillTemplate(parametres.emailCorpsTemplate, args);
    if (quittance.commentaire) body = `${body}\n\n---\n${quittance.commentaire}`;

    return NextResponse.json({
      to: quittance.locataire.email ?? '',
      subject: fillTemplate(parametres.emailObjetTemplate, args),
      body,
      method: parametres.emailMethod,
      gmailEmail: parametres.gmailEmail,
      smtpUser: parametres.smtpUser,
      pdfUrl: `/api/quittances/${quittance.id}/pdf?inline=1`,
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
