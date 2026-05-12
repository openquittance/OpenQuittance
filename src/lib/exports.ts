import { prisma } from '@/lib/prisma';
import type { Bailleur, Bien, Locataire, Quittance } from '@prisma/client';

export interface ExportFilters {
  userId: string;
  bailleurId: string;
  du: Date;
  au: Date;
  bienId?: string | null;
  locataireId?: string | null;
}

export interface ExportData {
  bailleur: Bailleur;
  rows: Array<Quittance & {
    locataire: Locataire & { bien: Bien };
  }>;
  filters: ExportFilters;
}

export async function loadExportData(f: ExportFilters): Promise<ExportData> {
  const bailleur = await prisma.bailleur.findUnique({ where: { id: f.bailleurId } });
  if (!bailleur) throw new Error('Bailleur introuvable');

  const bienIdFilter: { id?: string } = f.bienId ? { id: f.bienId } : {};

  const where = {
    locataire: {
      ...(f.locataireId ? { id: f.locataireId } : {}),
      bien: {
        bailleurId: f.bailleurId,
        ...bienIdFilter,
      },
    },
    dateEmission: { gte: f.du, lte: f.au },
  };

  const rows = await prisma.quittance.findMany({
    where,
    include: { locataire: { include: { bien: true } } },
    orderBy: [{ annee: 'asc' }, { mois: 'asc' }, { locataire: { nom: 'asc' } }],
  });

  return { bailleur, rows, filters: f };
}
