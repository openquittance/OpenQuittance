import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildOAuthClient } from '@/lib/email/gmail-sender';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
];

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  // Utilise NEXTAUTH_URL (URL publique) plutôt que req.nextUrl.origin qui retourne
  // l'adresse interne du container (0.0.0.0:3000) derrière un reverse proxy.
  const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;
  const callbackUrl = `${baseUrl.replace(/\/$/, '')}/api/gmail/callback`;
  let oauth2;
  try {
    oauth2 = await buildOAuthClient(callbackUrl);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Credentials Google manquants' },
      { status: 400 },
    );
  }

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: session.user.id,
  });

  return NextResponse.redirect(url);
}
