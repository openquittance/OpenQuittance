import { NextResponse } from 'next/server';
import { getAppConfig, hasAnyAdmin } from '@/lib/app-config';

export const dynamic = 'force-dynamic';

// Endpoint public, sans auth: exposé pour permettre aux pages /login et /register
// d'adapter leur UI selon le mode d'inscription configuré et l'état de l'instance.
export async function GET() {
  const cfg = await getAppConfig();
  const adminExists = await hasAnyAdmin();
  return NextResponse.json({
    appName: cfg?.appName ?? 'Quittances',
    registrationMode: cfg?.registrationMode ?? 'CLOSED',
    // Premier user: aucun admin n'existe encore → /register est ouvert sans condition
    isFirstUser: !adminExists,
  });
}
