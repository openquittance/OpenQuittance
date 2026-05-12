import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { decrypt } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/backup/drive/oauth/start
 *
 * ADMIN only. Redirige vers Google OAuth consent screen avec scope
 * minimal `drive.file` (accès uniquement aux fichiers créés par l'app).
 *
 * v3.1.0-rc10 : credentials lus depuis AppConfig (chiffrés enc:v1:),
 * plus depuis process.env. La saisie se fait via UI Paramètres > Backup.
 */
export async function GET() {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;

  const cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg?.googleDriveClientId || !cfg?.googleDriveClientSecret) {
    return NextResponse.json(
      {
        error: 'Configurez votre Client ID et Client Secret Google dans Paramètres > Backup avant de connecter Google Drive. Cf. docs/BACKUP.md section "Configurer un backup Google Drive".',
      },
      { status: 400 },
    );
  }

  let clientId: string;
  let clientSecret: string;
  try {
    clientId = decrypt(cfg.googleDriveClientId);
    clientSecret = decrypt(cfg.googleDriveClientSecret);
  } catch (e) {
    return NextResponse.json(
      { error: `Impossible de déchiffrer les credentials Google : ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '');
  const redirectUri = `${baseUrl}/api/admin/backup/drive/oauth/callback`;

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });

  return NextResponse.redirect(url);
}
