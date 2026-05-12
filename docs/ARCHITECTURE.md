# Architecture — OpenQuittance

Vue d'ensemble technique. Public cible : développeurs qui
contribuent / forks / intègrent.

## Stack

| Couche               | Techno                                         |
|----------------------|------------------------------------------------|
| Frontend             | Next.js 14 App Router, React 18, TypeScript    |
| Styling              | Tailwind CSS 3 + `tailwindcss-animate`         |
| State client         | React hooks + SWR-like fetch patterns          |
| Forms                | react-hook-form + Zod resolver                 |
| Auth                 | NextAuth v5 beta (credentials + Google OAuth)  |
| ORM                  | Prisma 5                                       |
| Database             | PostgreSQL 15                                  |
| PDF generation       | PDFKit (server-side stream)                    |
| Email                | nodemailer (SMTP) + googleapis (Gmail API)     |
| Cloud storage        | @aws-sdk/client-s3 (+ Drive via googleapis)    |
| Crypto               | Node `crypto` (AES-256-GCM, scrypt, SHA256)    |
| 2FA                  | otplib (TOTP RFC 6238)                         |
| PWA                  | Service Worker custom + manifest               |
| Tests                | `tsx` pour scripts purs (pas de Jest)          |
| E2E                  | Playwright (smoke tests + screenshots)         |
| Deployment           | Docker Compose (NAS Synology, VPS Linux, etc.) |

## Structure code

```
quittances-app/
├── src/
│   ├── app/                   # App Router (pages + API routes)
│   │   ├── api/               # 80 endpoints REST
│   │   ├── (pages staff)      # /, /bailleurs, /biens, /locataires, /quittances, …
│   │   ├── parametres/        # Email, IRL, backup, intégrations, membres, …
│   │   ├── portail/           # Pages locataire authentifié
│   │   ├── install/           # Wizard 3 étapes première install
│   │   ├── mentions-legales/[slug]/    # Pages publiques LCEN
│   │   ├── politique-confidentialite/[slug]/ # RGPD art. 13
│   │   └── layout.tsx         # Root layout (PWA meta, ThemeProvider)
│   │
│   ├── components/            # Composants partagés
│   │   ├── layout/            # AppShell, Sidebar, ThemeToggle, StaffFooter
│   │   ├── Modal.tsx, EmptyState.tsx, Skeleton.tsx, Spinner.tsx
│   │   ├── PdfPreviewModal.tsx, EmailPreviewModal.tsx
│   │   ├── LocataireForm.tsx, ArchiveManager.tsx
│   │   ├── Logo.tsx           # SVG inline LogoHorizontal + LogoIcon
│   │   └── DashboardAlertes.tsx, CommandPalette.tsx
│   │
│   ├── lib/                   # Business logic, helpers
│   │   ├── prisma.ts          # Singleton Prisma client
│   │   ├── auth-helpers.ts    # session + role checks
│   │   ├── multi-bailleur.ts  # withBailleurScope + requireResourceInScope
│   │   ├── access-control.ts  # role-based gates (ADMIN > MEMBER > VIEWER)
│   │   ├── crypto.ts          # AES-256-GCM encrypt/decrypt
│   │   ├── audit.ts           # log + query audit
│   │   ├── irl.ts             # calculs IRL, fetch INSEE
│   │   ├── insee.ts           # client API INSEE
│   │   ├── pdf/               # PDFKit helpers (génération PDFs)
│   │   ├── email/             # send (Gmail API + SMTP) + templates
│   │   ├── backup/            # runner, scheduler, S3, Drive
│   │   ├── integrations/      # Google OAuth state machines
│   │   ├── hooks/             # useIsMobile, etc.
│   │   ├── validation.ts      # tous les Zod schemas
│   │   ├── utils.ts           # formatMontant, moisLabel, dates FR
│   │   ├── bailleur-context.tsx # provider bailleur actif (client-side)
│   │   ├── branding.ts        # couleur + logo bailleur
│   │   ├── app-config.ts      # AppConfig singleton (installed flag, etc.)
│   │   └── invitations.ts     # token magic link tenant + staff
│   │
│   ├── middleware.ts          # Routing auth (public/staff/tenant)
│   ├── auth.ts                # NextAuth config (providers + callbacks)
│   └── instrumentation.ts     # OpenTelemetry-ready hook
│
├── prisma/
│   ├── schema.prisma          # ~25 models
│   ├── migrations/            # SQL migrations versionnées
│   └── seed.ts                # Seed dev (bailleurs / biens / locataires fictifs)
│
├── public/                    # Static assets
│   ├── logo*.svg              # Logos sources (utilisés par manifest, pas par React)
│   ├── logo-{192,512,180}.png # PWA icons générés via sharp
│   ├── manifest.json          # PWA manifest
│   ├── sw.js                  # Service Worker (cache app shell)
│   └── favicon.svg
│
├── scripts/                   # CLI tools
│   ├── setup.mjs              # Wizard install Docker first-time
│   ├── rotate-uploads-key.mjs # Rotation UPLOADS_ENCRYPTION_KEY
│   ├── gen-pwa-icons.mjs      # Génère PNG depuis SVG via sharp
│   ├── restore.mjs            # Restaure backup ZIP
│   └── screenshots.mts        # Capture screenshots via Playwright
│
├── tests/                     # Tests purs (tsx, no Jest)
│   ├── v3-*.test.mts          # Tests T127..T137 (hotfix v3.x)
│   ├── multi-bailleur-*.mts   # Tests isolation server-side
│   ├── portail-isolation.mts  # Tests scope tenant
│   ├── security-rgpd-v280.test.mts # Tests conformité RGPD
│   └── uploads-crypto.test.mts # Tests AES-256-GCM uploads
│
└── docs/                      # Cette doc
    ├── ARCHITECTURE.md  (← tu es ici)
    ├── USER-GUIDE.md, API.md, FAQ.md, GLOSSAIRE.md
    ├── INSTALL.md, BACKUP.md, RGPD.md
    ├── MULTI-BAILLEUR.md, PORTAIL-LOCATAIRE.md
    ├── SECURITE-CONFORMITE.md, CHIFFREMENT-UPLOADS.md
    └── SESSION-LOGS.md (interne, pas en repo public)
```

## Modèle données

Vue simplifiée des relations principales (Prisma schema) :

```
User ─┬─< Membership (role: ADMIN|MEMBER|VIEWER) >─┬─ Bailleur
      │                                              │
      ├─< Invitation                                 │
      ├─ tenantId (si TENANT)                       │
      │                                              ├─< Bien ─< Locataire ─< Quittance
      └─< AuditLog                                  │             │              │
                                                    │             │              ├─ Avoir
                                                    │             │              └─ EmailLog
                                                    │             │
                                                    │             ├─< Archive (Bien)
                                                    │             ├─< Archive (Locataire)
                                                    │             ├─< RevisionIrl
                                                    │             └─< PortailToken
                                                    │
                                                    ├─< AnnonceTemplate
                                                    ├─< IrlIndice
                                                    ├─< BackupRun
                                                    └─< (config bailleur : pdfCouleur, logoUrl, …)

AppConfig (singleton)
  installed: bool
  emailMethod: 'gmail_api' | 'smtp'
  gmailRefreshTokenEnc, smtpHost, smtpPort, smtpUserEnc, smtpPassEnc
  inseeApiKeyEnc, backupConfigEnc, …
```

Schema complet : `prisma/schema.prisma`.

## Flow authentification

### Staff (admin / member / viewer)

```
1. /login (page)
2. credentials provider : POST /api/auth/callback/credentials
   → verify password (scrypt) + 2FA si activé
   → emit JWT (cookie httpOnly + secure)
3. Cookie envoyé sur chaque request
4. middleware.ts lit JWT, set req.headers.user
5. Server Components / API routes lisent session via auth() helper
6. requireAdmin/requireStaff gates les accès
```

### Google OAuth

```
1. Click "Continuer avec Google" → redirect Google
2. Callback /api/auth/callback/google
3. signIn callback (src/auth.ts) :
   - User existe + non disabled → ok
   - 1er user de l'instance → créé ADMIN auto (Bootstrap)
   - User n'existe pas + invitation pending → créé + ok
   - Sinon → access denied
4. events.signIn : auto-accept invitation pending
5. JWT emit → cookie
```

### Tenant (locataire portail)

```
1. /portail/login (saisie email)
2. POST /api/portail/login : crée magic-link token (1h TTL)
   → email envoyé via SMTP/Gmail app
3. Locataire clique lien : /portail/login/verify?token=...
4. POST /api/portail/login/verify : valide token + create session
   credentials provider type "tenant"
5. JWT tenant emit (cookie séparé du staff)
6. middleware.ts route /portail/* uniquement si JWT tenant
```

Détails dans [PORTAIL-LOCATAIRE.md](PORTAIL-LOCATAIRE.md).

## Multi-bailleur

Chaque User a 0..N `Membership { bailleurId, role }`. Le bailleur
actif est sélectionné côté UI (BailleurProvider). Toutes les
requêtes API staff incluent `bailleurId` en query param ou
header, validé server-side via `withBailleurScope()`.

Helpers clés (`src/lib/multi-bailleur.ts`) :
- `withBailleurScope(req, fn)` : extrait bailleurId, vérifie
  membership, exécute fn.
- `requireResourceInScope(prisma, id, scope)` : vérifie qu'une
  ressource (bien, locataire, quittance) appartient bien au
  bailleur actif → 403 sinon.

Détails dans [MULTI-BAILLEUR.md](MULTI-BAILLEUR.md).

## Chiffrement

### Secrets app (DB)

Stockés chiffrés avec `ENCRYPTION_SECRET` (.env) → AES-256-GCM
+ scrypt KDF. Helpers `lib/crypto.ts` : `encrypt(plain)` /
`decrypt(cipher)`. Préfixe `enc:v1:` pour versioning futur.

Champs concernés : `gmailRefreshTokenEnc`, `smtpPassEnc`,
`inseeApiKeyEnc`, `backupConfigEnc`, etc.

### Uploads (filesystem)

Fichiers (logos, signatures, archives propriétaire, archives
locataire) chiffrés AES-256-GCM avant écriture disque avec
`UPLOADS_ENCRYPTION_KEY` (.env, distinct du ENCRYPTION_SECRET).

Détails dans [CHIFFREMENT-UPLOADS.md](CHIFFREMENT-UPLOADS.md).

### Rotation

`scripts/rotate-uploads-key.mjs` : déchiffre tous les fichiers
avec ancienne clé + re-chiffre avec nouvelle. Pas de downtime.

## PDF generation

Pipeline (`src/lib/pdf/`) :

1. Helper `streamPdf(res, builderFn)` instancie un `PDFDocument`
   PDFKit, pipe vers `res`, appelle `builderFn(doc, data)`.
2. `builderFn` reçoit les données métier + bailleur branding
   (couleur, logo, signature).
3. Sections : header (logo + bailleur), corps (montants, dates),
   footer (signature + mention).
4. PDF retourné en streaming → pas de stockage intermédiaire.

Documents générés : quittance, avis d'échéance, courrier IRL,
attestation dépôt de garantie, état des lieux.

## PWA

`src/app/layout.tsx` métadonnées :
- `manifest: '/manifest.json'`
- `appleWebApp: { capable, statusBarStyle, title }`
- `icons: { icon, apple }` (PNG + SVG)
- `viewport: { themeColor }`

`public/sw.js` : SW minimal install + activate (skipWaiting +
clients.claim) + fetch passthrough.

`src/components/PwaInstaller.tsx` : enregistre SW au montage
client-side.

`scripts/gen-pwa-icons.mjs` : régénère icônes PNG depuis SVG via
sharp (192, 512, maskable 192/512, Apple 180).

## Backup

Pipeline (`src/lib/backup/`) :

1. **Trigger** : node-cron schedule (configurable AppConfig) ou
   manuel `/api/admin/backup/run`.
2. **Snapshot** : dump SQL via `pg_dump` (spawn child process)
   + lecture uploads chiffrés.
3. **Build ZIP** : archiver streams to memory buffer.
4. **Encrypt env.enc** : `.env` chiffré avec passphrase user.
5. **Upload** : S3-compatible (PutObject) ou Drive (resumable
   upload).
6. **BackupRun** : log status + duration + size + error.

Restauration : `scripts/restore.mjs` (extract + `psql` restore
+ déchiffre uploads).

Détails dans [BACKUP.md](BACKUP.md).

## Tests

Pas de Jest — tests purs `npx tsx tests/v3-*.test.mts`.

Pattern :

```ts
const results: Array<{ ok: boolean; name: string }> = [];
function assert(name, cond, detail?) {
  results.push({ ok: cond, name });
  console.log(`  ${cond ? '✓' : '✗'} ${name}…`);
}
// ... assertions
process.exit(results.every(r => r.ok) ? 0 : 1);
```

Tests groupés par feature/hotfix (`v3-pwa-setup`,
`v3-mobile-overflow-fix`, `multi-bailleur-isolation`, etc.).

Sont des "smoke tests" + "regression tests" — vérifient présence
de patterns critiques (imports, props, comportement attendu) via
file checks. Pas de mocks complexes.

E2E : Playwright (smoke + screenshots), `scripts/screenshots.mts`.

## Déploiement

Voir [INSTALL.md](INSTALL.md). TL;DR :

1. `git clone` + `npm run setup` (wizard interactif).
2. Docker Compose : Postgres + app Next.js.
3. Reverse proxy (Nginx, Caddy, Traefik) + TLS Let's Encrypt.
4. Backup cron + monitoring santé (`/api/health`).

## Sécurité

- CSP + HSTS via `next.config.js`.
- CSRF native Next.js App Router.
- Cookies httpOnly + secure + sameSite=lax.
- 2FA TOTP optionnelle.
- Audit log (login, modifs sensibles, exports RGPD).
- Rate limiting basique sur `/api/portail/login`.

Détails dans [SECURITE-CONFORMITE.md](SECURITE-CONFORMITE.md).
