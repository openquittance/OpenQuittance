import { prisma } from './prisma';
import { AppRole } from '@prisma/client';

// TENANT est volontairement EN DEHORS de la hiérarchie staff (niveau -1).
// hasRole(TENANT, VIEWER) === false → exclut systématiquement les TENANT
// des endpoints staff (/api/locataires, /api/quittances, /api/admin, etc.).
// hasRole(TENANT, TENANT) === true → permet de gate les endpoints portail.
const ROLE_LEVELS: Record<AppRole, number> = {
  TENANT: -1,
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
};

export function hasRole(userRole: AppRole, required: AppRole): boolean {
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[required];
}

/** True si le user est dans la hiérarchie staff (VIEWER+). */
export function isStaff(role: AppRole): boolean {
  return ROLE_LEVELS[role] >= ROLE_LEVELS.VIEWER;
}

/**
 * Récupère le rôle de l'utilisateur. Espace partagé donc rôle global.
 */
export async function getUserRole(userId: string): Promise<AppRole | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return u?.role ?? null;
}

/**
 * Helper combiné: vérifie que l'utilisateur est authentifié ET a au moins
 * le rôle requis. Retourne userId si OK, null sinon.
 */
export async function requireRole(userId: string, required: AppRole): Promise<AppRole | null> {
  const role = await getUserRole(userId);
  if (!role) return null;
  return hasRole(role, required) ? role : null;
}
