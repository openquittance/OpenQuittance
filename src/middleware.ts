import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

// v3.3.0 Session 1 — `/install` wizard public sur instance vierge
// (zéro admin). La détection `hasAnyAdmin()` requiert Prisma → pas
// possible dans middleware Edge. La redirection /install ↔ /login se
// fait dans les Server Components des pages /, /login, /install
// (lookup DB côté Node runtime).
const PUBLIC_PATHS = ['/login', '/register', '/setup', '/install', '/a-propos'];
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/register', '/api/setup', '/api/install', '/api/public', '/api/health'];

// Routes du portail locataire (cf. docs/PORTAIL-LOCATAIRE.md).
// Public au sens "pas d'auth staff requise" mais nécessitent une session
// avec role=TENANT. La page /portail/login elle-même est ouverte (form mail).
const PORTAIL_PUBLIC_PATHS = ['/portail/login', '/portail/login/verify'];
const PORTAIL_API_PUBLIC_PREFIXES = ['/api/portail/login']; // demande + verify magic link
const PORTAIL_PROTECTED_PREFIX = '/portail';
const PORTAIL_API_PROTECTED_PREFIX = '/api/portail';

// Routes accessibles quand l'utilisateur est en attente de validation 2FA
// (post-Google avec TOTP activé).
const MFA_PENDING_ALLOWED = new Set([
  '/verify-2fa',
  '/login',
]);
const MFA_PENDING_API_ALLOWED_PREFIXES = [
  '/api/auth',
  '/api/2fa-verify',
];

function isPublicInvitation(pathname: string): boolean {
  return pathname.startsWith('/invitations/') || pathname.startsWith('/api/invitations/');
}

/** Construit une réponse next() avec headers no-cache + x-pathname forward.
 *  IMPORTANT: on CLONE les headers de la requête entrante (Cookie, Content-Type,
 *  Authorization, etc.) et on AJOUTE x-pathname. Sans ce clone, NextAuth ne reçoit
 *  ni le cookie CSRF (→ MissingCSRF) ni le Content-Type (→ body vide → CredentialsSignin). */
function ok(req: NextRequest, pathname: string): NextResponse {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.headers.set('Pragma', 'no-cache');
  res.headers.set('Expires', '0');
  return res;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth as ({ user?: { role?: string }; mfaPending?: boolean } | null);
  const mfaPending = !!session?.mfaPending;
  const role = session?.user?.role;
  const isTenant = role === 'TENANT';
  const isStaff = role === 'ADMIN' || role === 'MEMBER' || role === 'VIEWER';

  // Si MFA pending, on bloque tout sauf la page de validation et ses APIs.
  if (mfaPending) {
    const apiAllowed = pathname.startsWith('/api/')
      && MFA_PENDING_API_ALLOWED_PREFIXES.some(p => pathname.startsWith(p));
    if (!MFA_PENDING_ALLOWED.has(pathname) && !apiAllowed) {
      return NextResponse.redirect(new URL('/verify-2fa', req.url));
    }
  }

  // ─── Isolation portail locataire ──────────────────────────────────────
  // Routes publiques du portail (login form + verify magic link) : OK
  if (PORTAIL_PUBLIC_PATHS.includes(pathname)
      || PORTAIL_API_PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    // Un TENANT déjà loggué qui retape /portail/login → redirect direct au portail
    if (isTenant && pathname === '/portail/login') {
      return NextResponse.redirect(new URL('/portail', req.url));
    }
    return ok(req, pathname);
  }

  // Routes /portail/* protégées : nécessitent role=TENANT
  if (pathname.startsWith(PORTAIL_PROTECTED_PREFIX)
      || pathname.startsWith(PORTAIL_API_PROTECTED_PREFIX)) {
    if (!session) {
      // Non auth → page de login portail (avec callbackUrl pour redirection post-auth)
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
      }
      const url = new URL('/portail/login', req.url);
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
    if (!isTenant) {
      // Staff qui accède au portail : refuser. Pas de fuite d'info — on
      // redirige vers le dashboard staff (ou 403 sur l'API).
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/', req.url));
    }
    return ok(req, pathname);
  }

  // v3.3.2 hotfix : les pages d'invitation `/invitations/[token]` et
  // l'API `/api/invitations/[token]` doivent être accessibles MÊME
  // pour un user avec session TENANT existante. Cas réel : un
  // bailleur invite sa femme (déjà locataire dans l'app) comme
  // MEMBER staff → email contient `/invitations/[token]`. Sans ce
  // check anticipé, le middleware ligne suivante (isTenant) redirige
  // vers `/portail` car `/invitations/...` n'est pas dans
  // PUBLIC_PATHS, ce qui bloque l'acceptation de l'invitation staff.
  //
  // Sécurité : le token est cryptographiquement sécurisé
  // (generateToken). La page /invitations/[token] vérifie
  // expiration/acceptation. L'acceptation POST exige une session
  // valide (créée via signin manuel après inscription).
  if (isPublicInvitation(pathname)) {
    return ok(req, pathname);
  }

  // Inversement : un TENANT qui tente d'accéder aux routes staff → redirect portail
  if (isTenant) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }
    // Public paths (login, register, a-propos) restent accessibles
    if (!PUBLIC_PATHS.includes(pathname)
        && !PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL('/portail', req.url));
    }
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    // /a-propos, /setup et /install restent accessibles même quand on
    // est loggué (page marketing / wizards). Le Server Component
    // /install décide lui-même quoi faire (redirect /login si admin
    // existe, sinon render wizard). /login et /register par contre
    // redirigent vers le dashboard quand on a déjà une session staff.
    //
    // v3.3.1 hotfix : sans /install dans ALWAYS_ACCESSIBLE, un user
    // avec JWT stale (session ADMIN pré-`docker compose down -v`) qui
    // accède une instance vierge (DB reset) provoquait :
    //   / → page redirect /install (zéro admin)
    //   /install → middleware redirect / (isStaff + pas ALWAYS_ACCESSIBLE)
    //   loop infini ERR_TOO_MANY_REDIRECTS
    const ALWAYS_ACCESSIBLE = pathname === '/setup'
      || pathname === '/a-propos'
      || pathname === '/install';
    if (isStaff && !ALWAYS_ACCESSIBLE && !mfaPending) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    return ok(req, pathname);
  }

  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) {
    return ok(req, pathname);
  }

  if (isPublicInvitation(pathname)) {
    return ok(req, pathname);
  }

  if (pathname.startsWith('/api')) {
    if (!session) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    return ok(req, pathname);
  }

  if (!session) {
    const url = new URL('/login', req.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  return ok(req, pathname);
});

export const config = {
  matcher: ['/', '/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
