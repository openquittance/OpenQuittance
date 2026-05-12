import 'next-auth';
import 'next-auth/jwt';

type AppRoleClient = 'ADMIN' | 'MEMBER' | 'VIEWER' | 'TENANT';
type StaffRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

interface Membership {
  bailleurId: string;
  role: StaffRole;
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role?: AppRoleClient;
      // Memberships m:n vers Bailleur, chargés par jwt callback.
      // Vide pour TENANT (scope via Locataire.tenantUserId).
      memberships?: Membership[];
    };
    mfaPending?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    role?: AppRoleClient;
    mfaPending?: string;
    memberships?: Membership[];
  }
}
