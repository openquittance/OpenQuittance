import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { decrypt, encrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/backup/drive/oauth/callback
 *
 * ADMIN only. Reçoit le code OAuth, échange contre refresh_token,
 * récupère email du compte, persiste en DB chiffré.
 *
 * v3.1.0-rc10 : credentials Google lus depuis AppConfig DB (saisis via
 * UI), plus depuis process.env.
 */
export async function GET(req: NextRequest) {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '');

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/parametres/backup?drive_error=${encodeURIComponent(error)}`,
    );
  }
  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/parametres/backup?drive_error=missing_code`,
    );
  }

  const cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg?.googleDriveClientId || !cfg?.googleDriveClientSecret) {
    return NextResponse.redirect(
      `${baseUrl}/parametres/backup?drive_error=missing_oauth_config`,
    );
  }

  let clientId: string;
  let clientSecret: string;
  try {
    clientId = decrypt(cfg.googleDriveClientId);
    clientSecret = decrypt(cfg.googleDriveClientSecret);
  } catch (e) {
    return NextResponse.redirect(
      `${baseUrl}/parametres/backup?drive_error=${encodeURIComponent('decrypt_failed: ' + (e instanceof Error ? e.message : String(e)))}`,
    );
  }

  const redirectUri = `${baseUrl}/api/admin/backup/drive/oauth/callback`;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      return NextResponse.redirect(
        `${baseUrl}/parametres/backup?drive_error=no_refresh_token`,
      );
    }

    oauth2.setCredentials(tokens);
    const userinfo = google.oauth2({ version: 'v2', auth: oauth2 });
    let email: string | null = null;
    try {
      const me = await userinfo.userinfo.get();
      email = me.data.email ?? null;
    } catch {
      // Non-bloquant.
    }

    await prisma.appConfig.update({
      where: { id: 'singleton' },
      data: {
        backupDriveRefreshToken: encrypt(tokens.refresh_token),
        backupDriveAccountEmail: email,
        backupStorageType: 'drive',
      },
    });

    return NextResponse.redirect(
      `${baseUrl}/parametres/backup?drive_connected=1`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.redirect(
      `${baseUrl}/parametres/backup?drive_error=${encodeURIComponent(msg)}`,
    );
  }
}
