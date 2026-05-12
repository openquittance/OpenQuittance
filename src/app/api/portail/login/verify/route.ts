import { NextRequest, NextResponse } from 'next/server';
import { signIn } from '@/auth';
import { rateLimit, clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Verify magic link : appelé via le lien du mail.
 *
 * Le handler GET est juste une page de redirection : la vraie consommation
 * se fait via l'action `signIn('magic-link')` qui POST sur le callback
 * NextAuth. On délègue au composant client `/portail/login/verify`
 * (Lot C) le déclenchement de signIn pour permettre la mise à jour du
 * cookie de session.
 *
 * Cette route serveur sert uniquement à appliquer le rate limit IP +
 * rediriger vers la page client. Le token reste dans l'URL.
 */
export async function GET(req: NextRequest) {
  // Derrière le reverse proxy, req.url retourne l'origine interne du
  // container (http://0.0.0.0:3000). On utilise NEXTAUTH_URL pour produire
  // les redirects publics (cf. fix du Gmail callback v2.0.x).
  const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;
  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, baseUrl));

  const ip = clientIp(req);
  const rl = rateLimit({
    key: `portal-verify:${ip}`,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Réessayez plus tard.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    );
  }

  const token = req.nextUrl.searchParams.get('token');
  if (!token) return redirectTo('/portail/login?error=missing_token');

  // signIn server-side : consomme le token via le provider 'magic-link'
  // et set le cookie de session. Si le token est invalide/expiré/consommé,
  // l'authorize retourne null et NextAuth redirige avec ?error=...
  try {
    await signIn('magic-link', {
      token,
      redirect: true,
      redirectTo: '/portail',
    });
    return redirectTo('/portail');
  } catch (e: unknown) {
    // signIn peut throw NEXT_REDIRECT si redirect:true — on laisse passer
    if (e && typeof e === 'object' && 'digest' in e
        && typeof (e as { digest?: string }).digest === 'string'
        && (e as { digest: string }).digest.startsWith('NEXT_REDIRECT')) {
      throw e;
    }
    return redirectTo('/portail/login?error=invalid_token');
  }
}
