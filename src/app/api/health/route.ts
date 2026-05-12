import { NextResponse } from 'next/server';
import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');

interface CheckResult {
  ok: boolean;
  detail?: string;
  ms?: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - start };
}

async function checkDb(): Promise<CheckResult> {
  try {
    const { ms } = await timed(() => prisma.$queryRaw`SELECT 1`);
    return { ok: true, ms };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'unknown' };
  }
}

async function checkFs(): Promise<CheckResult> {
  try {
    await access(UPLOADS_DIR, constants.W_OK);
    return { ok: true, detail: UPLOADS_DIR };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : 'unknown' };
  }
}

async function checkInsee(): Promise<CheckResult> {
  // HEAD léger pour ne pas charger toute la série, avec timeout court
  // pour ne pas bloquer le healthcheck si l'INSEE est lent.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3_000);
  try {
    const { value: r, ms } = await timed(() =>
      fetch('https://api.insee.fr/series/BDM/V1/data/SERIES_BDM/001515333', {
        method: 'HEAD',
        signal: controller.signal,
      }),
    );
    return { ok: r.ok || r.status === 200, detail: `HTTP ${r.status}`, ms };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error
        ? (e.name === 'AbortError' ? 'timeout 3s' : e.message)
        : 'unknown',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Healthcheck sans authentification. Utilisé par :
 *   - HEALTHCHECK Docker pour valider la disponibilité du conteneur
 *   - Sondes externes (UptimeRobot, etc.)
 *
 * Statut HTTP :
 *   200 → DB et FS OK (INSEE non bloquant : si KO, status 'degraded')
 *   503 → DB ou FS KO (le conteneur est non-fonctionnel)
 */
export async function GET() {
  const [db, fs, insee] = await Promise.all([checkDb(), checkFs(), checkInsee()]);

  const critical = db.ok && fs.ok;
  const status = critical
    ? (insee.ok ? 'ok' : 'degraded')
    : 'down';

  const body = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? 'unknown',
    checks: { db, fs, insee },
  };

  return NextResponse.json(body, { status: critical ? 200 : 503 });
}
