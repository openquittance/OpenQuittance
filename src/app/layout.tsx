import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'sonner';
import ThemeProvider from '@/components/ThemeProvider';
import AuthSessionProvider from '@/components/SessionProvider';
import PwaInstaller from '@/components/PwaInstaller';

// Force le rendu dynamique sur toutes les pages: empêche que des pages
// protégées (dashboard, etc.) soient mises en cache statique et servies
// sans passer par le middleware d'authentification.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'OpenQuittance',
  description: 'OpenQuittance — application open source de gestion locative',
  // v3.5.0 — PWA manifest + Apple Web App support.
  manifest: '/manifest.json',
  applicationName: 'OpenQuittance',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OpenQuittance',
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/logo-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/logo-512.png', type: 'image/png', sizes: '512x512' },
      { url: '/logo.svg', type: 'image/svg+xml', sizes: 'any' },
    ],
    apple: [
      { url: '/logo-180.png', sizes: '180x180', type: 'image/png' },
      { url: '/logo.svg', type: 'image/svg+xml' },
    ],
  },
};

// v3.5.0 — viewport explicite pour comportement mobile + theme color
// (teinte de la barre tâches Android Chrome + barre status iOS).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthSessionProvider>
            {children}
            <Toaster richColors position="top-right" theme="system" />
            <PwaInstaller />
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
