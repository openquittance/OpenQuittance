import { prisma } from './prisma';
import type { AppConfig } from '@prisma/client';

export async function getAppConfig(): Promise<AppConfig | null> {
  return prisma.appConfig.findUnique({ where: { id: 'singleton' } });
}

export async function ensureAppConfig(): Promise<AppConfig> {
  const existing = await getAppConfig();
  if (existing) return existing;
  return prisma.appConfig.create({ data: { id: 'singleton' } });
}

export async function updateAppConfig(data: Partial<AppConfig>): Promise<AppConfig> {
  return prisma.appConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...data },
    update: data,
  });
}

/** Existe-t-il au moins un admin dans la DB ? (= app installée) */
export async function hasAnyAdmin(): Promise<boolean> {
  const c = await prisma.user.count({ where: { role: 'ADMIN' } });
  return c > 0;
}

/** Le setup initial est-il complété ? (admin existe + AppConfig créée) */
export async function isSetupComplete(): Promise<boolean> {
  const cfg = await getAppConfig();
  if (!cfg?.setupCompleted) return false;
  return hasAnyAdmin();
}

/** Mode d'inscription actuel. CLOSED par défaut si AppConfig absent. */
export async function getRegistrationMode(): Promise<'CLOSED' | 'INVITATION_ONLY'> {
  const cfg = await getAppConfig();
  return cfg?.registrationMode ?? 'CLOSED';
}
