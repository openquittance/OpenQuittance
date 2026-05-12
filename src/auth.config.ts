import type { NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';

// v3.2.0-rc2 — credentials Google lus depuis process.env qui est
// pré-populé par instrumentation.ts au boot depuis AppConfig DB
// (prio DB > env legacy). Si DB et .env vides, le provider est créé
// mais NextAuth refuse les requêtes Google login (clientId vide).
// Acceptable : message d'erreur clair côté UI signIn.
//
// Trade-off : NextAuth init providers au boot = synchrone. Changement
// credentials via UI nécessite restart container pour prise en compte
// par login. Gmail API (gmail-sender.ts) lit dynamiquement → effet
// immédiat post-save.
export const authConfig: NextAuthConfig = {
  // Indispensable quand l'app est derrière un reverse proxy
  // (Cloudflare / Reverse Proxy Synology). Sans ça, NextAuth refuse
  // les requêtes et /api/auth/session retourne 500.
  trustHost: true,

  pages: { signIn: '/login' },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
        session.user.role = (token.role as 'ADMIN' | 'MEMBER' | 'VIEWER' | 'TENANT') ?? 'MEMBER';
        // Memberships chargés par jwt callback (cf. src/auth.ts).
        // Vide pour TENANT (lien via Locataire.tenantUserId).
        const memberships = (token.memberships as { bailleurId: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' }[] | undefined) ?? [];
        (session.user as { memberships?: typeof memberships }).memberships = memberships;
      }
      // Expose le flag 2FA pending au middleware (pour rediriger vers /verify-2fa)
      if (token.mfaPending) {
        (session as { mfaPending?: boolean }).mfaPending = true;
      }
      return session;
    },
  },
};
