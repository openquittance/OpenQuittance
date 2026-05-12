import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { buildOAuthClient } from '@/lib/email/gmail-sender';
import { encryptOptional } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Derrière le reverse proxy, req.url retourne l'origine interne du container
  // (http://0.0.0.0:3000). On utilise NEXTAUTH_URL pour produire des redirects
  // vers l'URL publique.
  const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;
  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, baseUrl));

  const session = await auth();
  if (!session?.user?.id) {
    return redirectTo('/login');
  }

  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!code) {
    return redirectTo('/parametres/email?error=missing_code');
  }
  if (state !== session.user.id) {
    return redirectTo('/parametres/email?error=state_mismatch');
  }

  try {
    const callbackUrl = `${baseUrl.replace(/\/$/, '')}/api/gmail/callback`;
    const oauth2 = await buildOAuthClient(callbackUrl);
    const { tokens } = await oauth2.getToken(code);

    if (!tokens.refresh_token) {
      return redirectTo('/parametres/email?error=no_refresh_token');
    }

    const grantedScope = tokens.scope ?? '';
    if (!grantedScope.includes('gmail.send')) {
      return redirectTo('/parametres/email?error=missing_gmail_send_scope');
    }

    oauth2.setCredentials(tokens);
    const oauth2api = google.oauth2({ version: 'v2', auth: oauth2 });
    const userinfo = await oauth2api.userinfo.get();

    // Chiffrement AES-256-GCM des tokens OAuth avant stockage
    const encAccessToken = encryptOptional(tokens.access_token ?? null);
    const encRefreshToken = encryptOptional(tokens.refresh_token);
    const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    await prisma.parametres.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        emailMethod: 'gmail_api',
        gmailAccessToken: encAccessToken,
        gmailRefreshToken: encRefreshToken,
        gmailTokenExpiry: tokenExpiry,
        gmailEmail: userinfo.data.email ?? null,
        gmailScope: grantedScope,
      },
      update: {
        emailMethod: 'gmail_api',
        gmailAccessToken: encAccessToken,
        gmailRefreshToken: encRefreshToken,
        gmailTokenExpiry: tokenExpiry,
        gmailEmail: userinfo.data.email ?? null,
        gmailScope: grantedScope,
      },
    });

    return redirectTo('/parametres/email?connected=1');
  } catch (e) {
    console.error('Gmail OAuth error', e);
    return redirectTo('/parametres/email?error=oauth_failed');
  }
}
