import { NextRequest, NextResponse } from 'next/server';
import archiver from 'archiver';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { allowedBailleurIds, handleScopeError } from '@/lib/multi-bailleur';
import { rateLimit } from '@/lib/rate-limit';
import { ipFromRequest, logAudit } from '@/lib/audit';
import { generateBailleurZip, slugify } from '@/lib/zip-export';

export const dynamic = 'force-dynamic';
// Streaming long-running : pas de revalidation Next, pas de body parsing.
export const maxDuration = 300; // 5 min (Vercel cap si jamais)

/**
 * Export ZIP organisé d'un bailleur (v2.7.0 Feature C).
 *
 * GET /api/exports/bailleur/[id]/zip
 *
 *   - Auth : staff session ; ADMIN role sur le bailleur cible (via membership)
 *   - Scope : 404 oracle-free si bailleur hors scope ou inexistant
 *   - Rate-limit : 1 export max / 5 min / user (Q12 cadrage)
 *   - Body : application/zip stream construit via `archiver`
 *   - Headers : Content-Disposition attachment + filename slug-date
 *   - Audit : event `exports.bailleur_zip` avec counts metadata
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;

  // Rate-limit (Q12) — 1 export par user toutes les 5 min
  const rl = rateLimit({
    key: `exports.bailleur_zip:${session.user!.id}`,
    limit: 1,
    windowMs: 5 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Trop d'exports récents. Réessayez dans ${rl.retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  // Scope check : le bailleur doit être dans la liste des memberships du user.
  // Q6 : ADMIN role requis spécifiquement (cohérent avec exports / suppressions).
  const allowed = allowedBailleurIds(session);
  if (!allowed.includes(params.id)) {
    // 404 oracle-free (cf. PORTAIL-LOCATAIRE.md isolation rules)
    return NextResponse.json({ error: 'Bailleur introuvable' }, { status: 404 });
  }

  const memberships = (session.user as { memberships?: Array<{ bailleurId: string; role: string }> }).memberships ?? [];
  const m = memberships.find(x => x.bailleurId === params.id);
  if (!m || m.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Bailleur introuvable' }, { status: 404 });
  }

  const bailleur = await prisma.bailleur.findUnique({
    where: { id: params.id },
    select: { nom: true },
  });
  if (!bailleur) {
    return NextResponse.json({ error: 'Bailleur introuvable' }, { status: 404 });
  }

  try {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
    });

    const counts = await generateBailleurZip(params.id, archive);
    await archive.finalize();
    const buf = await done;

    const dateIso = new Date().toISOString().slice(0, 10);
    const filename = `quittances-export-${slugify(bailleur.nom)}-${dateIso}.zip`;

    await logAudit({
      actorId: session.user!.id,
      action: 'exports.bailleur_zip',
      targetType: 'Bailleur',
      targetId: params.id,
      metadata: {
        bailleurId: params.id,
        sizeBytes: buf.length,
        ...counts,
      },
      ip: ipFromRequest(req),
    });

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    throw e;
  }
}
