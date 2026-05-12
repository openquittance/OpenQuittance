import { NextRequest, NextResponse } from 'next/server';
import { requireUserId, isError } from '@/lib/auth-helpers';
import { envoyerTestEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const userId = await requireUserId();
  if (isError(userId)) return userId;

  try {
    const { to } = await req.json();
    if (!to) return NextResponse.json({ error: 'Destinataire requis' }, { status: 400 });
    await envoyerTestEmail({ userId, to });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
