# Changelog

Toutes les modifications notables d'OpenQuittance sont documentées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) ·
Versioning : [Semantic Versioning](https://semver.org/lang/fr/).

## [Unreleased]

À venir : Phase 7 (Docker Hub auto-build).

---

## [3.7.1] — 2026-05-12 (Documentation complète avant push public)

Phase 6 Session 1bis : audit doc avant publication OpenQuittance
public. 7 trous identifiés, 6 nouveaux docs créés + README
refresh majeur.

### Added

- `docs/USER-GUIDE.md` (new) : guide utilisateur final non-dev.
  Couvre install → bailleur → email → bien → locataire →
  quittance → portail → IRL → membres → backup → exports →
  documents propriétaire. Captures écran référencées.
- `docs/API.md` (new) : référence des 80 endpoints REST.
  Groupés par domaine (auth, bailleurs, biens, locataires,
  quittances, portail, admin, backup, intégrations, IRL,
  exports). Conventions auth + isolation multi-bailleur + codes
  HTTP.
- `docs/ARCHITECTURE.md` (new) : vue d'ensemble technique.
  Stack (Next.js 14, TypeScript, Postgres, Prisma, NextAuth,
  PDFKit, Tailwind). Structure code commentée. Modèle données
  ASCII. Flow auth staff + Google OAuth + tenant magic link.
  Multi-bailleur isolation. Chiffrement. PDF generation. PWA.
  Backup. Tests pattern.
- `docs/FAQ.md` (new) : questions fréquentes. Général + install
  + données/sécurité + fonctionnalités + contribution + roadmap.
  Réponses aux questions communes (RGPD, perte passphrase,
  multi-bailleur, navigateurs, i18n, etc.).
- `docs/GLOSSAIRE.md` (new) : termes métier français de la
  gestion locative (bailleur, locataire, bail, quittance, IRL,
  EDL, DDT, DPE, caution, dépôt de garantie, préavis, charges,
  loyer hors charges, LCEN, RGPD, SCI, etc.).
- `docs/SCREENSHOTS.md` (new) : galerie des 8 captures actuelles
  + liste détaillée des 20+ écrans à capturer post v3.7
  (pages staff mobile cards v3.6.2, dark mode, portail, pages
  publiques, PDFs). Conventions de capture.
- `tests/v3-docs-complete.test.mts` (T138, 42 assertions) : 6
  nouveaux docs présents + README links + audit PII/secret
  (PAT GitHub, email perso, base64 long) + badge version + repo
  URL openquittance.

### Changed

- `README.md` refresh majeur :
  - Badge version 3.0 → 3.7.1 + nouveau badge tests 127 passing.
  - Section "Documentation" en haut : table des liens vers les
    11 docs principaux.
  - Repo URL `grx14/quittances-app` → `openquittance/OpenQuittance`.
  - "Setup en 5 minutes" → "Quick start".
  - Section "Changelog résumé" mis à jour avec v3.x highlights.
  - Section "Crédits" ajoutée : Next.js, NextAuth, Prisma,
    Postgres, PDFKit, Tailwind, Lucide, Zod, Sonner, Playwright,
    INSEE BDM.

### Audited (no PII leak)

Tests T138c automatisés vérifient :
- Pas de PAT GitHub (`ghp_*`) en clair dans la nouvelle doc.
- Pas d'email perso (@gmail, @hotmail, @yahoo, @outlook,
  @protonmail) dans la nouvelle doc.
- Pas de clé base64 longue (≥40 chars) hors URL/code block.

### Régression validée

- T127 install-redirect-loop-fix 11/11 ✓.
- T131 pwa-setup 23/23 ✓.
- T133 pdf-preview-mobile 26/26 ✓.
- T134 mobile-overflow-fix 7/7 ✓.
- T135 mobile-cards-refacto 16/16 ✓.
- T136 logo-dark-mode 17/17 ✓.
- T137 ux-polish-a11y 27/27 ✓.
- T138 docs-complete 42/42 ✓ (new).
- **Total : 169/169 ✓**.

### À faire user

- Capturer les 20+ écrans listés dans SCREENSHOTS.md (via
  `npx tsx scripts/screenshots.mts` ou manuellement).
- Valider le contenu de la doc (relire USER-GUIDE notamment).
- Une fois validé, autoriser la Session 2 (push public GitHub).

---

## [3.7.0] — 2026-05-12 (Fix logo dark mode + UX polish + A11y)

Deux sous-sessions enchaînées : fix logo invisible en dark mode +
Vague C (UX polish + A11y) originalement skippée du marathon.

### Fixed

**Logo invisible en dark mode** (sidebar + wizard install)

- Cause : `<img src="/logo-horizontal.svg">` charge le SVG dans un
  document isolé du browser → `fill="currentColor"` dans le SVG ne
  suit PAS la couleur du parent React. Sur fond sombre, logo
  invisible.
- Fix : inline SVG via composants React `<LogoHorizontal />` +
  `<LogoIcon />`. `currentColor` résout dans le DOM React → suit
  Tailwind `text-{color}`.

### Added

- `src/components/Logo.tsx` (new) : `<LogoHorizontal />` (icône +
  texte horizontal) + `<LogoIcon />` (icône seule, ratio 1:1).
  Props : `className` (size + couleur), `title` (aria-label). SVG
  root avec `role="img"` + `<title>` (a11y screen readers).
- `src/components/Spinner.tsx` (new) : spinner inline réutilisable
  pour boutons en loading state. `animate-spin` + `currentColor`
  + `role="status"` + `aria-label`. Pattern :
  ```tsx
  <button disabled={loading}>
    {loading && <Spinner />}
    {loading ? 'Enregistrement…' : 'Enregistrer'}
  </button>
  ```
- `tests/v3-logo-dark-mode.test.mts` (T136, 17 assertions) : Logo
  exports + currentColor + className forwarding + a11y + wiring
  Sidebar/InstallWizard/LegalPageView.
- `tests/v3-ux-polish-a11y.test.mts` (T137, 27 assertions) :
  Spinner + Sidebar burger aria + Modal close aria + 14 boutons
  icon-only staff aria-label + wizards animate-in + toast convention
  sonner + EmptyState dispo.

### Changed

- `src/components/layout/Sidebar.tsx` : `<img>` → `<LogoHorizontal
  className="h-8 w-auto text-foreground">`. Burger button :
  `aria-label="Ouvrir le menu"` + `aria-expanded`. Close drawer :
  `aria-label="Fermer le menu"`.
- `src/app/install/InstallWizard.tsx` : `<img>` →
  `<LogoHorizontal text-foreground>`. 3 steps wrappés
  `animate-in fade-in slide-in-from-bottom-2 duration-200`.
- `src/app/biens/wizard/page.tsx` : 4 steps wrappés idem.
- `src/components/LegalPageView.tsx` : footer "Propulsé par
  OpenQuittance" avec `<LogoIcon text-muted-foreground>`.
- `src/app/bailleurs/page.tsx` : BailleurForm submit utilise
  `<Spinner />` quand `saving` (showcase pattern loading state).
  Boutons Pencil/Trash : `aria-label="Modifier le bailleur"` +
  `"Supprimer le bailleur"`.
- `src/app/biens/page.tsx` : Pencil/Trash `aria-label`.
- `src/app/locataires/page.tsx` : Pencil/Trash `aria-label`.
- `src/app/quittances/page.tsx` : 6 boutons icon-only
  (Eye/Download/Pencil/Send/Mail/Trash) `aria-label`.

### Audited (no change needed)

- `EmptyState.tsx` : déjà présent (v2.6.0+), déjà utilisé sur
  pages /biens, /locataires vides. Convention bonne.
- Convention toast : `sonner` partout, pas de react-hot-toast
  concurrent. Mounted dans `layout.tsx` via `<Toaster richColors
  theme="system" />`. Variants success/error/warning/info
  disponibles via `toast.success` / etc.
- Skeleton.tsx : déjà présent, utilisé pour loading states
  initiaux pages dashboard.
- Dark mode contraste : CSS vars `--muted-foreground` réajustées
  v3.5.0 pour ratio WCAG AA. Pas de changement nécessaire pour
  les cas standard.

### Régression validée

- T127 install-redirect-loop-fix 11/11 ✓.
- T131 pwa-setup 23/23 ✓.
- T133 pdf-preview-mobile 26/26 ✓.
- T134 mobile-overflow-fix 7/7 ✓.
- T135 mobile-cards-refacto 16/16 ✓.
- T136 logo-dark-mode 17/17 ✓ (new).
- T137 ux-polish-a11y 27/27 ✓ (new).
- **Total : 127/127 ✓**.

---

## [3.6.2] — 2026-05-11 (Hotfix — responsive mobile cassé v3.6.1)

Hotfix critique : 3 problèmes responsive mobile bloquants reportés
par user après test réel iPhone Safari + Android Chrome.

### Fixed

**1. Preview PDF cassée sur mobile (v3.6.1 fix incomplet)**

- Cause root : v3.6.1 n'a corrigé QUE `PdfPreviewModal`. Le staff
  `/quittances` utilisait `Modal+<iframe>` brut (pas
  `PdfPreviewModal`) → bug persistait.
- Cause secondaire : timing hydration. `useIsMobile()` retournait
  false au premier render → iframe rendue → useEffect re-render
  null trop tard, iframe avait déjà mount.
- Fix : `useIsMobile` retourne maintenant `{ mounted, isMobile }`.
  Tous les callers gate leur rendu sur `mounted=true` → l'iframe
  ne mount JAMAIS sur mobile.
- Détection enrichie : viewport matchMedia + fallback
  `pointer:coarse` (touch screens dont le viewport CSS est mal
  détecté).
- Staff `/quittances` bascule vers `PdfPreviewModal`.
- `EmailPreviewModal` + apparence `PdfPreview` : iframe gated
  derrière `!isMobile`, remplacée par bouton download direct.

**2. Dashboard iOS déborde horizontalement (titres coupés gauche)**

- Cause : tables `<table className="table-base">` sans wrap
  forçaient `main` à dépasser viewport → body scroll horizontal →
  contenu décalé droite.
- Fix multi-couches :
  - `globals.css` : `html, body { overflow-x: hidden; max-width:
    100vw; }` (safety net global).
  - `AppShell.tsx` : `min-w-0` sur `<main flex-1>` + sur `<div>`
    enfant (permet shrink en dessous largeur intrinsèque).
  - Dashboard table : wrappée `hidden md:block` + cards
    `md:hidden`.

### Changed

**3. Refacto 5 pages staff tables → cards mobile (UX clean)**

Trade-off v3.6.0 "horizontal scroll" abandonné — vraies cards
mobile. Desktop ≥ md : table inchangée. Mobile < md : 1 carte
par row, infos clés + actions touch-friendly.

- `/bailleurs` : nom + couleur PDF + statut + Modifier/Supprimer.
- `/biens` : nom + adresse + ville + nb locataires + actions.
- `/locataires` : nom + bien + email + loyer total + statut +
  Portail/Modifier/Supprimer.
- `/quittances` : locataire + bien + période + montant + 2 badges
  statut (PDF, email) + 6 actions (Aperçu, PDF, Édit, Email,
  Envoyer, Suppr.) en grid 3 col.
- `/parametres/membres` : carte par membership (nom + email + rôle
  select + Retirer) + carte par invitation pending (email +
  bailleur + Renvoyer/Annuler).

`.table-wrap` retiré de ces 5 pages (gardé en CSS pour autres
usages futurs). Pas de scroll horizontal résiduel.

### Added

- `tests/v3-mobile-overflow-fix.test.mts` (T134, 7 assertions) :
  globals.css overflow-x + AppShell min-w-0 + Dashboard cards.
- `tests/v3-mobile-cards-refacto.test.mts` (T135, 16 assertions) :
  5 pages staff hidden md:block table + md:hidden cards + plus de
  table-wrap.
- Extension `tests/v3-pdf-preview-mobile.test.mts` (T133 → 26
  assertions) : couvre v3.6.2 + audit staff /quittances +
  EmailPreviewModal + apparence.

### Régression validée

- T127 install-redirect-loop-fix 11/11 ✓.
- T131 pwa-setup 23/23 ✓.
- Total tests post-fix : **83/83 ✓**.

---

## [3.6.1] — 2026-05-10 (Hotfix — PDF preview mobile)

Hotfix preview PDF cassée sur mobile :
- **Android Chrome** : pas de viewer PDF natif → iframe vide.
- **iOS Safari** : PDF affiché largeur fixe non responsive, déborde.

### Fixed

- `PdfPreviewModal` : sur mobile (max-width 767px), bypass de la
  modale iframe et déclenche un **download programmatique** via
  `<a download>` → l'OS ouvre le PDF dans l'app native (Files iOS /
  Adobe Reader Android / Drive). Tous les call sites du modal
  bénéficient automatiquement du fix.
- `QuittancesList` portail mobile cards : retrait du bouton
  "Visualiser" redondant (download maintenant aussi via modal sur
  mobile). Seul "Télécharger" reste sur mobile cards.

### Added

- `src/lib/hooks/useIsMobile.ts` : hook `matchMedia` SSR-safe pour
  détection mobile breakpoint Tailwind `md` (767px).
- `tests/v3-pdf-preview-mobile.test.mts` : suite T133 (17
  assertions) — hook + modal branche mobile + meta tags PWA iOS.

### Audited (no change needed)

Meta tags PWA iOS dans `src/app/layout.tsx` — tous présents via
Next.js Metadata API (depuis v3.5.0) :
- `apple-mobile-web-app-capable` (depuis `appleWebApp.capable`).
- `apple-mobile-web-app-title` OpenQuittance.
- `apple-mobile-web-app-status-bar-style` default.
- `<link rel="apple-touch-icon" href="/logo-180.png">`.
- `<meta name="theme-color" content="#2563eb">`.
- `<link rel="manifest" href="/manifest.json">`.

Note : si user ne voit pas "Ajouter à l'écran d'accueil" sur iOS,
c'est qu'il utilise **Chrome iOS** (Apple bloque A2HS aux non-
Safari). Utiliser Safari iOS pour install.

---

## [3.6.0] — 2026-05-10 (GA — Responsive mobile audit)

**Phase 6** livrée — toutes les pages staff utilisables sur mobile
320-768px. Approche pragmatique marathon : horizontal scroll tables
+ full-screen modal mobile. Cards refacto en v3.7+ si demande.

### Added

- **`docs/MOBILE-AUDIT.md`** : audit inventory pages staff + état
  responsive + recommendations.
- **CSS `.table-wrap`** dans `globals.css` : utility wrapper qui
  ajoute `overflow-x-auto` mobile + `sm:rounded-xl sm:border`
  desktop. Tables auto `min-w-[600px]` pour préserver layout.

### Changed

- **5 pages staff** (6 tables) wrappées en `<div className="table-wrap">` :
  `/bailleurs`, `/biens`, `/locataires`, `/quittances`,
  `/parametres/membres` (2 tables : memberships + invitations).
- **`src/components/Modal.tsx`** : full-screen sur < sm (640px),
  modal flottante centrée sur desktop. Header sticky top-0.
  Bouton X padding p-2 -m-2 pour touch target ≥ 44×44 px.
  aria-label="Fermer". Toutes modales héritent (BailleurForm,
  LocataireForm, BienForm, etc.).
- **Sidebar mobile drawer** : déjà fonctionnel (hamburger button
  + drawer slide + backdrop click close). Vérifié, aucun changement.

### Tests

- Régression : **maintenue** (tests version checks ajustés pour
  matcher 3.x générique au lieu de 3.3.x stricte).
- TypeCheck + `npm run build` clean.

### Décisions automatiques marathon

- Trade-off cards mobile vs horizontal scroll : choisi
  **horizontal scroll** pour ROI immédiat (effort 1h vs 4h+).
  v3.7+ refacto cards si user demande après usage réel mobile.
- Modal full-screen mobile uniformément (pas opt-in par modale)
  — cohérence UX.
- min-w-[600px] tables : assure que layout reste lisible même
  avec scroll (compromise entre largeur min utile + responsive).

---

## [3.5.0] — 2026-05-10 (GA — PWA setup)

**Phase 5** livrée — OpenQuittance installable comme PWA sur Chrome
Android + Safari iOS. Option A v1 minimal (sans lib externe).

### Added

- **`public/manifest.json`** : standalone + theme_color #2563eb +
  5 icons (4 PNG + SVG fallback) + maskable + categories + lang.
- **`public/sw.js`** : SW minimal install + activate + fetch
  passthrough. Pas de cache offline v1.
- **`src/components/PwaInstaller.tsx`** Client Component register
  `/sw.js`.
- **`src/app/layout.tsx`** : metadata.manifest + applicationName +
  appleWebApp + icons étendu + export viewport themeColor #2563eb
  + mount PwaInstaller.
- **`scripts/gen-pwa-icons.mjs`** (sharp dev dep) : génère 5 PNG.
  npm script `gen:pwa-icons`.
- **`docs/INSTALL.md`** : section installer PWA mobile (Android +
  iOS).

### Tests

- T131 (`tests/v3-pwa-setup.test.mts`) — **23/23 ✓**.
- Régression maintenue. TypeCheck + `npm run build` clean.

### Décisions automatiques

- Option A (sans lib). serwist en v2 si demande offline.
- display=standalone, orientation=any.
- theme_color #2563eb.
- Maskable safe zone 80%.

---

## [3.4.0-rc1] — 2026-05-10

### Fixed

- **Access denied Google OAuth post-invitation** : femme du bailleur
  invitée comme MEMBER staff cliquait `/invitations/[token]` puis
  "Se connecter avec Google" → Google consent → callback → "Access
  denied".

  **Cause racine** : auth.ts signIn callback Google ligne 164-171
  retournait `!!invitation` mais ne marquait jamais l'invitation
  comme acceptée. Si le user existait déjà (TENANT par exemple),
  return true OK mais le rôle restait TENANT — sans upgrade vers
  invitation.role + memberships créées. User redirigé /portail.

  **Fix** :
  - signIn callback Google refactor : 4 cas explicites (existing
    user → ok / premier user → ADMIN auto / nouveau + invitation →
    ok / sinon refus avec mode CLOSED).
  - events.signIn (Google) : auto-call `acceptInvitation()` pour
    pending invitation matching `user.email`. Couvre nouveau user
    Google ET user existant (TENANT inclus) — upgrade rôle +
    création memberships idempotent.
  - Catch silencieux : invitation déjà acceptée n'est pas une
    erreur côté UX.

  **Sécurité** : `acceptInvitation()` exige email match strict
  (case-insensitive). Pas d'élévation arbitraire.

### Added

- **Logo officiel OpenQuittance** intégré (3 SVG dans `public/`) :
  - `logo.svg` icône monochrome currentColor 64×64
  - `logo-horizontal.svg` icône + texte 280×64
  - `favicon.svg` 32×32 bleu fixe
- **`src/app/layout.tsx`** : `metadata.icons` référence
  `/favicon.svg` + `/logo.svg` (Apple touch icon).
- **`src/components/layout/Sidebar.tsx`** : header brand remplace
  texte "OpenQuittance" par `<img src="/logo-horizontal.svg" />`
  (h-8). Fallback `sr-only "OpenQuittance"` pour accessibilité.
- **`src/app/install/InstallWizard.tsx`** : header wizard ajoute
  `<img src="/logo-horizontal.svg" />` (h-12) au-dessus du titre.
- **Portail locataire INCHANGÉ** : conserve logo bailleur en
  priorité (fallback FileText). Pas de logo OpenQuittance dans le
  portail (cohérent avec philosophie white-label par bailleur).

### Tests

- T129 (`tests/v3-google-oauth-invitation.test.mts`) — **16/16 ✓** :
  - T129a auth.ts importe acceptInvitation.
  - T129b (4) signIn callback Google 4 cas distincts.
  - T129c (3) events.signIn auto-accept invitation Google + filtré
    + idempotent.
  - T129d (6) simulation 6 scenarios (TENANT+invitation /
    nouveau+invitation / nouveau sans CLOSED / premier user /
    staff existant / email mismatch sécurité).
  - T129e acceptInvitation strict email match.
  - T129f acceptInvitation crée memberships + update role.
- T130 (`tests/v3-logo-integration.test.mts`) — **11/11 ✓** :
  - T130a fichiers SVG présents dans `public/`.
  - T130b (2) layout.tsx metadata.icons référencé.
  - T130c (2) Sidebar logo + sr-only fallback.
  - T130d InstallWizard logo en header.
  - T130e (3) portail locataire INCHANGÉ (régression).
- Régression : **268/268 ✓** (22 suites). TypeCheck +
  `npm run build` clean.

### Bump

3.3.2 → 3.4.0-rc1 (minor — fix critique Google OAuth + branding
officiel).

---

## [3.3.2] — 2026-05-10

### Fixed

- **Invitation membre staff redirige par erreur vers le portail
  locataire** : un user invité qui a déjà une session TENANT (cas
  réel : femme du bailleur déjà locataire dans l'app) cliquait sur
  le lien d'invitation `/invitations/[token]` et atterrissait sur
  `/portail` avec "Aucun bail actif".

  **Cause racine** : `src/middleware.ts` ligne 104 (block
  `isTenant`) redirigeait `/portail` toutes les routes non-PUBLIC
  pour user TENANT. `/invitations/[token]` n'était pas dans
  PUBLIC_PATHS / PUBLIC_API_PREFIXES. Le check
  `isPublicInvitation()` ligne 158 était déclaré APRÈS, donc
  unreachable pour TENANT.

  **Trace** :
  1. Femme TENANT clique lien email `/invitations/{token}`.
  2. Middleware Edge : session TENANT détectée.
  3. Block isTenant : `/invitations/...` pas dans PUBLIC_PATHS →
     redirect `/portail`.
  4. Page `/portail` charge → "Aucun bail actif" (ou portail si
     elle a un bail). L'invitation staff inaccessible.

  **Fix** : déplacer le check `isPublicInvitation()` AVANT le
  block `isTenant` dans `src/middleware.ts`. Les pages d'invitation
  passent désormais quel que soit le rôle de session (TENANT inclus)
  — cas légitime pour conversion locataire → membre staff.

  **Sécurité** : token cryptographiquement sécurisé
  (`generateToken`). Page `/invitations/[token]` vérifie
  expiration / acceptation. POST acceptation exige session valide.

### Tests

- T128 (`tests/v3-invitation-tenant-bypass.test.mts`) — **14/14 ✓** :
  - T128a (3) middleware ordre : isPublicInvitation AVANT isTenant.
  - T128b commentaire hotfix v3.3.2 + TENANT + invitation staff.
  - T128c isPublicInvitation regex 2 préfixes.
  - T128d (6) simulation flow réel : 6 cas (TENANT + /invitations
    ok / TENANT + /api/invitations ok / TENANT + /quittances
    redirect portail / non loggué + /invitations ok / ADMIN +
    /invitations ok / TENANT + /api/quittances 403).
  - T128e package.json version 3.3.2.
  - T128f (2) `sendInvitationEmail` URL `/invitations/[token]` pas
    `/portail/login`.
- T127e ajusté pour matcher >= 3.3.1.
- Régression : **242/242 ✓** (20 suites). TypeCheck +
  `npm run build` clean.

---

## [3.3.1] — 2026-05-10

### Fixed

- **`ERR_TOO_MANY_REDIRECTS` sur instance vierge avec stale JWT
  cookie** : après `docker compose down -v && up -d --build app`,
  un user avec un cookie NextAuth JWT valide (signé avec
  `NEXTAUTH_SECRET` inchangé) tombait dans une boucle de
  redirection infinie sur `/install`.

  **Trace de la boucle** :
  1. User accède `/`. Middleware Edge lit JWT, `isStaff=true`.
     `/` pas dans PUBLIC_PATHS, session présente → ok(req, '/').
  2. `/` Server Component (Node) : `hasAnyAdmin()=false`
     (DB vierge post `down -v`) → `redirect('/install')`.
  3. User redirigé `/install`. Middleware : `/install` dans
     PUBLIC_PATHS. `ALWAYS_ACCESSIBLE = ['/setup', '/a-propos']`
     ne contient PAS `/install`. `isStaff=true` →
     **`redirect('/')`**.
  4. Loop infini : `/` → page `/install` → middleware `/` → ...

  **Fix** : ajout de `/install` à `ALWAYS_ACCESSIBLE` dans
  `src/middleware.ts` (à côté de `/setup` + `/a-propos`). Le
  Server Component `/install` décide ensuite (render wizard si
  `!hasAnyAdmin`, redirect `/login` sinon) — pas de redirect
  middleware contradictoire.

  Comportements conservés :
  - `/login` + session staff → redirect `/` (inchangé).
  - `/register` + session staff → redirect `/` (inchangé).
  - `/install` + pas de session → ok middleware, render wizard.
  - `/install` + session staff + DB vierge → ok middleware, page
    rend wizard.
  - `/install` + session staff + DB pleine → ok middleware, page
    redirect `/login`.

### Tests

- T127 (`tests/v3-install-redirect-loop-fix.test.mts`) — **11/11 ✓** :
  - T127a (3) middleware ALWAYS_ACCESSIBLE inclut `/install` +
    régression /setup + /a-propos.
  - T127b commentaire hotfix v3.3.1 + ERR_TOO_MANY_REDIRECTS
    documenté inline.
  - T127c /install Server Component logique inchangée
    (hasAnyAdmin + redirect /login OR render wizard).
  - T127d (5) simulation flow stale JWT : 5 cas (PAS loggué +
    /install / staff + /install / staff + /login redirect / /
    staff + /register redirect / / staff + /setup ok).
  - T127e package.json version 3.3.1.
- T126f ajusté pour matcher 3.3.x GA générique.
- Régression : **228/228 ✓** (19 suites). TypeCheck +
  `npm run build` clean.

---

## [3.3.0] — 2026-05-10 (GA — Setup wizard web shippable)

**Phase 4** livrée — wizard d'installation graphique
`/install` 3 étapes pour instance vierge. Le user non-tech
peut créer admin + premier bailleur sans toucher au `.env`
ni naviguer dans le code. 2 sessions (rc1 + GA).

### Added

- **Page `/install`** — wizard 3 étapes (Server Component avec
  vérification `hasAnyAdmin()` + détection secrets faibles).
- **`InstallWizard.tsx`** Client Component state machine 3 étapes :
  1. Compte administrateur (name + email + password ≥ 8 chars)
  2. Premier bailleur (4 champs minimum)
  3. C'est prêt ! (récap + warnings + liens "prochaines étapes")
- **Stepper visuel** 3 cercles avec checkmark progressif.
- **Endpoints API** :
  - `POST /api/install/admin` (auth-less, gated `!hasAnyAdmin()`)
  - `POST /api/install/bailleur` (gated session ADMIN)
  - `POST /api/install/complete` (marque `setupCompleted=true`)
- **Auto signin** post-création admin via NextAuth credentials
  provider — user n'a pas à re-saisir email/password.
- **Détection secrets faibles** (NEXTAUTH_SECRET +
  UPLOADS_ENCRYPTION_KEY + ENCRYPTION_SECRET < 32 chars OU
  pattern trivial `changeme`/`replace-with`/`secret`/etc.) →
  warning rouge étape 3 avec recommandation `openssl rand`.
- **3 audit log actions** : `install.admin.created`,
  `install.bailleur.created`, `install.completed`.
- **Recovery flow** : si signin auto post-admin échoue, banner
  orange "Compte créé, connexion auto échouée" + lien manuel
  `/login`. Retry submitAdmin skip POST si admin déjà créé
  (évite 403).

### Changed

- **`/` (root page)** : converti Server Component, vérifie
  `hasAnyAdmin()` + redirect `/install` si false. Sinon délègue
  au `Dashboard` Client Component (logique inchangée).
- **`/login` page** : converti Server Component, redirect
  `/install` si !hasAnyAdmin. Le `LoginForm` reste Client
  Component dans `LoginForm.tsx`.
- **Middleware** : `/install` ajouté à `PUBLIC_PATHS` +
  `/api/install` à `PUBLIC_API_PREFIXES`. Détection
  `hasAnyAdmin()` pas dans middleware (Edge runtime
  incompatible Prisma) — déléguée aux Server Components.

### Documentation

- `docs/INSTALL.md` : nouvelle section "Première installation via
  wizard web" — 3 étapes step-by-step + détection secrets faibles
  + cleanup `.env` post-install + comportement post-install.
- `CHANGELOG.md` : entrée `[3.3.0]` consolidée GA.

### Tests

- T125 (21) `install-wizard` : fichiers présents + middleware
  publics + page redirect logic + wizard 20 markers + endpoints
  gating × 3 + Zod admin/bailleur 6 cas.
- T126 (5) `install-redirects-docs` : `/` + `/login` redirect
  /install si !hasAnyAdmin + page /install logique + INSTALL.md
  section + version GA.
- Régression : **210/210 ✓** (18 suites). TypeCheck +
  `npm run build` clean.

### Trade-off documenté

- Middleware Edge runtime ne sait pas appeler Prisma → détection
  zéro-user faite dans Server Components (`/`, `/login`,
  `/install`). User qui accède directement `/bailleurs` ou autre
  route protégée sur instance vierge sera redirigé `/login` par
  middleware (non-authentifié), puis `/login` Server Component
  redirige `/install`. UX fluid.

---

## [3.3.0-rc1] — 2026-05-10

### Added — Phase 4 Session 1 (setup wizard web post-install)

- **Page `/install`** ([src/app/install/page.tsx](src/app/install/page.tsx))
  Server Component :
  - Vérifie `hasAnyAdmin()` au mount, redirect `/login` si true.
  - Détecte secrets faibles (`NEXTAUTH_SECRET`,
    `UPLOADS_ENCRYPTION_KEY`, `ENCRYPTION_SECRET` < 32 chars OU
    contient pattern trivial `changeme`/`replace-with`/`secret`/etc.).
  - Render `<InstallWizard weakSecrets={...} />`.
- **`InstallWizard.tsx`** — Client Component, state machine 3 étapes :
  1. **Compte administrateur** : name + email + password (≥ 8 chars)
     → POST `/api/install/admin` + auto signin NextAuth.
  2. **Premier bailleur** : 4 champs minimum (nom + adresseLigne1
     + adresseLigne2 + villeSignature) → POST `/api/install/bailleur`
     + POST `/api/install/complete`.
  3. **C'est prêt !** : récap visuel + warning rouge si secrets
     faibles + 3 liens "prochaines étapes optionnelles" (Intégrations,
     Backup, INSEE) + bouton `router.push('/')`.
  - Stepper visuel (3 cercles avec checkmark sur étapes complétées).
- **Endpoints API** :
  - `POST /api/install/admin` — auth-less, gated `!hasAnyAdmin()`.
    Crée User ADMIN + AppConfig + bcrypt hash + audit log
    `install.admin.created`.
  - `POST /api/install/bailleur` — gated session ADMIN active +
    `hasAnyAdmin()`. Crée Bailleur + BailleurMembership ADMIN +
    audit log `install.bailleur.created`.
  - `POST /api/install/complete` — gated session ADMIN. Marque
    `AppConfig.setupCompleted=true` + audit log `install.completed`.
- **Middleware** : `/install` ajouté à `PUBLIC_PATHS` +
  `/api/install` ajouté à `PUBLIC_API_PREFIXES`. Détection
  `hasAnyAdmin()` dans Server Component (Edge runtime middleware
  ne supporte pas Prisma). Si user logué accède /install → middleware
  redirect `/` (pattern existant /login).
- **Audit actions** : 3 nouvelles dans `AuditAction` type
  (`install.admin.created`, `install.bailleur.created`,
  `install.completed`).

### Tests

- T125 (`tests/v3-install-wizard.test.mts`) — **21/21 ✓** :
  - T125a (5) fichiers présents : page + wizard + 3 endpoints API.
  - T125b (2) middleware `/install` + `/api/install` publics.
  - T125c (2) page redirect `/login` si hasAnyAdmin + détection
    secrets faibles 3 vars.
  - T125d (1) wizard 20 markers (3 steps + 4 champs admin + 4
    champs bailleur + endpoints + signIn + done links).
  - T125e (2) admin endpoint gating !hasAnyAdmin + bcrypt + ADMIN
    + audit log.
  - T125f (2) bailleur endpoint gating session ADMIN + crée
    Bailleur + Membership.
  - T125g (1) complete endpoint update setupCompleted=true.
  - T125h (4) Zod admin schema : valid + password<8 reject + email
    invalide reject + name vide reject.
  - T125i (2) Zod bailleur schema : 4 champs accept + adresse vide
    reject.
- Régression : **205/205 ✓** (17 suites). TypeCheck +
  `npm run build` clean.

---

## [3.2.0] — 2026-05-10 (GA — Onglet Intégrations Google OAuth)

**Phase 3** livrée — credentials Google OAuth (login + Gmail API)
migrés du `.env` vers DB chiffrée + UI Paramètres > Intégrations.
Cohérent avec migration Drive v3.1.0-rc10. Validé visuellement par
user (4 sessions rc1 → rc4).

### Added

- **Page `/parametres/integrations`** (Client Component, ADMIN
  only) : section "Google OAuth (login utilisateurs + Gmail API)"
  avec inputs masqués `'***'` + badge source 3 états (db / env
  legacy / none) + warnings explicites trade-off (Gmail immédiat /
  Login restart container).
- **Sidebar entrée "Intégrations"** icône `Plug` lucide-react entre
  "Backup" et "Paramètres".
- **Schema AppConfig** : `googleClientId String?` +
  `googleClientSecret String?` (chiffrés `enc:v1:`). Migration
  `20260510100000_v3_google_oauth_in_db` ALTER TABLE non bloquante.
- **`src/lib/integrations/google.ts`** — helper
  `getGoogleCredentials()` retourne `{ clientId, clientSecret,
  source: 'db' | 'env' }` ou `null`. Cache 60s + invalidation
  manuelle.
- **Validation Zod `integrationsConfigSchema`** : sentinelle `'***'`
  acceptée pour préservation valeur DB côté route handler (pattern
  rc10/rc11).
- **Endpoint `/api/parametres/integrations`** (ADMIN) : GET secrets
  masqués + champ `source` + POST préservation `'***'`. Log explicite
  pour diagnostic.

### Changed

- **`auth.config.ts` (NextAuth)** : commentaire mis à jour. Code
  inchangé — `process.env.GOOGLE_CLIENT_ID/SECRET` lus, mais
  pré-populés au boot par instrumentation depuis DB (priorité DB →
  env legacy).
- **`gmail-sender.ts buildOAuthClient`** désormais async, lit
  `getGoogleCredentials()` à chaque appel (effet immédiat post-save
  UI). Throw "Credentials Google manquants" si null.
- **`instrumentation.ts`** : nouveau hook au boot — pré-populer
  `process.env.GOOGLE_CLIENT_ID/SECRET` depuis AppConfig DB pour
  permettre à NextAuth (provider sync au boot) d'utiliser les
  credentials saisis via UI.
- **Hook invalidation cache** : `POST /api/parametres/integrations`
  appelle `invalidateGoogleCredentialsCache()` après save.

### Migration

- **Bootstrap migration `.env` → DB** (idempotent) :
  `scripts/bootstrap.mjs` étape 1quater copie `process.env
  .GOOGLE_CLIENT_ID/SECRET` vers `AppConfig` chiffré `enc:v1:` au
  boot si DB null + `.env` défini. Skip si DB déjà rempli OU `.env`
  vide. Permet upgrade transparent v3.1.0 → v3.2.0.
- **`.env.example`** : `GOOGLE_CLIENT_ID/SECRET` marqués deprecated
  + note migration UI.
- **`docs/UPGRADE.md`** : section "v3.1.0 → v3.2.0" — vérification
  + cleanup recommandé + warning restart container.
- **`docs/INSTALL.md`** : section "Configurer Google OAuth" refresh
  — procédure UI (4 étapes GCP + 1 étape UI) au lieu de `.env` +
  restart.

### Trade-off documenté

- **Gmail API** (envoi quittances) : effet immédiat post-save
  (cache invalidé, lecture dynamique).
- **Google login** (NextAuth) : restart container nécessaire
  (provider sync au boot via `process.env`). Warning orange
  explicit dans UI.

### Tests

- T120 (16) `integrations-config` : Zod + bootstrap migration
  logic + detectSource + round-trip enc:v1:.
- T121 (9) `google-oauth-lazy-load` : cache TTL + invalidate +
  Gmail buildOAuthClient utilise creds DB + throw si null.
- T122 (11) `integrations-ui` : 18 markers UI + ADMIN gating +
  3 source badges + warnings + Sidebar Plug + items existants
  intacts + régression Zod sentinelle.
- T123 (6) `integrations-docs` : `.env.example` deprecation +
  CHANGELOG `[3.2.0]` + UPGRADE.md section v3.1.0 → v3.2.0 +
  INSTALL.md mention "Paramètres > Intégrations".
- Régression : **183/183 ✓** (16 suites). TypeCheck +
  `npm run build` clean.

### Webpack Edge runtime

- Edge alias étendu (`next.config.js`) : `src/lib/integrations/google`
  → `edge-stub.js`. Sans ça, build webpack fail sur chain
  `instrumentation` → `integrations/google` → `lib/crypto.ts`
  (`'crypto'` Node natif).

---

## [3.2.0-rc3] — 2026-05-10

### Added — Phase 3 Session 3 (UI Paramètres > Intégrations)

- **Page `/parametres/integrations`**
  ([src/app/parametres/integrations/page.tsx](src/app/parametres/integrations/page.tsx))
  — Client Component, ADMIN gating client + fallback shield si
  non-admin. Fetch `GET /api/parametres/integrations` au mount.
- **`IntegrationsForm.tsx`** — section "Google OAuth (login
  utilisateurs + Gmail API)" :
  - 2 inputs Client ID + Client Secret avec masquage `'***'` si
    configurés (pattern rc10/rc11). `onFocus` clear si `'***'` +
    flag `*Dirty` → POST envoie soit nouvelle valeur soit `'***'`
    (sentinelle préservée par API).
  - Helper text + lien Google Cloud Console + lien
    `docs/INSTALL.md` + redirect URI dynamique.
  - **Badge source** (3 états visuels) :
    - ✓ vert "Configuré via UI" (`source==='db'`)
    - ⚠ orange "Configuré via .env (legacy)" (`source==='env'`)
    - gris "Non configuré" (`source==='none'`)
  - **Warnings explicites** :
    - 🔵 "Gmail API : changements appliqués immédiatement"
    - 🟠 "Login Google : redémarrage du container nécessaire"
  - Bouton "Enregistrer" + re-fetch GET post-save (pattern rc11
    pour confirmer état DB).
- **Sidebar** : entrée "Intégrations" (icône `Plug` lucide-react)
  ajoutée entre "Backup" et "Paramètres".

### Tests

- T122 (`tests/v3-integrations-ui.test.mts`) — **11/11 ✓** :
  - T122a (3) fichiers présents + 18 markers UI (Google OAuth +
    Client ID/Secret + Cloud Console + sentinelle `'***'` + dirty
    flags + 3 source badges + warnings).
  - T122b ADMIN gating shield.
  - T122c rendering 3 sources distinctes (db/env/none) avec
    couleurs Tailwind.
  - T122d warnings explicites Gmail immédiat vs Login restart.
  - T122e (2) Sidebar entrée `Plug` + 6 items existants intacts.
  - T122f régression Zod sentinelle `'***'` (pattern rc11).
  - T122g cohérence 3 champs UI ↔ route handler.
- Régression : **176/176 ✓** (15 suites). TypeCheck +
  `npm run build` clean.

---

## [3.2.0-rc2] — 2026-05-10

### Added — Phase 3 Session 2 (refacto lazy load Google credentials)

- **`src/lib/integrations/google.ts`** — helper centralisé
  `getGoogleCredentials()` :
  - Lit `AppConfig.googleClientId/Secret` (chiffrés `enc:v1:`).
    Si présents → décrypte → `{ source: 'db' }`.
  - Sinon fallback `process.env.GOOGLE_CLIENT_ID/SECRET` →
    `{ source: 'env' }`. Sinon `null`.
  - Cache 60s + invalidation manuelle via
    `invalidateGoogleCredentialsCache()`.
- **`instrumentation.ts`** : nouveau hook au boot — lit
  `getGoogleCredentials()`, si `source==='db'` pré-populer
  `process.env.GOOGLE_CLIENT_ID/SECRET`. Permet à NextAuth
  (provider Google synchrone) d'utiliser les credentials DB.
  Log `[instrumentation] Google OAuth credentials pré-populés
  depuis DB → process.env`.
- **`src/lib/email/gmail-sender.ts buildOAuthClient`** : async,
  lit `getGoogleCredentials()` à chaque appel (dynamique).
  Throw si null. Signature change → callers
  (`/api/gmail/auth/route.ts` + `/api/gmail/callback/route.ts` +
  `lib/email/portail.ts`) mis à jour avec `await`.
- **Hook invalidation cache** : `POST /api/parametres/integrations`
  appelle `invalidateGoogleCredentialsCache()` après save → Gmail
  API utilise nouvelles creds immédiatement. NextAuth login Google
  reste sur les valeurs boot — restart container nécessaire pour
  prise en compte.

### Changed

- **`auth.config.ts`** : commentaire mis à jour explicitant le
  trade-off NextAuth provider sync au boot. Code inchangé
  (`process.env.GOOGLE_CLIENT_ID/SECRET` lus, pré-populés par
  instrumentation).
- **`next.config.js`** : alias Edge runtime étendu à
  `src/lib/integrations/google` → `edge-stub.js` (pattern rc8
  scheduler). Sans ça, build webpack fail sur `crypto` natif
  importé par `lib/crypto.ts` via la chaîne instrumentation →
  integrations/google.

### Tests

- T121 (`tests/v3-google-oauth-lazy-load.test.mts`) — **9/9 ✓** :
  - T121a-c cache injecté DB / env / null retourné correctement.
  - T121d invalidate cache reset null.
  - T121e cache TTL expiré.
  - T121f decrypt enc:v1: round-trip identité.
  - T121g `buildOAuthClient` Gmail utilise creds depuis cache
    (vérif via `generateAuthUrl` qui contient `client_id=`).
  - T121h `buildOAuthClient` throw "Credentials Google manquants"
    si aucune source.
- Régression : **165/165 ✓** (14 suites). TypeCheck +
  `npm run build` clean.

---

## [3.2.0-rc1] — 2026-05-10

### Added — Phase 3 Session 1 (schema + bootstrap migrate Google OAuth)

- **Schema AppConfig** : 2 nouveaux champs nullable —
  `googleClientId String?` (chiffré `enc:v1:`) +
  `googleClientSecret String?` (chiffré). Migration Prisma
  `20260510100000_v3_google_oauth_in_db` (ALTER TABLE ADD COLUMN
  nullable, non bloquante).
- **Bootstrap migration `.env` → DB** : `scripts/bootstrap.mjs`
  étape 1quater — si `AppConfig.googleClientId` null ET
  `process.env.GOOGLE_CLIENT_ID` défini, copie chiffré `enc:v1:`
  inline (même format que `src/lib/crypto.ts`). Idempotent (skip
  si DB déjà rempli OU process.env vide). Permet upgrade
  transparent v3.1.0 → v3.2.0 pour les users existants.
- **Validation Zod `integrationsConfigSchema`** ([src/lib/validation.ts](src/lib/validation.ts))
  — pattern symétrique au backup config :
  `z.union([literal(''), literal('***'), z.string().min(1)])`
  pour `googleClientId/Secret`. Sentinelle `'***'` acceptée pour
  préserver valeur DB côté route handler.
- **Endpoint `POST/GET /api/parametres/integrations`** (ADMIN
  only) :
  - GET : retourne `googleClientId/Secret` masqués `'***'` si
    configurés (null sinon) + champ `source` (`'db'` /
    `'env'` / `'none'`) pour transparence rétro-compat.
  - POST : préserve valeur DB existante si payload `'***'`,
    sinon chiffre + persiste. Pattern rc10/rc11.
  - Log explicite `[parametres/integrations] saved
    googleClientId=set/null googleClientSecret=set/null` pour
    diagnostic.

### Tests

- T120 (`tests/v3-integrations-config.test.mts`) — **16/16 ✓** :
  - T120a sentinelle `'***'` acceptée par Zod.
  - T120b (4) accepte clientId/Secret nouveaux + null + payload
    vide + empty strings (clearing).
  - T120c rejette `number` au lieu de string.
  - T120d (3) round-trip `enc:v1:` × 2 secrets + IV aléatoire.
  - T120e (4) bootstrap migration logic : conditions `db null +
    env défini` / idempotent `db rempli` / no-op `env vide` +
    chiffrement bootstrap inline décryptable par `lib/crypto`
    (compat format).
  - T120f (3) `detectSource` : `db` / `env` / `none`.
- Régression : **156/156 ✓** (13 suites). TypeCheck +
  `npm run build` clean.

---

## [3.1.0-rc11] — 2026-05-09

### Fixed

- **Toggle "Activer le backup automatique" désormais persisté** —
  régression critique rc1-rc10. Le fix rc9 était cosmétique (UI
  switch + log serveur) et n'avait pas identifié la cause racine.

  **Cause racine** : Zod schema `backupEnvPassphrase: z.string()
  .min(12).optional().nullable().or(z.literal(''))`. Quand l'UI
  envoyait la sentinelle `'***'` pour la passphrase non-touchée
  (cas typique : user a déjà configuré et clique simplement le
  toggle off), Zod rejetait `'***'` car 3 chars < min(12). Aucune
  des branches du union (`undefined`, `null`, `''`, `string≥12`)
  ne matchait. Route handler retournait 400. DB jamais mise à
  jour. Reload page → GET retournait l'ancienne valeur de DB
  (true) → toggle "remis à ON".

  **Pourquoi le fix rc9 a manqué** : ajout d'un log
  `[parametres/backup] saved backupEnabled=...` mais placé APRÈS
  `prisma.upsert` qui n'était jamais atteint (Zod fail avant). Le
  log silence aurait dû alerter mais sans test régression dédié,
  difficile à voir.

  **Fix rc11** : Zod schema utilise désormais `z.union([
  z.literal(''), z.literal('***'), z.string().min(12) ])` pour
  `backupEnvPassphrase`. La sentinelle `'***'` est explicitement
  acceptée. Le route handler la remplace par la valeur DB existante
  avant `prisma.upsert` (logique déjà en place rc9).

  **Diagnostic facilité** : ajout `console.error('[parametres/backup]
  Zod validation failed :', issues)` sur les futurs Zod fails, pour
  rendre les 400 visibles dans `docker compose logs app`.

### Tests

- T115-T119 (`tests/v3-backup-toggle-persist.test.mts`) — **10/10 ✓** :
  - T115 (4) sentinelle `'***'` acceptée pour passphrase dans 4
    cas (enabled true/false × passphrase ***/null).
  - T116 sentinelle `'***'` pour Drive credentials.
  - T117 passphrase réelle (≥12 chars) toujours acceptée.
  - T118 (2) passphrase trop courte (`"short"`, `"**"`) toujours
    rejetée.
  - T119 simulation flow réel : payload exact UI → toggle off →
    Zod accept → `data.backupEnabled === false` préservé après
    parse.
- Régression : **140/140 ✓** (12 suites). TypeCheck +
  `npm run build` clean.

---

## [3.1.0-rc10] — 2026-05-08

### Changed

- **Drive credentials migrés du `.env` vers la DB / UI** : feedback
  user, éditer le `.env` côté Docker n'est pas user-friendly. Désormais
  Client ID + Client Secret Google Drive saisis dans **Paramètres >
  Backup > section "Google Drive — Configuration Google Cloud"**.
  Stockés chiffrés AES-256-GCM (`enc:v1:`) dans `AppConfig`, plus
  jamais lus depuis `process.env`.
- **Schema** : 2 nouveaux champs `AppConfig` :
  `googleDriveClientId String?` (chiffré) +
  `googleDriveClientSecret String?` (chiffré). Migration
  `20260508200000_v3_drive_credentials_in_db` (ALTER TABLE non
  bloquant).
- **Bootstrap migration `.env` → DB** (idempotent) :
  `scripts/bootstrap.mjs` étape 1ter — si `AppConfig.googleDriveClientId`
  null ET `process.env.GOOGLE_DRIVE_CLIENT_ID` défini, copie en DB
  chiffré au boot. Skip si DB déjà rempli. Permet l'upgrade transparent
  pour les users qui avaient ces vars en `.env` (rc1-rc9).
- **OAuth Drive flow** : `/api/admin/backup/drive/oauth/start` et
  `/api/admin/backup/drive/oauth/callback` lisent `AppConfig` (chiffré
  → decrypt) au lieu de `process.env`. Si credentials absents en DB →
  réponse 400 explicite "Configurez vos credentials dans
  Paramètres > Backup avant de connecter".
- **`buildOAuthClient` / `createDriveClient`** (`storage/drive.ts`) :
  signature change — accepte `clientIdEnc` + `clientSecretEnc` en
  paramètres au lieu de lire `process.env`.
- **`loadStorageFromConfig`** : exige
  `googleDriveClientId/Secret` en plus de
  `folderId + refreshToken`. Throw avec message explicite si manquant.
- **Validation Zod** : refine `backupStorageType === 'drive'` exige
  désormais `googleDriveClientId + googleDriveClientSecret` non vides
  (plus le `folderId` existant).
- **UI BackupForm** : section "Google Drive — Configuration Google
  Cloud" ajoutée AVANT le bouton "Connecter Google Drive" :
  - Champ Client ID + Client Secret avec masquage `***`.
  - Texte d'aide + lien direct Google Cloud Console + lien
    `docs/BACKUP.md`.
  - Affichage redirect URI dynamique (utile pour copier dans GCP).
  - Indicateur ✓ vert "Credentials Google configurés" si présents.
  - Bouton "Connecter Google Drive" disabled tant que credentials non
    saisis ET sauvegardés (message "Saisissez vos credentials puis
    Enregistrer").

### Removed (deprecated)

- **`GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` env vars** :
  marqués dépréciés dans `.env.example`. La migration auto au boot
  copie les valeurs vers la DB. À retirer du `.env` post-upgrade.

### Tests

- T110-T114 (`tests/v3-drive-credentials-in-db.test.mts`) — **14/14 ✓** :
  - T110 (3) `buildOAuthClient` decrypt clientId/Secret + génère URL
    OAuth valide (scope drive.file, redirect URI callback).
  - T111 (4) refine reject Drive activé sans credentials (3 cas) +
    `backupEnabled=false` → tous champs optionnels OK.
  - T112 (2) refine accept Drive complet + S3 storage : credentials
    Drive optionnels (S3 inchangé).
  - T113 (2) `loadStorageFromConfig` retourne `DriveStorage` avec cfg
    complet + throw avec message explicite si clientId manquant.
  - T114 (3) round-trip clientId/Secret chiffrés `enc:v1:` (préfixe +
    decrypt → identité × 2).
- T100b/c/d (`tests/v3-backup-drive.test.mts`) mis à jour pour inclure
  les nouveaux champs `googleDriveClientId/Secret`.
- Régression : **130/130 ✓** (11 suites). TypeCheck +
  `npm run build` clean.

### Documentation

- `docs/BACKUP.md` section "Configurer un backup Google Drive" :
  Étape 4 réécrite (saisie UI au lieu de `.env` + restart container
  inutile). Étape 6 simplifiée. Note migration auto.
- `.env.example` : section dépréciation Drive + référence UI.

---

## [3.1.0-rc9] — 2026-05-08

### Fixed

- **BUG 1 — runner.ts échouait `Fichier .env introuvable : /app/.env`** :
  le `.env` n'est PAS bind-mounté dans le container Docker (les vars
  passent via `environment:` côté compose). Solution : reconstruction
  du contenu `.env` à partir de `process.env` au runtime via une
  whitelist explicite de 16 variables critiques (`DATABASE_URL`,
  `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `ENCRYPTION_SECRET`,
  `UPLOADS_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID/SECRET`,
  `GOOGLE_DRIVE_CLIENT_ID/SECRET`, `INSEE_API_KEY`,
  `BACKUP_NOTIFY_EMAIL`, `BACKUP_ENV_PATH`, `UPLOADS_DIR`,
  `AUDIT_LOG_RETENTION_DAYS`, `NEXT_PUBLIC_APP_NAME`, `TZ`).
  Vars système Linux (PATH, HOME, NODE_ENV, etc.) **non leakées**.
  Rétro-compat : si `BACKUP_ENV_PATH` set ET fichier existe, le
  contenu est utilisé verbatim.
- **BUG 2 — toggle "Activer le backup" peu visible** : remplacé le
  `<input type="checkbox">` natif par un toggle switch custom
  Tailwind (h-7 w-12, ball animation, vert si activé). Ajout d'un
  indicateur d'état explicite "✅ Activé / ⏸️ Désactivé".
- **Diagnostic toggle activation** : ajout log serveur après upsert
  AppConfig (`[parametres/backup] saved backupEnabled=...
  storageType=... schedule=...`) + re-fetch GET après save côté UI
  pour confirmer ce qui est en DB (évite tout drift entre POST
  response et état serveur).

### Added

- **Helpers `runner.ts`** :
  - `buildEnvFromProcessEnv()` : Buffer format `.env` reconstruit
    depuis whitelist process.env.
  - `loadEnvBuffer(envPath)` : priorité `BACKUP_ENV_PATH` env var,
    sinon `envPath` fourni, sinon fallback `buildEnvFromProcessEnv()`.

### Tests

- T105-T109 (`tests/v3-backup-env-runtime.test.mts`) — **12/12 ✓** :
  - T105 (6) buildEnvFromProcessEnv whitelist (DATABASE_URL,
    auth, crypto, OAuth Drive, omet vars non définies, header
    commentaire).
  - T106 vars système non leakées (PATH/HOME/NODE_ENV/HOSTNAME/etc.).
  - T107 loadEnvBuffer fallback si fichier absent.
  - T108 BACKUP_ENV_PATH priorité + fallback si chemin invalide.
  - T109 round-trip encryptEnv → decryptEnv identité.
- Régression : **116/116 ✓** (10 suites). TypeCheck + `npm run build`
  clean.

### Documentation

- `docs/BACKUP.md` (Session 6) à mettre à jour pour mentionner la
  whitelist process.env (rc9 → patché in-place).

---

## [3.1.0-rc8] — 2026-05-08

### Fixed

- **Build webpack NAS** : `instrumentation.ts` traçait
  transitivement scheduler → runner → archiver / pdfkit /
  googleapis / AWS SDK même pour le bundle Edge runtime, qui ne
  sait pas résoudre `http`, `https`, `net`, `node:fs`, `node:zlib`.
  3 niveaux de fix dans `next.config.js` :
  1. `serverComponentsExternalPackages` étendu à
     `googleapis` + chaîne (`gaxios`, `https-proxy-agent`,
     `agent-base`, etc.) + `archiver` + `compress-commons` +
     `zip-stream` + `png-js` + `node-cron` + AWS SDK.
  2. `webpack` callback : pour bundle serveur (Node.js),
     marque ces packages comme `commonjs externals` (laissés en
     `require()` natif au runtime).
  3. `webpack` callback : pour bundle Edge runtime, alias
     `src/lib/backup/scheduler` vers
     `src/lib/backup/edge-stub.js` (no-op). Le runtime Node
     utilise le vrai scheduler ; le runtime Edge n'exécute
     jamais `initScheduler()` grâce au gating
     `process.env.NEXT_RUNTIME !== 'nodejs' return` dans
     `instrumentation.ts`, mais doit pouvoir compiler.
- **Vérif local** : `npm run build` clean (39 routes générées).
  Régression 104/104 ✓.

---

## [3.1.0-rc7] — 2026-05-08

### Added — Phase 2 Session 6 (documentation finale)

- **`docs/BACKUP.md` major refresh** — guide complet utilisateur :
  - Sommaire + ce qui est sauvegardé (layout S3 / Drive)
  - Configurer un backup S3-compatible (B2 step-by-step)
  - Configurer un backup Google Drive (5 étapes GCP + scopes
    OAuth + redirect URI + connexion in-app)
  - Schedule cron expressions (presets + customs courants + TZ)
  - Vérifier que les backups marchent (logs + UI historique +
    notifications email)
  - Restaurer un backup (complète + sélective bailleur + .env
    seul)
  - Stratégie 3-2-1 (3 copies / 2 supports / 1 off-site)
  - Test régulier de restauration (tous les 6 mois)
  - Sécurité (passphrase + S3 creds + refresh token Drive +
    chiffrement at-rest + transit + format OQENC1)
  - RPO / RTO (24h / 30min-2h typique)
  - Variables d'environnement
  - Troubleshooting (10 symptômes courants + fix)
  - Limitations v3.1.0 connues
- **`docs/CHIFFREMENT-UPLOADS.md`** : ajout section "Backup et
  chiffrement (v3.1.0)" — chaîne de clés à protéger, recommandation
  Recovery Kit dans gestionnaire de mots de passe externe.
- **`README.md`** : section "Sauvegardes" refresh — backup
  automatique cloud mis en avant + lien vers `docs/BACKUP.md` +
  méthode manuelle conservée en complément.

---

## [3.1.0] — 2026-05-09 (GA — Phase 2 backup cloud shippable)

**Phase 2 — Backup cloud automatique** livrée en 6 sessions + 5
hotfixes RC. Validé visuellement par user (toggle persisté + S3/Drive
opérationnels + restore CLI). Récapitulatif consolidé v3.1.0 GA :

### Hotfixes RC (rc8 → rc11)

- **rc8** : build webpack NAS — Edge runtime alias `scheduler →
  edge-stub.js` + `serverComponentsExternalPackages` étendu (chaîne
  googleapis + archiver + AWS SDK + node-cron + nodemailer).
- **rc9** : `runner.ts` reconstruit `.env` depuis `process.env`
  whitelist 16 vars critiques (le `.env` n'est pas bind-mounté
  dans le container Docker compose).
- **rc10** : Drive credentials migrés du `.env` vers DB chiffrés
  `enc:v1:` + UI Paramètres > Backup. Bootstrap migration
  idempotent au boot pour rétro-compat.
- **rc11** : Zod schema accepte sentinelle `'***'` pour
  `backupEnvPassphrase` (bug critique : toggle activation/
  désactivation ne se persistait jamais quand passphrase
  configurée — Zod rejetait `'***'` à cause de `.min(12)` →
  route 400 → DB inchangée).

### Backup automatique vers cloud

- **2 backends interchangeables** :
  - S3-compatible (Backblaze B2, Cloudflare R2, Wasabi, AWS S3,
    MinIO local) via `@aws-sdk/client-s3` + multipart auto.
  - Google Drive via `googleapis`, scope minimal `drive.file`.
- **UI Paramètres > Backup** (ADMIN only) : configuration complète
  (provider preset, schedule preset, slider rétention 7-365 jours,
  passphrase env avec warning IRRÉCUPÉRABLE), test connexion
  inline avec diagnostic `failedAt`, déclenchement manuel,
  historique 50 derniers runs avec auto-refresh + modale détails.
- **Schedule** via `node-cron` interne (singleton process-local),
  initialisé au boot via `instrumentation.ts`, reload immédiat sur
  update config (sans restart container).
- **Notifications email** échec (always) / succès (toggle) via
  `src/lib/email/` existant. Destinataires : env
  `BACKUP_NOTIFY_EMAIL` ou Users ADMIN actifs.
- **Format backup** : `openquittance/<instanceId>/<ISO-timestamp>/`
  contenant `manifest.json` (versions + hashes SHA-256) +
  `db.sql.gz` (`pg_dump` global) + `bailleurs/<slug>.zip` (réutilise
  `generateBailleurZip` Feature C) + `env.enc` (chiffré AES-256-GCM
  scrypt N=16384, format magic OQENC1).
- **Cleanup automatique** des backups > `retentionDays`.

### Schema + crypto

- 19 nouveaux champs `AppConfig` (storage type + S3 + Drive +
  schedule + retention + passphrase + last run + instanceId UUID v4
  permanent) + nouveau modèle `BackupRun` pour historique.
- Secrets chiffrés via convention `enc:v1:` existante
  (`crypto.encrypt`).
- Migrations `20260508160000_v3_backup_config` (S3 fields) +
  `20260508180000_v3_backup_drive_storage` (Drive fields).

### CLI restauration

- `scripts/restore-env.mjs` : déchiffre `env.enc` AES-GCM scrypt,
  prompt passphrase masqué (jamais en argv / env var). Output
  chmod 0o600.
- `scripts/restore-bailleur.mjs` : extrait ZIP bailleur, re-chiffre
  uploads automatiquement format ENC1 si `UPLOADS_ENCRYPTION_KEY`
  présent.

### Tests

- **125 tests** sur 9 suites — 100 % passent :
  - T78-T82 (15) opacité signature PDFs (v3.0.1)
  - T83-T86 (15) backup config + crypto
  - T87-T90 (17) backup runner mock S3
  - T91-T93 (15) scheduler + notifier
  - T94-T95 (12) UI Paramètres > Backup
  - T96-T100 (21) connecteur Google Drive
  - T101-T104 (7) E2E MinIO réel (skipé default, `TEST_E2E=1`)
  - T70-T74 (5) DOMPurify + rebrand v3.0
  - T75-T77 (4) GitHub readiness v3.0

### Documentation

- `docs/BACKUP.md` : guide complet 11 sections.
- `docs/CHIFFREMENT-UPLOADS.md` : ajout chaîne de clés backup.
- `README.md` : section Sauvegardes refresh.
- `.env.example` : `BACKUP_NOTIFY_EMAIL` + `BACKUP_ENV_PATH` +
  `GOOGLE_DRIVE_CLIENT_ID/SECRET` documentés.
- `docker-compose.test.yml` : stack E2E MinIO + Postgres test pour
  CI Phase 3.

### Dépendances ajoutées (v3.1.0)

- `@aws-sdk/client-s3@^3` (officiel, modulaire)
- `@aws-sdk/lib-storage@^3` (multipart auto)
- `node-cron@^3` (~30KB, scheduler interne)
- `aws-sdk-client-mock@^4` (dev — tests purs)
- `@types/node-cron` (dev)

### Dockerfile

- `apk add postgresql16-client` au stage runner (~+12MB) pour
  `pg_dump` accessible côté app.
- `COPY scripts/rotate-uploads-key.mjs` (fix v3.0.0-rc3 inclus
  dans v3.1.0).

---

## [3.1.0-rc6] — 2026-05-08

### Added — Phase 2 Session 5 (tests E2E MinIO + restore tooling)

- **`docker-compose.test.yml`** : stack de test E2E —
  `minio:RELEASE.2025-09-07T16-13-09Z` (port 9100 API + 9101
  console) + `postgres:16-alpine` (port 55432). Volumes éphémères.
  Healthchecks intégrés.
- **`tests/v3-backup-e2e.test.mts`** : tests E2E réels contre MinIO
  local (skip propre si `TEST_E2E` non défini → CI default).
  Couvre :
  - T101 `S3Storage.testConnection` → MinIO ok.
  - T102 `uploadFile` + `listKeys` + `deleteKey` round-trip.
  - T103 `encryptEnv` → upload → download → `decryptEnv` →
    identité (vérifie magic OQENC1 + scrypt KDF + AES-256-GCM).
  - T104 `cleanupOldBackupsViaStorage` filtre + suppression réelle.
  Setup auto : create bucket éphémère → tests → teardown
  (delete all + delete bucket).
- **`scripts/restore-env.mjs`** : CLI restauration `.env` chiffré
  AES-256-GCM (format OQENC1). Prompt interactif passphrase
  (jamais en argument CLI / env var pour éviter `ps` / shell
  history). Décrypte → écrit fichier mode `0o600`. Diagnostic
  erreur explicite (mauvaise passphrase / corruption / pas un
  env.enc OpenQuittance).
- **`scripts/restore-bailleur.mjs`** : CLI extraction ZIP bailleur
  (Feature C). `unzip -o -q` vers target dir. Re-chiffrement
  uploads automatique si `UPLOADS_ENCRYPTION_KEY` présent (format
  ENC1 magic v2.9.0+). Documentation explicite : ce script
  n'injecte PAS la DB — restaurer `db.sql.gz` global d'abord.

### Changed

- `cleanup.ts` : ajout `cleanupOldBackupsViaStorage()` testée E2E
  réellement contre MinIO (en plus des mocks aws-sdk-client-mock
  Session 2).

### Tests

- T101-T104 (`tests/v3-backup-e2e.test.mts`) : 7 assertions —
  uniquement actives avec `TEST_E2E=1` (CI Phase 3).
- Régression : **104/104 ✓** (9 suites). E2E skipé par défaut.

---

## [3.1.0-rc5] — 2026-05-08

### Added — Phase 2 Session 4bis (connecteur Google Drive)

- **Abstraction `BackupStorage`** ([src/lib/backup/storage/index.ts](src/lib/backup/storage/index.ts))
  — interface unique pour S3 et Drive avec methods
  `uploadFile` / `listKeys` / `deleteKey` / `testConnection`. Le runner
  ne connaît plus la cible — il appelle uniquement l'interface.
- **`storage/s3.ts`** : refacto code Session 2 derrière `S3Storage`
  class. Conserve compat shim `src/lib/backup/s3.ts` (legacy exports
  `createS3Client` / `testConnection` / `uploadStream` pour tests
  v3-backup-runner).
- **`storage/drive.ts`** : implémentation `DriveStorage` via
  `googleapis` (déjà installée pour Gmail OAuth). Scope minimal
  `drive.file` (accès uniquement aux fichiers créés par l'app).
  Mapping S3 ↔ Drive : slashes du key encodés en `___` (Drive ne
  supporte pas les paths). Refresh token chiffré `enc:v1:`.
- **`storage/load.ts`** : `loadStorageFromConfig(cfg)` sélecteur —
  retourne `S3Storage` ou `DriveStorage` selon
  `cfg.backupStorageType` (`'s3'` default, `'drive'`).
- **OAuth Drive flow** :
  - `GET /api/admin/backup/drive/oauth/start` → redirect Google
    consent, scope `drive.file` + `userinfo.email`, `prompt=consent`
    pour forcer refresh_token.
  - `GET /api/admin/backup/drive/oauth/callback` → échange code →
    `refresh_token` chiffré + `email` du compte stockés en DB.
    Redirect `/parametres/backup?drive_connected=1` ou
    `?drive_error=<msg>`.
- **Schema AppConfig** : 4 nouveaux champs —
  `backupStorageType String? @default("s3")`,
  `backupDriveFolderId String?`,
  `backupDriveRefreshToken String?` (chiffré),
  `backupDriveAccountEmail String?` (display UI).
  Migration `20260508180000_v3_backup_drive_storage` (ALTER TABLE,
  non bloquant).
- **UI `BackupForm`** :
  - Toggle "Type de stockage" : `S3-compatible | Google Drive`.
  - Section Drive : bouton "Connecter Google Drive" → OAuth start +
    affichage email connecté + bouton "Reconnecter" + input ID
    dossier Drive avec helper.
  - useEffect lit query params `drive_connected=1` /
    `drive_error=<msg>` après redirect callback → toast feedback.
- **Validation Zod** : `backupConfigSchema` accepte
  `backupStorageType: z.enum(['s3', 'drive'])` + refine conditionnel
  selon storage type (S3 exige endpoint+bucket+credentials, Drive
  exige folderId).
- **Test connection** : route `/api/admin/backup/test-connection`
  refactored pour utiliser `loadStorageFromConfig` + abstraction.
  Marche pour S3 et Drive uniformément.

### Changed

- **Runner** (`runBackup`) refactored pour utiliser
  `BackupStorage` au lieu de S3-specific. Layout
  `openquittance/<inst>/<ts>/...` identique pour S3 et Drive.
- **Cleanup** : ajout `cleanupOldBackupsViaStorage()` (nouvelle API
  abstraite). Legacy `cleanupOldBackups(client, bucket, ...)`
  conservée pour tests Session 2.

### Tests

- T96-T100 (`tests/v3-backup-drive.test.mts`) — **21/21 ✓** :
  - T96 (4) testConnection mock googleapis : ok / invalid_grant
    auth / put fail.
  - T97 (5) uploadFile encode key `___` + parents=[folderId] +
    media + supportsAllDrives.
  - T98 (5) listKeys filtre prefix encoded + decode `___ → /` +
    sizeBytes + modifiedAt + query Drive correcte.
  - T99 (3) deleteKey résout name → fileId via list puis delete.
  - T100 (4) loadStorageFromConfig sélecteur s3 / drive + throw
    si incomplet.
- Régression : **104/104 ✓** (9 suites). TypeCheck clean.

### Documentation

- `.env.example` : `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET`
  avec procédure 5 étapes (créer projet GCP + activer Drive API +
  OAuth consent + Credentials + redirect URI).

---

## [3.1.0-rc4] — 2026-05-08

### Added — Phase 2 Session 4 (UI Paramètres > Backup)

- **Page `/parametres/backup`** ([src/app/parametres/backup/page.tsx](src/app/parametres/backup/page.tsx))
  — gating client `session.user.role === 'ADMIN'`, fallback message
  shield si non-admin. Fetch `GET /api/parametres/backup` au mount.
- **`BackupForm.tsx`** — form ADMIN complet :
  - Toggle `backupEnabled` (sections suivantes conditionnelles).
  - **Provider preset** 5 boutons (Backblaze B2 / Cloudflare R2 /
    Wasabi / AWS S3 / Personnalisé) → pré-remplit endpoint + region
    + forcePathStyle.
  - Endpoint URL / Region / Bucket / Force path-style (toggle MinIO).
  - Access Key ID + Secret Access Key — input masqués `***` si déjà
    configurés en DB. `onFocus` clear si `***` + flag `*Dirty` → POST
    envoie nouvelle valeur OU `***` (sentinelle préservée par API).
  - **Schedule preset** 4 boutons (Quotidien 3h / Hebdo dim 3h /
    Lundi+jeudi / Personnalisé) → option custom affiche input cron.
  - Slider rétention 7-365 jours.
  - **Passphrase env** : warning rouge IRRÉCUPÉRABLE + checkbox
    confirmation obligatoire si passphrase saisie.
  - Toggle `backupNotifySuccess`.
  - Section "Dernier backup" (date + statut + erreur).
  - Section "Test result" inline (vert / jaune partiel / rouge avec
    `failedAt` diagnostic).
  - 3 boutons : Tester la connexion / Backup maintenant / Enregistrer.
- **`BackupHistory.tsx`** — historique 50 derniers `BackupRun` :
  - Table : Date / Durée / Taille / Bailleurs / Statut (badge
    couleur) / Erreur tronquée + tooltip / Détails.
  - Auto-refresh 30s si un run est `running`.
  - Modale détails avec JSON complet du `BackupRun`.
  - Helpers `formatBytes` / `formatDuration` / `statusBadge`.
- **Sidebar** : entrée "Backup" (icône `Cloud`) ajoutée entre
  "Indexation IRL" et "Paramètres".

### Tests

- T94-T95 (`tests/v3-backup-ui.test.mts`) — **12/12 ✓** :
  - T94 (6) : présence fichiers + markers (provider preset / schedule
    preset / passphrase warning / API endpoints / auto-refresh /
    secret mask handling).
  - T95 (3) : Sidebar `/parametres/backup` ajouté + 10 items
    existants intacts + cohérence 11 champs config UI ↔ route.
- Régression : **83/83 ✓** (8 suites). TypeCheck clean.

---

## [3.1.0-rc3] — 2026-05-08

### Added — Phase 2 Session 3 (cron auto + notif email + instrumentation)

- **`src/lib/backup/scheduler.ts`** — singleton `node-cron` :
  - `initScheduler()` : appelé au boot via instrumentation, lit
    `AppConfig.backupSchedule` + `backupEnabled`, démarre le cron si
    valide.
  - `reloadScheduler()` : stop/start après update config (ou no-op si
    schedule inchangé). Cron invalide → log + arrêt sans crash.
  - `stopScheduler()` : arrêt gracieux (SIGTERM-ready).
  - Job déclenché → `runBackup()` puis `sendBackupNotification()`.
- **`src/instrumentation.ts`** (Next.js boot hook) : appelle
  `initScheduler()` au démarrage runtime Node.js. Skip Edge runtime
  + skip phase build. Flag `experimental.instrumentationHook=true`
  ajouté à `next.config.js` (requis Next.js 14.x).
- **`src/lib/backup/notifier.ts`** — `sendBackupNotification()` :
  - Politique : `failed` toujours notifie, `success` notifie si
    `backupNotifySuccess=true`, sinon skip.
  - Destinataires : env `BACKUP_NOTIFY_EMAIL` (override) sinon emails
    Users ADMIN actifs.
  - Expéditeur : Parametres du premier admin avec config email
    valide (`gmail_api` ou `smtp`). Réutilise `sendViaSMTP` /
    `sendViaGmailAPI` existants.
  - Template HTML : status (vert/rouge) + table métriques (durée,
    taille, counts) + bloc erreur (escape-HTML safe) + lien
    `/parametres/backup`.
- **Hook runner** : `runBackup()` appelle `notifyAfterRun()` (catch
  silencieux) après update final `BackupRun`. Notif ratée ne fait
  pas échouer le backup.
- **Hook config update** : `POST /api/parametres/backup` appelle
  `reloadScheduler()` après save (catch silencieux). Schedule
  appliqué immédiatement sans redémarrage app.

### Changed

- **`next.config.js`** : `experimental.instrumentationHook = true`
  pour activer `register()` dans `src/instrumentation.ts`.

### Tests

- T91-T93 (`tests/v3-backup-scheduler.test.mts`) — **15/15 ✓** :
  - T91 (5) : start avec schedule valide / stop si désactivé / stop
    si schedule null / cron invalide → status=`invalid` + ancien
    stoppé.
  - T92 (2) : `unchanged` si même schedule, `started` si différent.
  - T93 (8) : politique notify (failed always, success toggle),
    formatBytes (5 bornes), formatDuration (4 cas), buildSubject
    (ÉCHEC/Succès), buildBody (text + html escape-HTML safe).
- Régression : **71/71 ✓** (backup-runner 17 + backup-config 15 +
  rebrand 3 + readiness 4 + opacity 15 + DOMPurify 2 + scheduler 15).
- `npx tsc --noEmit` clean.

### Dépendances ajoutées

- `node-cron@^3` : scheduler interne, ~30KB, mature.
- `@types/node-cron@^3` (dev).

### Documentation

- `.env.example` : ajout `BACKUP_NOTIFY_EMAIL` (override
  destinataires) + `BACKUP_ENV_PATH` (override chemin .env).

---

## [3.1.0-rc2] — 2026-05-08

### Added — Phase 2 Session 2 (runner backup S3 + pg_dump + chiffrement env)

- **`src/lib/backup/s3.ts`** — helpers S3-compatible
  ([B2 / R2 / Wasabi / AWS S3 / MinIO local]) :
  - `createS3Client(config)` : décrypte les credentials chiffrés et
    instancie un `S3Client` avec endpoint custom + forcePathStyle.
  - `testConnection(client, bucket)` : `HeadBucket` +
    `PutObject` test + `DeleteObject`. Retourne
    `{ ok, error?, failedAt? }` pour diagnostic UI.
  - `uploadStream(client, bucket, key, body)` : upload via
    `@aws-sdk/lib-storage Upload` (multipart auto > 5MB).
- **`src/lib/backup/runner.ts`** — orchestration `runBackup()` :
  - Layout S3 :
    `<bucket>/openquittance/<instanceId>/<ISO-timestamp>/`.
  - Étape 1 : `pg_dump` (spawn child_process via service `db:5432`)
    streamé `→ gzip → S3 db.sql.gz`.
  - Étape 2 : `generateBailleurZip` pour chaque bailleur actif
    (réutilise lib Feature C) → buffer → `S3 bailleurs/<slug>.zip`.
  - Étape 3 : `.env` chiffré AES-256-GCM via `encryptEnv()` (clé
    dérivée scrypt N=16384 + IV 12B + tag 16B + magic `OQENC1`)
    → `S3 env.enc`. Pas de dépendance `gpg` externe.
  - Étape 4 : `manifest.json` (versions, counts, hashes SHA-256
    par fichier, durée job ms) → `S3 manifest.json`.
  - Écrit `BackupRun` en DB au démarrage (status=`running`) puis
    update final (`success` / `failed` + sizeBytes BigInt + counts).
  - Update `AppConfig.backupLastRunAt` / `backupLastStatus` /
    `backupLastError` pour affichage UI.
- **`src/lib/backup/cleanup.ts`** — `cleanupOldBackups()` :
  - `ListObjectsV2` paginé sur prefix `openquittance/<instanceId>/`.
  - Parse timestamps depuis keys, filtre `< retentionDays`.
  - `DeleteObjects` par batch de 1000 (limite S3).
  - Retourne `{ deletedCount, freedBytes, deletedTimestamps[] }`.
- **Endpoints admin** :
  - `POST /api/admin/backup/test-connection` (ADMIN) → JSON
    `{ ok, error?, failedAt? }`.
  - `POST /api/admin/backup/run` (ADMIN) → 202 Accepted, lance
    `runBackup()` fire-and-forget.
  - `GET /api/admin/backup/runs` (ADMIN) → 50 derniers `BackupRun`
    (sizeBytes BigInt sérialisé string).

### Changed

- **Dockerfile runner stage** : ajout `apk add postgresql16-client`
  pour `pg_dump` accessible côté app (pointe vers service `db:5432`
  du compose). Image runner ~ +12MB.

### Tests

- T87-T90 (`tests/v3-backup-runner.test.mts`) — **17/17 ✓** :
  - T87 testConnection 5 paths (head OK / 403 / 404 / put fail /
    delete fail) via `aws-sdk-client-mock`.
  - T88 `encryptEnv` round-trip + auth tag GCM (mauvaise passphrase
    throw, tamper 1 bit ciphertext throw, salt+IV aléatoires).
  - T89 `cleanupOldBackups` : retentionDays=30 supprime backup 50j,
    garde 20j+1j ; deletedTimestamps + DeleteObjects keys correctes.
  - T90 bornes (retention=0 tout, retention=999 rien) + pagination
    `ListObjectsV2` 2 pages.
- Régression non-régression : 39/39 ✓ (backup-config 15/15 +
  rebrand 3/3 + readiness 4/4 + opacity 15/15 + DOMPurify 2/2).
- `npx tsc --noEmit` clean.

### Dépendances ajoutées

- `@aws-sdk/client-s3@^3` : SDK officiel AWS modulaire (compat B2 /
  R2 / Wasabi via endpoint custom).
- `@aws-sdk/lib-storage@^3` : multipart upload auto.
- `aws-sdk-client-mock@^4` (dev) : mock S3 pour tests purs.

---

## [3.1.0-rc1] — 2026-05-08

### Added — Phase 2 Session 1 (backup config schema + crypto + endpoint admin)

- **Schema AppConfig** : 15 nouveaux champs pour backup S3-compatible —
  `instanceId` (UUID v4 généré au premier POST, permanent),
  `backupEnabled`, `backupS3Endpoint`, `backupS3Region`,
  `backupS3Bucket`, `backupS3ForcePathStyle`, `backupS3AccessKeyId` *,
  `backupS3SecretKey` *, `backupSchedule` (cron), `backupRetentionDays`
  (default 30, bornes [7, 3650]), `backupEnvPassphrase` *,
  `backupNotifySuccess`, `backupLastRunAt`, `backupLastStatus`,
  `backupLastError`. (`*` = chiffré AES-256-GCM via `crypto.encrypt()`,
  préfixe `enc:v1:`.)
- **Modèle BackupRun** : historique des exécutions backup
  (`startedAt`, `finishedAt`, `status`, `sizeBytes BigInt`,
  `errorMessage`, `manifestS3Key`, `bailleursCount`, `zipsCount`).
  Index sur `startedAt` pour query LIMIT 50 récents.
- **Zod `backupConfigSchema`** ([src/lib/validation.ts](src/lib/validation.ts))
  : valide cron 5-champs lâche, URL endpoint, regex bucket S3
  (3-63 chars), retention [7, 3650], passphrase >= 12 chars. Refine
  conditionnel : `backupEnabled=true` impose secrets + schedule +
  passphrase non vides.
- **Endpoint admin** `POST/GET /api/parametres/backup` (ADMIN only,
  `requireStaffSession('ADMIN')`). GET masque les secrets configurés
  par `***`, null sinon. POST préserve la valeur DB chiffrée si secret
  reçu = `***` (UI peut PUT sans re-saisir). Génère `instanceId` UUID
  v4 au premier appel.
- **Migration Prisma** `20260508160000_v3_backup_config` :
  `ALTER TABLE AppConfig ADD COLUMN ... × 15` + `CREATE TABLE
  BackupRun + INDEX startedAt`.

### Tests

- T83-T86 (`tests/v3-backup-config.test.mts`) : Zod accepte config
  complète, encrypt préfixe `enc:v1:` + decrypt round-trip + IV
  aléatoire, masquage GET, cron 5 champs, refine `backupEnabled`,
  bornes retentionDays. **15/15 ✓**.
- Régression : v3-rebrand-rotate (3/3 ✓), v3-github-readiness (4/4 ✓),
  v3-signature-logo-opacity (15/15 ✓), DOMPurify (2/2 ✓).
- `npx tsc --noEmit` clean.

---

## [3.0.1] — 2026-05-08

### Added

- **Opacité paramétrable du logo en zone signature** sur tous les
  générateurs PDF (quittance, avis d'échéance, dépôt garantie, EDL
  entrée/sortie, courrier IRL). Champ `Bailleur.signatureLogoOpacity`
  (Int, 0-100, default 30). Slider dans Paramètres > Bailleurs >
  onglet Infos. Empêche le logo trop opaque de masquer la signature
  manuscrite.
- **Helper unifié `drawSignatureWithLogo`** dans
  [src/lib/pdf-helpers.ts](src/lib/pdf-helpers.ts) — encapsule la
  logique commune logo + signature avec `doc.opacity()` isolé via
  `save/restore`. Utilisé par `pdf-generator.ts` (quittance) et
  `pdf-documents.ts` (avis/DG/EDL/courrier).

### Changed

- **`pdf-documents.ts drawSignature`** : ajoute désormais le logo
  superposé derrière la signature manuscrite (auparavant signature
  seule). Cohérence avec `pdf-generator.ts` quittance.

### Tests

- T78-T82 (`tests/v3-signature-logo-opacity.test.mts`) : Zod accepte
  signatureLogoOpacity 50/80, rejette hors [0, 100] + non-int, helper
  applique `doc.opacity()` correctement, régression imports
  générateurs PDF. 15/15 ✓.

### Migration

- Migration Prisma `20260508140000_v3_signature_logo_opacity` :
  `ALTER TABLE Bailleur ADD COLUMN signatureLogoOpacity INTEGER NOT
  NULL DEFAULT 30`. Tous bailleurs existants démarrent à 30%.

---

## [3.0.0-rc3] — 2026-05-08

### Fixed

- **Dockerfile** : `scripts/rotate-uploads-key.mjs` désormais inclus
  dans l'image runtime (oublié en rc1/rc2 — seul `bootstrap.mjs`
  était copié). Permet `docker exec <container> node scripts/rotate-uploads-key.mjs`
  sans bind-mount externe.

---

## [3.0.0-rc2] — 2026-05-08

### Added

- Templates GitHub `.github/` : `ISSUE_TEMPLATE/` (bug + feature +
  config), `PULL_REQUEST_TEMPLATE.md`, `SECURITY.md` (politique
  divulgation responsable, 48h), `CODE_OF_CONDUCT.md` (Contributor
  Covenant 2.1).
- `CONTRIBUTING.md` à la racine — setup dev, lancement tests,
  conventions code, process PR, conventional commits.
- `CHANGELOG.md` — format Keep a Changelog (ce fichier).
- `docs/INSTALL.md` — install Docker, Synology Container Manager,
  VPS Linux, Cloudflare Tunnel.
- `docs/UPGRADE.md` — procédure upgrade entre versions, backup DB
  obligatoire, procédure spéciale v2.x → v3.0, rotation
  `UPLOADS_ENCRYPTION_KEY`, rollback.
- `docs/BACKUP.md` — placeholder Phase 2. Pour l'instant : pg_dump
  manuel + tar uploads + backup `.env`.
- `.github/workflows/ci.yml` — lint + tsc + build sur PR / push main.

### Tests

- T75 `SECURITY.md` contient mots-clés "responsible disclosure".
- T76 `CHANGELOG.md` contient "v3.0.0-rc1".
- T77 `CONTRIBUTING.md` sections requises (install, tests, PR).

---

## [3.0.0-rc1] — 2026-05-08

Première RC publique avec rebrand "OpenQuittance" et préparation
diffusion open source.

### Added

- **Rebrand "OpenQuittance"** dans toute l'UI : sidebar, layout
  title, footers email + portail, page "À propos", TOTP issuer,
  zip-export README.
- **`scripts/setup.mjs`** — wizard interactif (readline) qui
  vérifie Docker, génère secrets via `crypto.randomBytes`, prompt
  URL/OAuth/INSEE, écrit `.env` atomic + warning sauvegarde clés
  IRRÉCUPÉRABLES, lance `docker compose up -d --build`.
- **`scripts/rotate-uploads-key.mjs`** — rotation
  `UPLOADS_ENCRYPTION_KEY` (DRY-RUN + `--apply`). Walk archives +
  bailleurs, atomic via tmp+rename, exit 2 sur erreurs DRY-RUN.
- **README** : 3 badges (license MIT, version, status), section
  "Setup en 5 min" en haut, clarification "pas d'offre managée
  actuellement", Tipeee + GitHub Sponsors + Liberapay placeholder.
- **`package.json`** scripts `setup` + `rotate-uploads-key`.
- **`.gitignore`** : exclusion `docs/SESSION-LOGS.md` (PII user,
  traces clés rotatées).

### Changed

- `package.json` name : `quittances-app` → `openquittance`.
- Bump major v3.0 — publication open source readiness.

### Migration v2.9.x → v3.0

- Aucun changement de schema DB.
- Aucun changement d'API.
- Re-scanner QR code 2FA (TOTP issuer changé `Quittances` →
  `OpenQuittance`). L'ancien secret reste valide, c'est juste
  l'affichage qui change dans Authy / Google Authenticator.
- Variables d'env inchangées.

---

## [2.9.1] — 2026-05-07

### Fixed

- **DOMPurify signature email** — `dangerouslySetInnerHTML` sur la
  preview signature admin (`parametres/email/page.tsx:229`)
  désormais sanitisé via `isomorphic-dompurify`. Whitelist tags +
  attrs + URI scheme. Tests T70/T71.

### Security

- Redaction de `UPLOADS_ENCRYPTION_KEY` clear-text dans
  `docs/SESSION-LOGS.md`. **Note** : la clé reste dans l'historique
  git du commit `dd4e9c2`. Rotation recommandée avant publication
  open source (cf. `scripts/rotate-uploads-key.mjs` ajouté en
  v3.0.0-rc1).

---

## [2.9.0] — 2026-05-07

### Added

- **Chiffrement applicatif des uploads AES-256-GCM portable**.
  Format binaire `ENC1 (4) + IV (12) + tag (16) + ciphertext`.
  Permet l'app de tourner sur n'importe quel hébergement (NAS,
  VPS, Docker, cloud) sans dépendre d'une couche système chiffrée
  native.
- Env var `UPLOADS_ENCRYPTION_KEY` (32 bytes base64).
- `src/lib/uploads-crypto.ts` — `encryptBuffer`, `decryptBuffer`,
  `isEncrypted`, `decryptIfNeeded`. Lazy validation clé.
- Bootstrap migration : `[bootstrap/encrypt-uploads]` chiffre les
  fichiers en clair existants au boot. Idempotent.
- `docs/CHIFFREMENT-UPLOADS.md` — doc complète algo, format,
  threat model, avertissements perte de clé.

### Changed

- POST `/api/upload` + `/api/archives` : encrypt avant `writeFile`.
- GET `/api/uploads/[...path]` + `/api/portail/archives/[id]` +
  `/api/archives/[id]` + `/api/portail/bailleur/logo` : decrypt à
  la lecture.
- PDF generators (logo, signature) + zip-export : decrypt buffer
  in-memory pour PDFKit `doc.image()`.

---

## [2.8.0] — 2026-05-06

### Added

- **VAGUE 1 quick wins sécu** :
  - Open redirect login : `safeCallbackUrl()` refuse externe / `//evil`
  - Headers HTTP : CSP + X-Frame-Options=SAMEORIGIN + nosniff +
    Referrer-Policy + Permissions-Policy
  - `NEXTAUTH_SECRET` strict (refuse boot si vide ou < 32 chars)
  - Register 200 generic (anti-énumération)
  - Cron purge audit logs > 365j (overridable
    `AUDIT_LOG_RETENTION_DAYS`)
- **VAGUE 2 pages légales par bailleur** :
  - Schema `Bailleur` : 7 nouveaux fields (raisonSociale,
    formeJuridique, siret, adresseLegale, emailRgpd,
    directeurPublication, hebergeur).
  - `src/lib/legal-pages.ts` — `buildMentionsLegales` (5 sections
    LCEN art. 6) + `buildPolitiqueConfidentialite` (9 sections RGPD
    art. 13) + `bailleurSlug`.
  - Pages SSR `/mentions-legales/[slug]` +
    `/politique-confidentialite/[slug]` + `/portail/*` versions
    auth tenant.
  - Onglet "Légal" modale Bailleur.
  - Footers staff (StaffFooter) + portail x3 + email enrichis avec
    liens légaux.
- **VAGUE 3 droits RGPD locataire** :
  - DELETE `/api/locataires/[id]` cascade complète : Archives DB +
    fichiers physiques, Quittances/RevisionIRL via Prisma cascade,
    AuditLog anonymisé `deleted_loc_<sha256-12>`, User TENANT
    soft-delete si plus aucun loc lié.
  - GET `/api/locataires/[id]/export-rgpd` — ZIP RGPD individuel
    (data.json + quittances + documents + audit-log masqué).
  - `docs/RGPD.md` — procédures incident art. 33-34 (modèles CNIL +
    locataire), durées conservation, sous-traitants.

### Refactor

- v2.8.0-rc3 cohérence Infos/Légal modale Bailleur : suppression
  doublons (RCS Infos = SIRET Légal ; Nom = Raison sociale). Helper
  `formatRcsFooter()` PDF avec fallback legacy `rcs`. Migration
  bootstrap auto rcs→siret.

### Fixed

- v2.8.0-rc2 : `NEXTAUTH_SECRET` check lazy (build NAS Next
  "Collecting page data" évalue modules sans env runtime).

---

## [2.7.0] — 2026-05-06

### Added

- **Feature C — Export ZIP organisé bailleur**. Endpoint
  `GET /api/exports/bailleur/[id]/zip` (auth ADMIN, rate-limit
  1/5min). Arborescence `bailleur-slug/biens/{slug}/locataires/
  {slug}/quittances/{YYYY}/{YYYY-MM}_quittance.pdf` + manifest.json
  + README.txt + audit-log.json.
- Section "Export complet du bailleur" sur `/exports`.
- Quittances PDF régénérées dans le ZIP (cohérence avec UI).
- `archiver ^7.0.1` dependency.

---

## [2.6.0] — 2026-05-06

### Added

- **Feature B — Wizard nouveau logement** (`/biens/wizard`) — 4
  étapes : Bien (avec surface/typeBien/étage/DPE) → Documents →
  Locataire ou vacant → Annonce locative.
- Schema `Bien` extension : `surface`, `typeBien` (whitelist
  STUDIO/T1-T5_PLUS/MAISON/CHAMBRE/LOCAL_COMMERCIAL/AUTRE),
  `etage`, `dpeClasse` (A-G), `dpeKwh`, `dpeGes`, `annonceTexte`,
  `annonceMeta` (JSON), `coverPhotoArchiveId`.
- Catégorie Archive `PHOTO_BIEN`.
- Pure function `buildAnnonce()` génère texte plain pour
  LeBonCoin / SeLoger.
- Composant `<BienAnnonceForm>` partagé wizard step 4 + onglet
  Annonce modale Bien.

### Refactor

- v2.6.1 polish : 3 onglets modale Bien (Infos | Documents |
  Annonce). Édition fields nouveaux v2.6.

---

## [2.5.0] — 2026-05-06

### Added

- **Feature A — Documents propriétaire élargis**. Whitelist
  catégories Bien (ACTE_VENTE, CREDIT_IMMO, DPE, DIAG_*, ASSURANCE_PNO,
  GLI, COPRO_*, IMPOTS_*, AUTRE_BIEN) + Locataire (BAIL, EDL_*,
  GARANTIE_LOYER, etc.).
- Toggle `Locataire.partageDDT` — expose les diagnostics légaux
  (DPE, amiante, gaz, élec, plomb, ERP) au tenant via portail.
- UI Documents : pills "Locataires | Biens" + dropdown catégories
  (au lieu de texte libre) + onglet Documents modale Bien.

---

## [2.4.0] — 2026-05-05

### Added

- **Phase 1 doc sharing par locataire** : 3 toggles
  `partageQuittances`, `partageEtatDesLieux`, `partageBail` sur
  Locataire. Contrôle granulaire du partage portail.
- **Phase 2 multi-bailleur memberships m:n**. Helpers
  `withBailleurScope` + `requireResourceInScope` + 404
  oracle-free. 12/12 routes [id] couvertes.
- **Phase 3 page `/portail/login/verify` SSR** + désactivation
  auto portail 5 ans après dateSortie.
- **Phase 4 lint anti-régression** `scripts/lint-fetches.mjs`
  (whitelist routes scopées) + tests SSR multi-membership.
- **Phase 5 harmonisation email** : header bandeau couleur charte
  (Bailleur.pdfCouleur) + footer "Propulsé par".

### Notes

Pour les versions antérieures à v2.4.0, voir l'historique git
(`git log --oneline | grep -E "v2\\."`).

---

[Unreleased]: https://github.com/grx14/quittances-app/compare/v3.0.0-rc2...HEAD
[3.0.0-rc2]: https://github.com/grx14/quittances-app/compare/v3.0.0-rc1...v3.0.0-rc2
[3.0.0-rc1]: https://github.com/grx14/quittances-app/compare/v2.9.1...v3.0.0-rc1
[2.9.1]: https://github.com/grx14/quittances-app/compare/v2.9.0...v2.9.1
[2.9.0]: https://github.com/grx14/quittances-app/compare/v2.8.0...v2.9.0
[2.8.0]: https://github.com/grx14/quittances-app/compare/v2.7.0...v2.8.0
[2.7.0]: https://github.com/grx14/quittances-app/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/grx14/quittances-app/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/grx14/quittances-app/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/grx14/quittances-app/releases/tag/v2.4.0
