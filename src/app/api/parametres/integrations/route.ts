import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireStaffSession, isError } from '@/lib/auth-helpers';
import { integrationsConfigSchema } from '@/lib/validation';
import { encryptOptional } from '@/lib/crypto';
import { invalidateGoogleCredentialsCache } from '@/lib/integrations/google';

export const dynamic = 'force-dynamic';

const SECRET_MASK = '***';

/**
 * v3.2.0-rc1 — endpoint admin pour configurer les intégrations externes
 * (Google OAuth login + Gmail API).
 *
 * Pattern symétrique à `/api/parametres/backup` (rc10) :
 *   - GET retourne secrets masqués `'***'` si configurés, null sinon.
 *     Indique également la source (`db` / `env` / `none`).
 *   - POST préserve valeur DB existante si payload === `'***'` (sentinelle
 *     UI qui ne touche pas le champ). Sinon chiffre + persiste.
 *
 * Auth ADMIN only (clés OAuth = sensibles).
 */

function maskSecret(value: string | null): string | null {
  return value ? SECRET_MASK : null;
}

/**
 * Détermine la source des credentials Google :
 *   - `db`   : configurés en DB (priorité, pattern v3.2.0+)
 *   - `env`  : configurés en `.env` legacy (rétro-compat)
 *   - `none` : non configurés
 */
function detectSource(cfg: { googleClientId: string | null }) {
  if (cfg.googleClientId) return 'db' as const;
  if (process.env.GOOGLE_CLIENT_ID) return 'env' as const;
  return 'none' as const;
}

export async function GET() {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;

  const cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg) {
    return NextResponse.json({
      googleClientId: null,
      googleClientSecret: null,
      source: 'none' as const,
    });
  }

  return NextResponse.json({
    googleClientId: maskSecret(cfg.googleClientId),
    googleClientSecret: maskSecret(cfg.googleClientSecret),
    source: detectSource(cfg),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireStaffSession('ADMIN');
  if (isError(session)) return session;

  const body = await req.json();
  const parsed = integrationsConfigSchema.safeParse(body);
  if (!parsed.success) {
    console.error(
      '[parametres/integrations] Zod validation failed :',
      JSON.stringify(parsed.error.issues),
    );
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Récupère config existante pour préserver secrets si masqués `'***'`.
  const existing = await prisma.appConfig.findUnique({
    where: { id: 'singleton' },
  });

  const clientId = data.googleClientId === SECRET_MASK
    ? existing?.googleClientId ?? null
    : encryptOptional(data.googleClientId);
  const clientSecret = data.googleClientSecret === SECRET_MASK
    ? existing?.googleClientSecret ?? null
    : encryptOptional(data.googleClientSecret);

  const updateData = {
    googleClientId: clientId,
    googleClientSecret: clientSecret,
  };

  const saved = await prisma.appConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...updateData },
    update: updateData,
  });

  console.log(
    `[parametres/integrations] saved googleClientId=${saved.googleClientId ? 'set' : 'null'} `
    + `googleClientSecret=${saved.googleClientSecret ? 'set' : 'null'}`,
  );

  // v3.2.0-rc2 — invalidate cache pour que Gmail API utilise les nouvelles
  // creds immédiatement. Note : NextAuth login Google nécessite restart
  // container (provider init au boot, cf. instrumentation.ts).
  invalidateGoogleCredentialsCache();

  return NextResponse.json({
    googleClientId: maskSecret(saved.googleClientId),
    googleClientSecret: maskSecret(saved.googleClientSecret),
    source: detectSource(saved),
  });
}
