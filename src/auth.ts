import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { loginSchema } from '@/lib/validation';
import { authConfig } from './auth.config';
import { getRegistrationMode, hasAnyAdmin, ensureAppConfig } from './lib/app-config';
import { logAudit } from './lib/audit';
import {
  decryptTotpSecret,
  verifyTotpToken,
  deserializeBackupCodes,
  consumeBackupCode,
  serializeBackupCodes,
} from './lib/totp';
import { rateLimit, clientIp } from './lib/rate-limit';
import { consumeMagicLink } from './lib/portail-magic';
import { acceptInvitation } from './lib/invitations';

// Erreur custom propagée au front via le query param "code" : permet à la page
// /login de basculer en mode "saisie TOTP" plutôt que d'afficher "credentials
// invalides".
class TotpRequired extends CredentialsSignin {
  code = 'totp_required';
}
class TotpInvalid extends CredentialsSignin {
  code = 'totp_invalid';
}
class RateLimited extends CredentialsSignin {
  code = 'rate_limited';
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...authConfig.providers,
    Credentials({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
        // Champs optionnels du second facteur : le front les passe quand
        // l'utilisateur a le 2FA activé.
        totpToken: { label: 'Code TOTP', type: 'text' },
        backupCode: { label: 'Code de secours', type: 'text' },
      },
      async authorize(creds, request) {
        // Rate limit login : 5 tentatives / 15 min / IP. Bloque les
        // attaques par brute-force credential stuffing.
        const ip = request ? clientIp(request as Request) : 'unknown';
        const rl = rateLimit({
          key: `login:${ip}`,
          limit: 5,
          windowMs: 15 * 60 * 1000,
        });
        if (!rl.allowed) {
          throw new RateLimited();
        }

        const parsed = loginSchema.safeParse(creds);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user || !user.password) return null;
        if (user.disabledAt) return null; // compte désactivé (orphan ou manuel)

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        // 2FA : si activé, on exige soit un code TOTP soit un code de secours.
        if (user.totpEnabled) {
          const totpToken = typeof creds?.totpToken === 'string' ? creds.totpToken : '';
          const backupCode = typeof creds?.backupCode === 'string' ? creds.backupCode : '';

          if (!totpToken && !backupCode) {
            // 1er tour : credentials valides mais 2FA requis. Le front bascule
            // en saisie TOTP grâce au code 'totp_required'.
            throw new TotpRequired();
          }

          let secondFactorOk = false;

          if (totpToken && user.totpSecret) {
            const secret = decryptTotpSecret(user.totpSecret);
            secondFactorOk = verifyTotpToken(totpToken, secret);
          }
          if (!secondFactorOk && backupCode) {
            const codes = deserializeBackupCodes(user.backupCodes);
            const updated = await consumeBackupCode(backupCode, codes);
            if (updated) {
              secondFactorOk = true;
              await prisma.user.update({
                where: { id: user.id },
                data: { backupCodes: serializeBackupCodes(updated) },
              });
            }
          }

          if (!secondFactorOk) {
            throw new TotpInvalid();
          }
        }

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    // Provider dédié au portail locataire : pas d'email/password, juste un
    // token magic link consommé en base (cf. lib/portail-magic.ts).
    Credentials({
      id: 'magic-link',
      name: 'Magic Link',
      credentials: {
        token: { label: 'Token', type: 'text' },
      },
      async authorize(creds) {
        const tokenStr = typeof creds?.token === 'string' ? creds.token : '';
        if (!tokenStr) return null;
        const userId = await consumeMagicLink(tokenStr);
        if (!userId) return null;
        // Re-load avec les détails (consumeMagicLink a déjà vérifié role+disabledAt)
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, image: true, disabledAt: true, role: true },
        });
        if (!user || user.disabledAt || user.role !== 'TENANT') return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === 'credentials') return true;

      if (account?.provider === 'google') {
        if (!user.email) return false;
        const lowerEmail = user.email.toLowerCase();
        const existing = await prisma.user.findUnique({
          where: { email: lowerEmail },
          select: { id: true, role: true },
        });

        // Cas 1 : user existant — login OK quel que soit le rôle.
        // Si invitation pending pour cet email, events.signIn appellera
        // acceptInvitation pour upgrade rôle + créer memberships
        // (cas réel rc11 v3.4.0 : femme TENANT existante invitée
        // comme MEMBER staff).
        if (existing) return true;

        // Cas 2 : nouveau user via Google + premier user → ADMIN auto.
        const isFirstUser = !(await hasAnyAdmin());
        if (isFirstUser) {
          await ensureAppConfig();
          // L'adapter Prisma va créer le user; jwt callback promote ADMIN.
          return true;
        }

        // Cas 3 : nouveau user — accepter si invitation pending matchée.
        const invitation = await prisma.invitation.findFirst({
          where: {
            email: lowerEmail,
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        if (invitation) {
          // events.signIn finalisera (acceptInvitation) après création
          // user par adapter.
          return true;
        }

        // Cas 4 : mode CLOSED ou pas d'invitation → refus explicite.
        const mode = await getRegistrationMode();
        if (mode === 'CLOSED') return false;
        return false;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user?.id) token.userId = user.id;

      if (token.userId) {
        // Promote first-ever user to ADMIN (utile quand le compte vient
        // d'être créé via Google). On EXCLUT explicitement les TENANT :
        // un locataire qui se logue alors qu'il n'y a pas encore d'admin
        // ne doit jamais être promu (cas typique : staff supprime tous
        // les admins puis un locataire utilise son magic link).
        const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
        if (adminCount === 0) {
          const updated = await prisma.user.updateMany({
            where: { id: token.userId as string, role: { not: 'TENANT' } },
            data: { role: 'ADMIN' },
          });
          if (updated.count > 0) await ensureAppConfig();
        }
        const u = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { role: true, totpEnabled: true, mfaSessionId: true, mfaVerifiedAt: true },
        });
        token.role = u?.role ?? 'MEMBER';

        // Re-fetch BailleurMembership à chaque hit authentifié (cf.
        // docs/MULTI-BAILLEUR.md). Coût mesuré ~0.5ms par requête sur
        // index userId, acceptable. Permet ajout/retrait de membership
        // sans imposer un re-login.
        // Vide pour TENANT (scope via Locataire.tenantUserId).
        if (u?.role !== 'TENANT') {
          const rows = await prisma.bailleurMembership.findMany({
            where: { userId: token.userId as string, role: { not: 'TENANT' } },
            select: { bailleurId: true, role: true },
          });
          token.memberships = rows.map(r => ({
            bailleurId: r.bailleurId,
            role: r.role as 'ADMIN' | 'MEMBER' | 'VIEWER',
          }));
        } else {
          token.memberships = [];
        }

        // ── 2FA gate pour les logins via OAuth (Google) ──
        // Si le user a TOTP activé ET vient de se connecter via Google,
        // on émet un nonce mfaPending; le user doit valider TOTP via
        // /verify-2fa pour libérer son JWT.
        if (account?.provider === 'google' && u?.totpEnabled) {
          const nonce = randomBytes(16).toString('hex');
          await prisma.user.update({
            where: { id: token.userId as string },
            data: { mfaSessionId: nonce, mfaVerifiedAt: null },
          });
          token.mfaPending = nonce;
        }

        // Refresh ultérieur : si le user a validé son TOTP, libérer le JWT.
        if (token.mfaPending && u) {
          if (u.mfaSessionId === token.mfaPending && u.mfaVerifiedAt) {
            delete (token as Record<string, unknown>).mfaPending;
          }
        }
      }
      return token;
    },
  },
  // Events: callbacks non-bloquants utilisés pour l'audit log. L'IP n'est pas
  // disponible ici (NextAuth ne la propage pas) — on se contente du provider.
  events: {
    async signIn({ user, account, isNewUser }) {
      if (!user.id) return;

      // v3.4.0-rc1 — auto-accept pending invitation matching user.email.
      // Couvre :
      // - Nouveau user Google via invitation (signIn callback laisse
      //   passer si invitation pending, adapter crée user role MEMBER
      //   default, ici on upgrade au rôle invitation + on crée
      //   memberships).
      // - User existant (TENANT/MEMBER/etc.) qui clique invitation et
      //   se connecte via Google : on upgrade rôle si nécessaire et on
      //   ajoute les memberships du bailleur invité.
      // Idempotent : acceptInvitation throw si déjà accepté → catch
      // silencieux. Email match strict requis (sécurité).
      if (user.email && account?.provider === 'google') {
        try {
          const lowerEmail = user.email.toLowerCase();
          const pending = await prisma.invitation.findFirst({
            where: {
              email: lowerEmail,
              acceptedAt: null,
              expiresAt: { gt: new Date() },
            },
          });
          if (pending) {
            await acceptInvitation(pending.token, user.id);
          }
        } catch (e) {
          console.error('[auth/events.signIn] auto-accept invitation error :', e);
        }
      }

      await logAudit({
        actorId: user.id,
        action: 'user.login',
        targetType: 'User',
        targetId: user.id,
        metadata: { provider: account?.provider, isNewUser: !!isNewUser },
      });
    },
    async signOut(message) {
      const userId = 'token' in message ? message.token?.userId : message.session?.userId;
      if (typeof userId !== 'string') return;
      await logAudit({
        actorId: userId,
        action: 'user.logout',
        targetType: 'User',
        targetId: userId,
      });
    },
  },
});
