/** @type {import('next').NextConfig} */

// v2.8.0 quick win sécu : headers HTTP appliqués sur toutes les routes.
// 'unsafe-inline' + 'unsafe-eval' nécessaires pour Next.js (hydration
// React + eval-source-map en dev). Durcir nécessiterait nonces serveur,
// ROI faible vs complexité actuelle.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

// v3.1.0 — packages Node-only que webpack doit traiter comme externes
// pour le runtime serveur. Critique pour instrumentation.ts qui transitivement
// charge scheduler → runner → zip-export → pdf-generator → pdfkit + googleapis
// + archiver (tous utilisent http/https/stream/zlib natifs).
const NODE_NATIVE_EXTERNALS = [
  'pdfkit',
  '@prisma/client',
  'bcryptjs',
  'googleapis',
  'googleapis-common',
  'google-auth-library',
  'gaxios',
  'gcp-metadata',
  'https-proxy-agent',
  'http-proxy-agent',
  'agent-base',
  '@aws-sdk/client-s3',
  '@aws-sdk/lib-storage',
  'node-cron',
  'archiver',
  'compress-commons',
  'zip-stream',
  'png-js',
  'browserify-zlib',
  'nodemailer',
];

const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: NODE_NATIVE_EXTERNALS,
    // v3.1.0 Phase 2 — register() dans src/instrumentation.ts pour boot
    // hook scheduler backup (node-cron). Default true en Next.js 15+ ;
    // 14.x nécessite ce flag explicite.
    instrumentationHook: true,
  },
  webpack: (config, { isServer, nextRuntime }) => {
    // v3.1.0 — instrumentation.ts charge transitivement scheduler →
    // runner → zip-export → pdf-generator + archiver + googleapis +
    // node-cron + AWS SDK. Ces packages utilisent http/https/net/stream/
    // zlib/fs natifs Node que webpack ne sait pas résoudre côté bundle.
    // Marque toute la liste comme commonjs externals → webpack laisse
    // les `require()` natifs au runtime.
    if (isServer) {
      const list = Array.isArray(config.externals) ? config.externals : (config.externals ? [config.externals] : []);
      list.push(({ request }, callback) => {
        if (typeof request === 'string'
          && NODE_NATIVE_EXTERNALS.some(pkg => request === pkg || request.startsWith(`${pkg}/`))) {
          return callback(null, `commonjs ${request}`);
        }
        return callback();
      });
      config.externals = list;
    }

    // v3.1.0-rc8 — bundle Edge runtime ne doit PAS compiler scheduler /
    // runner / notifier / zip-export (utilisent `node:fs` et autres
    // schemes natifs absents en Edge). Aliasé vers un stub vide pour
    // que l'import dynamique dans instrumentation.ts résolve trivialement
    // côté Edge sans tracer l'arbre transitif. En runtime Node, le check
    // `process.env.NEXT_RUNTIME !== 'nodejs'` early return évite l'appel.
    if (nextRuntime === 'edge') {
      const path = require('path');
      const backupStub = path.resolve(__dirname, 'src/lib/backup/edge-stub.js');
      const integrationsStub = path.resolve(__dirname, 'src/lib/integrations/edge-stub.js');
      config.resolve.alias = {
        ...config.resolve.alias,
        [path.resolve(__dirname, 'src/lib/backup/scheduler')]: backupStub,
        [path.resolve(__dirname, 'src/lib/backup/scheduler.ts')]: backupStub,
        // v3.2.0-rc2 — bundle Edge ne doit pas compiler integrations/google
        // (utilise crypto natif + Prisma).
        [path.resolve(__dirname, 'src/lib/integrations/google')]: integrationsStub,
        [path.resolve(__dirname, 'src/lib/integrations/google.ts')]: integrationsStub,
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
