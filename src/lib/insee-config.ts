import { prisma } from './prisma';
import { decrypt, isEncrypted } from './crypto';

/**
 * Lit la clé API INSEE en base. La BDM est aujourd'hui en plan "Key Less"
 * (accès anonyme), donc la clé est OPTIONNELLE — on retourne null si
 * aucune clé n'est configurée. La clé est conservée chiffrée pour les
 * éventuels plans payants futurs ou si l'INSEE rétablit l'auth.
 */
export async function readInseeCredentials(): Promise<{ apiKey: string | null }> {
  const cfg = await prisma.appConfig.findUnique({ where: { id: 'singleton' } });
  if (!cfg?.inseeApiSecret) return { apiKey: null };
  const apiKey = isEncrypted(cfg.inseeApiSecret) ? decrypt(cfg.inseeApiSecret) : cfg.inseeApiSecret;
  return { apiKey };
}
