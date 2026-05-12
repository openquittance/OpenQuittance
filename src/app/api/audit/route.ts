import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds } from '@/lib/multi-bailleur';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/**
 * Liste paginée du journal d'activité.
 *
 * Renommé `/api/audit` (sortie de `/api/admin/*`) car accessible à tout
 * staff avec données filtrées par memberships (cf.
 * docs/MULTI-BAILLEUR.md). Le préfixe `/api/admin/*` reste réservé aux
 * opérations strictement app-level.
 *
 * Filtres optionnels :
 *   ?action=quittance.create  (égalité exacte)
 *   ?actorId=<id>             (égalité exacte)
 *   ?since=2025-01-01         (date min, ISO)
 *   ?page=0                   (offset, 50 par page)
 *   ?format=csv               (export CSV au lieu de JSON)
 *
 * Filtrage par memberships : on ne montre QUE les entrées dont
 * `metadata.bailleurId` est dans le scope. Les entrées sans
 * bailleurId (auth/portail/admin app) ne sont visibles que par
 * `User.role === 'ADMIN'` app-level.
 */
export async function GET(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;
  const isAppAdmin = (session.user as { role?: string }).role === 'ADMIN';

  const sp = req.nextUrl.searchParams;
  const action = sp.get('action');
  const actorId = sp.get('actorId');
  const since = sp.get('since');
  const page = Math.max(0, parseInt(sp.get('page') ?? '0', 10) || 0);
  const format = sp.get('format');

  const allowed = allowedBailleurIds(session);

  // Le metadata est stocké en JSON string, donc on filtre côté SQL via
  // contains. Un user non-admin ne voit que les entrées dont la metadata
  // string contient "bailleurId":"<un de ses bailleurs>".
  const bailleurFilter = isAppAdmin
    ? {}
    : {
        OR: allowed.map(b => ({
          metadata: { contains: `"bailleurId":"${b}"` },
        })),
      };

  const where = {
    ...(action ? { action } : {}),
    ...(actorId ? { actorId } : {}),
    ...(since ? { createdAt: { gte: new Date(since) } } : {}),
    ...(allowed.length > 0 ? bailleurFilter : { id: '__never__' }),
  };

  if (format === 'csv') {
    const all = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000,
      include: { actor: { select: { email: true, name: true } } },
    });
    const header = 'createdAt,actorEmail,actorName,action,targetType,targetId,ip,metadata';
    const rows = all.map(a => {
      const cells = [
        a.createdAt.toISOString(),
        a.actor.email,
        a.actor.name ?? '',
        a.action,
        a.targetType ?? '',
        a.targetId ?? '',
        a.ip ?? '',
        (a.metadata ?? '').replace(/"/g, '""'),
      ].map(v => `"${String(v)}"`);
      return cells.join(',');
    });
    const csv = [header, ...rows].join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { email: true, name: true } } },
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize: PAGE_SIZE,
    logs: logs.map(l => ({
      id: l.id,
      createdAt: l.createdAt,
      actorId: l.actorId,
      actorEmail: l.actor.email,
      actorName: l.actor.name,
      action: l.action,
      targetType: l.targetType,
      targetId: l.targetId,
      metadata: l.metadata,
      ip: l.ip,
    })),
  });
}
