import { NextRequest, NextResponse } from 'next/server';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { withBailleurScope, handleScopeError } from '@/lib/multi-bailleur';
import { exportSchema } from '@/lib/validation';
import { loadExportData } from '@/lib/exports';
import { buildQuittancesXml } from '@/lib/xml-export';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await requireStaffSession('VIEWER');
  if (isError(session)) return session;

  const body = await req.json();
  const parsed = exportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    const { bailleurId } = withBailleurScope(session, parsed.data.bailleurId);
    const data = await loadExportData({
      userId: session.user!.id,
      bailleurId,
      du: new Date(parsed.data.du),
      au: new Date(parsed.data.au),
      bienId: parsed.data.bienId ?? null,
      locataireId: parsed.data.locataireId ?? null,
    });

    const xml = buildQuittancesXml(data);
    const filename = `quittances_${parsed.data.du}_${parsed.data.au}.xml`;

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const r = handleScopeError(e); if (r) return r;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
