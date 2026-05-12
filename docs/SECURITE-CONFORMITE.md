# Audit sécurité + conformité — quittances-app v2.7.0

Date : 2026-05-07. Audit pur lecture, aucune modification de code.

Légende verdicts : **OK** / **À RENFORCER** / **NON CONFORME** / **N/A**.

---

## 1. Sécurité technique

### 1.1 Authentification

#### 1.1.1 Hashage mots de passe staff
- **État** : bcryptjs ^2.4.3, **10 rounds** (`bcrypt.hash(password, 10)`).
  - [src/app/api/register/route.ts:72](src/app/api/register/route.ts#L72)
  - [src/auth.ts:72](src/auth.ts#L72) `bcrypt.compare()` sur login.
- **Verdict** : **OK**. 10 rounds = ~100 ms en 2026, équilibre UX/sécurité standard. bcrypt gère salt + algo internement.
- **Reco** : envisager 12 rounds si commercialisation (acceptable jusqu'à ~400 ms login).

#### 1.1.2 Magic link locataire
- **État** :
  - Génération : `randomBytes(32).toString('hex')` → 64 chars hex = **256 bits d'entropie** [src/lib/portail-magic.ts:25](src/lib/portail-magic.ts#L25).
  - Hash DB : **scrypt** déterministe, salt = `NEXTAUTH_SECRET`, output 32 bytes [src/lib/portail-magic.ts:113-123](src/lib/portail-magic.ts#L113-L123).
  - Expiration : **15 minutes** (`EXPIRY_MS = 900000`) [src/lib/portail-magic.ts:15](src/lib/portail-magic.ts#L15).
  - Usage unique : `updateMany WHERE consumedAt IS NULL` atomique → race condition-safe [src/lib/portail-magic.ts:58-62](src/lib/portail-magic.ts#L58-L62).
- **Verdict** : **OK**. Entropie + expiration + usage unique conformes OWASP. Salt déterministe est un compromis pour `findUnique` sur `tokenHash`.
- **Reco** : OK en l'état. Si volume haut, envisager rotation `NEXTAUTH_SECRET` (invalide tous les magic links existants — acceptable car expiration courte).

#### 1.1.3 2FA / TOTP staff
- **État** :
  - `otplib` (authenticator), window=1 (±30 s tolérance), 6 digits, SHA1 (RFC 6238).
  - Secret stocké chiffré : `encryptTotpSecret()` = `encrypt()` AES-256-GCM avec IV aléatoire 12 bytes + auth tag 16 bytes [src/lib/crypto.ts:41-46](src/lib/crypto.ts#L41-L46).
  - Clé dérivée de `ENCRYPTION_SECRET` via SHA-256 [src/lib/crypto.ts:26-29](src/lib/crypto.ts#L26-L29).
  - Backup codes : 8 × 10 chars hex, hash scrypt avec salt aléatoire format `salt:hash`, comparaison `timingSafeEqual()` [src/lib/totp.ts:72-85](src/lib/totp.ts#L72-L85).
- **Verdict** : **OK**. Implémentation propre.
- **Reco** : RAS.

#### 1.1.4 JWT NextAuth
- **État** :
  - `NEXTAUTH_SECRET` requis via env (validé au build).
  - **Fallback hardcodé `'fallback-salt-not-prod'`** dans `portail-magic.ts:113` si env manquant — utilisé pour scrypt salt magic link. ⚠️ Si déploiement bug avec env vide, dégradation silencieuse.
  - Strategy = `jwt` (pas de session DB).
  - Sliding session : callback `jwt()` re-fetch les `memberships` à chaque requête authentifiée [src/auth.ts:204-211](src/auth.ts#L204-L211).
  - Expiration JWT : default NextAuth (30 j sliding).
- **Verdict** : **À RENFORCER** (fallback hardcodé).
- **Reco** : faire `throw` au boot si `NEXTAUTH_SECRET` vide ou `< 32 chars`. Bloquer plutôt que dégrader.

---

### 1.2 Autorisation

#### 1.2.1 Multi-bailleur isolation server-side
- **État** :
  - 4 helpers exposés [src/lib/multi-bailleur.ts](src/lib/multi-bailleur.ts) :
    - `withBailleurScope(session, requestedBailleurId)` (ligne 64-100) — routes liste
    - `requireResourceInScope(session, fetcher)` (ligne 133-154) — routes `[id]`
    - `allowedBailleurIds(session)` (ligne 116-119)
    - `handleScopeError(e)` (ligne 161-164)
  - Memberships chargés par jwt callback à chaque hit, fresh côté DB.
  - **34 fichiers** sur 69 routes API utilisent les helpers (les 35 restantes = routes auth/portail/public sans scope multi-tenant — correct).
- **Verdict** : **OK**.
- **Reco** : RAS. Couverture exhaustive sur les routes scopées.

#### 1.2.2 Routes [id] — 404 oracle-free
- **État** : 12/12 routes `[id]` métier utilisent `requireResourceInScope()` retournant **404** (jamais 403) si hors scope :
  - [src/app/api/bailleurs/[id]/route.ts](src/app/api/bailleurs/[id]/route.ts), biens/[id], locataires/[id], archives/[id], portail/archives/[id], etc.
- **Verdict** : **OK**. Pattern uniforme, pas de leak via discrimination 403/404.

#### 1.2.3 Audit log scopé bailleurId
- **État** : `logAudit({ targetType, targetId, metadata: { bailleurId, ... } })` présent sur :
  - upload/delete archive, send email quittance, export PDF/XML/ZIP, magic link request, tenant login/download, role change, etc.
  - Catalogue `AuditAction` strict typé [src/lib/audit.ts:7-53](src/lib/audit.ts#L7-L53).
- **Verdict** : **OK** sur l'audit. `purgeOldAuditLogs()` défini ([audit.ts:105](src/lib/audit.ts#L105)) **mais jamais appelé** → croissance illimitée.
- **Reco** : ajouter purge périodique dans `scripts/bootstrap.mjs` (rétention 24 mois, alignée RGPD logs traitement).

---

### 1.3 Données au repos

#### 1.3.1 Encryption Postgres
- **État** : Postgres standard, pas de `pgcrypto` ni TDE (Transparent Data Encryption). Données métier (locataires, quittances, montants) en clair dans le datadir Postgres.
- **Verdict** : **À RENFORCER** selon contexte.
- **Reco** :
  - Self-hosted 1 user : acceptable si NAS lui-même chiffré (Synology Encrypted Shared Folder ✓ recommandé).
  - Commercialisation : exigence HDS (santé) ou SecNumCloud → migrer vers hébergeur certifié + TDE.

#### 1.3.2 Champs sensibles chiffrés app-side
- **État** :
  - `Parametres.gmailRefreshToken` / `gmailAccessToken` / `smtpPass` : chiffrés AES-256-GCM (`encrypt()` lib) avant insert [src/app/api/parametres/route.ts:18,38](src/app/api/parametres/route.ts#L18).
  - `User.totpSecret` + backup codes : idem chiffrés (cf. 1.1.3).
  - `PortailMagicLink.tokenHash` : scrypt one-way.
- **Verdict** : **OK** (champs critiques chiffrés).

#### 1.3.3 Uploads (DPE, baux, EDL, photos)
- **État** : stockés **en clair** dans `UPLOADS_DIR/archives/<id><ext>`. Pas de chiffrement at-rest applicatif. Path serving via `/api/uploads/[...path]` avec scope check + path traversal protection.
- **Verdict** : **À RENFORCER**.
- **Reco** :
  - Court terme : confier le chiffrement at-rest au filesystem NAS (Synology Encrypted Shared Folder).
  - Moyen terme : envisager AES-256-GCM par fichier au moment du `writeFile`, déchiffrement à la lecture (perf overhead acceptable, ~1-3 % CPU).
  - Long terme : signed URLs pour serve direct (S3-compatible) si scaling.

#### 1.3.4 Backups
- **État** : non observable côté code. Dépend de la config Hyper Backup Synology.
- **Verdict** : **N/A** (hors code app).
- **Reco user** : Hyper Backup chiffré + off-site (Synology C2, B2, ou disque externe rotation). RTO/RPO documentés.

---

### 1.4 Transport

- **État** : non observable côté code. Dépend du reverse-proxy DSM Synology + Cloudflare en amont (cf. `reference_nas_deploy.md`).
- **Verdict** : **N/A** (hors code app).
- **Reco user** :
  - Forcer redirect HTTP→HTTPS au niveau DSM reverse proxy.
  - HSTS `max-age=31536000; includeSubDomains; preload` sur le domaine principal.
  - TLS 1.2 minimum (1.3 préférable).
  - Let's Encrypt auto-renewal via DSM (déjà en place vraisemblablement).

---

### 1.5 Headers de sécurité

- **État** :
  - `next.config.js` : pas de `headers()` config.
  - `src/middleware.ts` : ajoute `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` sur les routes dynamiques (anti-cache pour sessions).
  - **Aucun CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy** détecté.
- **Verdict** : **À RENFORCER**.
- **Reco** : ajouter dans `next.config.js` :

  ```js
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none';" },
      ],
    }];
  }
  ```

---

### 1.6 Anti-abus

#### 1.6.1 Rate limit
- **État** : `src/lib/rate-limit.ts` in-memory (Map process-local). Routes protégées :
  - `POST /api/auth/credentials` (login staff) — 5 / 15 min / IP [src/auth.ts:53-57](src/auth.ts#L53-L57)
  - `POST /api/register` — 3 / heure / IP [src/app/api/register/route.ts:12-21](src/app/api/register/route.ts#L12-L21)
  - `POST /api/portail/login` — 3 / heure / email [src/app/api/portail/login/route.ts:34-44](src/app/api/portail/login/route.ts#L34-L44)
  - `POST /api/portail/login/verify` — RL pour brute-force token [src/app/api/portail/login/verify/route.ts:28](src/app/api/portail/login/verify/route.ts#L28)
  - `GET /api/exports/bailleur/[id]/zip` — 1 / 5 min / user (cf. Feature C v2.7.0)
- **Verdict** : **OK** pour endpoints critiques. Single-instance OK actuellement.
- **Reco** : si scaling multi-instance → migrer vers Redis (`@upstash/ratelimit` ou ioredis). Documenté dans `rate-limit.ts:5`.

#### 1.6.2 Anti-énumération
- **État** :
  - Portail login : retourne **toujours 200** quel que soit l'état de l'email (inexistant, désactivé, sans portail) [src/app/api/portail/login/route.ts:47,76,121](src/app/api/portail/login/route.ts#L47). ✓
  - Register : **409 si email déjà utilisé** [src/app/api/register/route.ts:63](src/app/api/register/route.ts#L63) → permet d'**énumérer les staff inscrits**.
- **Verdict** : **À RENFORCER** côté register.
- **Reco** : retourner 200 ou 400 generic message « Inscription échouée » + log côté serveur du vrai motif. Trade-off UX (le user ne sait pas pourquoi) vs sécurité.

#### 1.6.3 CAPTCHA
- **État** : aucun CAPTCHA observé sur endpoints publics (register, portail login).
- **Verdict** : **À RENFORCER** si exposition publique.
- **Reco** : hCaptcha ou Cloudflare Turnstile sur register + portail login (gratuit, pas de cookies tiers RGPD si Turnstile).

---

### 1.7 Vulnérabilités classiques

#### 1.7.1 CSRF
- **État** : NextAuth v5 gère le CSRF token + cookies SameSite=Lax par défaut. Pas d'override custom.
- **Verdict** : **OK** pour les routes auth. Endpoints custom non-NextAuth utilisent `requireStaffSession` qui valide la session via cookie SameSite-protected.
- **Reco** : RAS. Pour routes critiques mutating sans NextAuth (peu probable ici), envisager double-submit cookie.

#### 1.7.2 XSS — résolu v2.9.1

**Statut v2.9.1** : ✅ résolu via `isomorphic-dompurify` sur le seul
point d'injection (preview signature email admin). Whitelist tags +
attrs + URI scheme. Tests T70/T71 dans `tests/dompurify-signature.test.mts`.


- **État** :
  - **1 occurrence `dangerouslySetInnerHTML`** : [src/app/parametres/email/page.tsx:229](src/app/parametres/email/page.tsx#L229) — preview signature email saisie par l'admin.
    - Contexte admin-only (staff authentifié), input contrôlé par lui-même. Risque XSS self-only si admin colle du HTML malveillant. Pas de sanitization (DOMPurify, etc.).
  - Email templates [src/lib/email/index.ts:19-26](src/lib/email/index.ts#L19-L26) : helper `escapeHtml()` correct, utilisé sur tous les champs dynamiques (nom locataire/bailleur, montants, dates, ville, couleurs).
- **Verdict** : **À RENFORCER** (1 point d'injection admin-only).
- **Reco** : ajouter DOMPurify côté preview signature ; ou storer signature en plain text + rendu via `<pre>`.

#### 1.7.3 SQL injection
- **État** : grep `$queryRaw` / `$executeRaw` → **aucune occurrence**. 100 % Prisma typé paramétré.
- **Verdict** : **OK**.

#### 1.7.4 Path traversal
- **État** : 3 routes file serving, **toutes** valident `path.resolve(UPLOADS_DIR, rel)` + `startsWith(path.resolve(UPLOADS_DIR))` → 400 si évasion :
  - [src/app/api/uploads/[...path]/route.ts:75-79](src/app/api/uploads/[...path]/route.ts#L75-L79)
  - [src/app/api/portail/archives/[id]/route.ts:85-88](src/app/api/portail/archives/[id]/route.ts#L85-L88)
  - [src/app/api/archives/[id]/route.ts:53-56](src/app/api/archives/[id]/route.ts#L53-L56)
- **Verdict** : **OK**.

#### 1.7.5 Open redirect
- **État** : [src/app/login/page.tsx:12,51](src/app/login/page.tsx#L12) lit `callbackUrl` depuis `useSearchParams()` puis `router.push(callbackUrl)` **sans validation**.
- **Risque** : `?callbackUrl=https://evil.com` après login → redirect vers domaine attaquant. Vector phishing.
- **Verdict** : **NON CONFORME**.
- **Reco** : valider `callbackUrl` :

  ```ts
  const safeCallback = callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')
    ? callbackUrl
    : '/';
  router.push(safeCallback);
  ```

  Strict allowlist : refuser tout sauf path relatif commençant par `/`.

---

## 2. Conformité RGPD

### 2.1 Droits des personnes

| Droit | État | Verdict |
|-------|------|---------|
| Accès | Pas d'export structuré pour 1 locataire (l'export ZIP v2.7.0 est par bailleur). Tenant peut télécharger ses propres quittances/EDL/bail via `/portail/documents`. | **À RENFORCER** |
| Rectification | Couvert via UI staff (édition Locataire). Tenant ne peut pas s'auto-modifier. | **À RENFORCER** (auto-rectif tenant) |
| Effacement | Schema cascades : `Locataire.tenantUser` → `SetNull` (User TENANT reste). Suppression Locataire ne purge pas le User TENANT lié. `Archive` ownerId polymorphe → pas de cascade auto. | **NON CONFORME** |
| Portabilité | Export ZIP par bailleur (Feature C). Pas par locataire. | **À RENFORCER** |
| Opposition / limitation | Toggles `partage*` désactivent la diffusion vers le tenant — ne supprime pas la donnée. | **À RENFORCER** |

- **Reco** :
  - Endpoint `/api/locataires/[id]/export-rgpd` : ZIP des données du locataire (toutes ses quittances + ses archives + journal d'audit le concernant) — déclenchable par staff ADMIN sur demande locataire.
  - Endpoint `/api/locataires/[id]/erase-rgpd` : suppression cascade User TENANT + memberships + archives `ownerType=Locataire` + magic links + audit logs anonymisés (remplace `actorId` par `null` ou ID anonyme). Réservée ADMIN, audit explicite.
  - Page `/portail/mes-donnees` côté tenant : self-service export + demande effacement (workflow validation staff).

---

### 2.2 Bases légales

- **Locataires** : exécution du contrat (bail) — base légale art. 6.1.b RGPD. **À documenter** dans politique de confidentialité.
- **Staff** : exécution du contrat de travail / mandat. **À documenter**.
- **Cookies** :
  - Session NextAuth `next-auth.session-token` (HTTP-only, SameSite=Lax) — strictement nécessaire au fonctionnement → **dispense de consentement** (CNIL).
  - CSRF token — idem strictement nécessaire.
  - Pas de cookies tiers (analytics, marketing) observés.
- **Verdict** : **OK technique**. Pas de banner consent nécessaire en l'état. **À RENFORCER** documentation.

---

### 2.3 Minimisation

- **Champs collectés Locataire** : nom, prenom, email (optionnel), telephone (optionnel), loyerNu, charges, dateEntree, dateSortie, IRL, dépôt garantie. → **Tous nécessaires** à la gestion locative.
- **Conservation** :
  - Désactivation portail auto à 5 ans après `dateSortie` ([scripts/bootstrap.mjs:34-40](scripts/bootstrap.mjs#L34-L40)). ✓
  - **Pas de purge** des Locataires/Quittances en DB après expiration légale (5 ans loi 24 mars 2014 / 3 ans pour quittance art. 7-1 loi 89-462).
- **Audit logs** : `purgeOldAuditLogs()` défini mais **jamais appelé**. → croissance illimitée.
- **Verdict** : **À RENFORCER**.
- **Reco** :
  - Cron purge audit logs > 24 mois (sauf events sécurité critiques à conserver 5 ans).
  - Cron purge Locataires/Quittances > 5 ans (ou 10 ans si litige potentiel — à valider avec juriste).
  - UI staff : warning quand approche limite de conservation.

---

### 2.4 Sécurité au sens RGPD (art. 32)

- **Notification de violation** : pas de procédure documentée.
- **Sous-traitants** :
  - **Google (Gmail API)** : envoi des emails quittance/portail si `emailMethod='gmail_api'`. Refresh token stocké chiffré [src/lib/email/gmail-sender.ts](src/lib/email/gmail-sender.ts).
  - **SMTP user-configured** : alternative sans Google (nodemailer).
  - **Hébergeur** : NAS Synology personnel (auto-hébergement) → pas de sous-traitant tiers.
- **Transferts hors UE** :
  - Gmail API → Google LLC (USA). Cadre : Google a signé Data Processing Addendum (DPA), Standard Contractual Clauses (SCCs), Data Privacy Framework (USA, 2023+). ✓ Cadre légal présent.
  - Cloudflare (si reverse proxy en frontal) → idem DPF + SCCs.
- **Verdict** : **À RENFORCER** côté documentation.
- **Reco** :
  - Documenter procédure incident (qui notifier, dans quel délai 72h CNIL, modèle de notification locataires).
  - Lister sous-traitants dans politique confidentialité (Google, Cloudflare, hébergeur si externe).
  - Si user souhaite zéro transfert hors UE : recommander email SMTP via Mailjet/Brevo (FR/UE) plutôt que Gmail.

---

### 2.5 Documentation

- **État** : aucune page « Politique de confidentialité », « Mentions légales », « CGU » détectée dans `src/app/`.
- **Verdict** : **NON CONFORME** (obligation légale art. 13 RGPD + LCEN mentions légales).
- **Reco** :
  - Créer `/mentions-legales` (éditeur, hébergeur, contact, directeur publication).
  - Créer `/politique-confidentialite` (responsable traitement, finalités, bases légales, durées, droits, sous-traitants, transferts).
  - Lien footer toutes pages + page `/portail/login` + page `/login` staff.
  - Si commercialisation future : ajouter `/cgu` + `/cgv` + DPA template pour bailleurs clients.

---

## 3. Conformité France — gestion locative

### 3.1 Mentions obligatoires quittance (loi 89-462 art. 21 + décret 2015-587)

Audit `generateQuittancePdf` [src/lib/pdf-generator.ts](src/lib/pdf-generator.ts) :

| Mention | Présence | Référence |
|---------|----------|-----------|
| Identité bailleur (nom + adresse) | ✓ | drawHeader (ligne 156-203), drawParties DE (ligne 235-251), drawFooterBand (ligne 451-477) |
| RCS si SCI | ✓ optionnel (`bailleur.rcs`) | drawParties (ligne 248), drawFooterBand (ligne 470-473) |
| Identité locataire (nom + prenom) | ✓ | drawParties POUR (ligne 254-258) |
| Adresse logement | ✓ | drawParties (ligne 259-267), drawBienBox (ligne 273-298) |
| Période concernée (mois/année) | ✓ | drawHeader PÉRIODE (ligne 200), drawTitleRow (ligne 213-214) |
| Détail loyer / charges | ✓ | drawDetailTable (ligne 305-307) |
| Total | ✓ | drawTotalBar (ligne 142) |
| Date paiement | ✓ | drawBienBox (ligne 290-295) |
| Date émission | ✓ | drawHeader ÉMIS LE (ligne 201) |
| Mention « donne quittance » | ✓ | drawAttestation (ligne 405) « lui en donne quittance, sous réserve de tous droits » |
| Mention loi 89-462 art. 21 | ✓ | drawFooterBand (ligne 475) « Loi n° 89-462 du 6 juillet 1989, art. 21 — Quittance à conserver 3 ans. » |

- **Verdict** : **OK**. Toutes les mentions obligatoires présentes.
- **Reco** : RAS sur la quittance. Audit possible pour Avis échéance / Reçu dépôt / EDL / Courrier révision IRL — non couverts ici (mentions obligatoires moins strictes).

---

### 3.2 Documents annexés au bail (DDT loi ALUR + Climat & Résilience)

- **État** :
  - Catégories DDT whitelist : DPE, DIAG_AMIANTE, DIAG_ELEC, DIAG_GAZ, DIAG_PLOMB, ERP [src/lib/archive-categories.ts:69-76](src/lib/archive-categories.ts#L69-L76).
  - Toggle `Locataire.partageDDT` (default false, opt-in admin) → expose au tenant via `/portail/documents` ssi le bien a au moins un loc avec toggle=true.
  - Filet serveur strict : autres catégories Bien (ACTE_VENTE, CREDIT_IMMO, IFI...) **jamais** exposées tenant.
- **Verdict** : **OK**. Mécanisme conforme à l'obligation de remise du DDT au locataire.
- **Reco** : ajouter rappel UI sur fiche Bien si DPE manquant (en location ou bientôt vacant) — l'absence de DPE rend le bail non conforme à la loi Climat & Résilience.

---

### 3.3 Conservation

- **État** :
  - Quittances : pas de purge auto. Restent indéfiniment en DB.
  - Bail : durée + 3 ans légalement. Pas appliqué.
  - Cautionnement : 5 ans. Pas appliqué.
  - Désactivation portail tenant à 5 ans : ✓ implémentée.
- **Verdict** : **À RENFORCER**.
- **Reco** :
  - Ajouter purge auto Locataire + Quittance + Archive après 5 ans `dateSortie` (avec confirmation manuelle option).
  - Distinction : conservation **comptable** (10 ans pour pièces comptables — code de commerce art. L123-22) vs RGPD (durée nécessaire au traitement). Si bailleur SCI = comptabilité requise → pencher 10 ans.

---

### 3.4 Encadrement loyers / révision IRL

- **État** : module IRL applique la formule (`nouveauLoyer = ancienLoyer × IRL_nouveau / IRL_référence`), trimestre + valeur référence stockés sur Locataire, courrier auto-généré (`generateCourrierRevision`), suivi recommandé optionnel. Logique conforme art. 17-1 loi 89-462.
- **Verdict** : **OK**.
- **Reco** :
  - Si zone tendue (encadrement renforcé) : ajouter check loyer de référence majoré (Paris, Lille, etc.). Pas couvert v2.7.0.

---

## 4. Hébergement

### 4.1 Setup actuel (NAS Synology personnel)

- **État** : 1 user, mono-instance, NAS personnel domicile. App exposée via reverse proxy DSM + Cloudflare. Postgres en compose interne, pas exposé.
- **Implications RGPD** :
  - Bailleur particulier hébergeant ses propres données = cas du **fichier domestique** (art. 2.2.c RGPD — exception activité personnelle). Si **moins de N locataires gérés à titre privé**, RGPD allégé.
  - Dès qu'on gère pour des tiers (mandataire, agence, SCI multi-associés) : RGPD plein.
- **Verdict** : **OK** pour usage perso. **À RENFORCER** si gestion pour tiers.
- **Reco** :
  - Synology Encrypted Shared Folder pour le datadir Postgres + UPLOADS_DIR.
  - 2FA admin Synology DSM activé.
  - Backup Hyper Backup chiffré + off-site (C2 Cloud, B2, ou disque rotation).
  - UPS pour shutdown propre Postgres.
  - Logs DSM exports périodiques (audit accès SSH, web admin).

---

### 4.2 Si commercialisation future (SaaS multi-bailleurs)

- **Pré-requis structurants** :
  - Hébergeur certifié : OVH, Scaleway, Outscale (SecNumCloud disponibles). HDS uniquement si données santé — pas le cas ici, mais argument commercial.
  - DPO désigné (obligatoire art. 37 RGPD si traitement systématique grande échelle).
  - Audit pen-test pré-mise en marché.
  - CGU + CGV + DPA modèle pour clients bailleurs (eux-mêmes responsables de traitement vis-à-vis de leurs locataires).
  - Politique confidentialité et mentions légales versionnées.
  - Procédure incident de sécurité documentée (notification CNIL <72h).
  - Registre des traitements art. 30 RGPD.
  - Encryption at-rest applicative (AES-256 sur uploads + DB pgcrypto sur champs sensibles).
  - Migration rate-limit Redis.
  - Multi-instance + réplication DB.
  - Monitoring/observability (Sentry, métriques, alertes).
- **Verdict** : **NON CONFORME** en l'état pour SaaS commercial.
- **Reco** : roadmap dédiée v3.0 si commercialisation.

---

## 5. Synthèse + plan de remédiation

### 5.1 Risques par sévérité

| Sévérité | Item | Section |
|----------|------|---------|
| 🔴 **Élevé** | Open redirect callbackUrl | 1.7.5 |
| 🔴 **Élevé** | Pas de page Politique confidentialité / Mentions légales | 2.5 |
| 🟠 **Moyen** | NEXTAUTH_SECRET fallback hardcodé | 1.1.4 |
| 🟠 **Moyen** | Pas de CSP / X-Frame-Options / etc. | 1.5 |
| ✅ **Résolu v2.9.1** | dangerouslySetInnerHTML signature email — DOMPurify ajouté | 1.7.2 |
| 🟠 **Moyen** | Anti-énumération register (409 sur email existant) | 1.6.2 |
| 🟠 **Moyen** | Effacement RGPD locataire incomplet (cascade lacunaire) | 2.1 |
| 🟠 **Moyen** | Pas d'export RGPD par locataire | 2.1 |
| 🟠 **Moyen** | Uploads en clair sur disque (OK si NAS chiffré, à doc) | 1.3.3 |
| 🟡 **Faible** | purgeOldAuditLogs jamais appelé | 1.2.3 |
| 🟡 **Faible** | Pas de purge Locataires/Quittances expirés | 3.3 |
| 🟡 **Faible** | Pas de CAPTCHA endpoints publics | 1.6.3 |
| 🟡 **Faible** | Pas de procédure incident documentée | 2.4 |

### 5.2 TOP 5 quick wins (effort faible, gain immédiat)

1. **Headers sécurité** : ajouter `headers()` dans `next.config.js` (CSP + X-Frame-Options + nosniff + Referrer-Policy). ~30 min.
2. **Fix open redirect login** : valider `callbackUrl` côté client (allowlist path relatif). ~10 min.
3. **NEXTAUTH_SECRET strict** : throw au boot si env vide ou < 32 chars. ~15 min.
4. **Anti-énumération register** : retourner 200 generic au lieu de 409 (log motif côté server). ~10 min.
5. **Cron purge audit logs** : `purgeOldAuditLogs(730)` dans `bootstrap.mjs` étape 0ter. ~10 min.

**Total : ~1h15. Réduit la moitié des findings 🔴/🟠.**

### 5.3 TOP 5 chantiers structurants (effort moyen-élevé)

1. **Pages Politique confidentialité + Mentions légales** : rédaction juriste + lien footer + page `/portail/login`. **Bloquant légal.** ~1 jour rédac + 0.5 jour intégration.
2. **Droits RGPD locataire** : endpoint export ZIP + endpoint erase cascade complète + UI `/portail/mes-donnees`. ~2 jours.
3. **Sanitization signature email** : DOMPurify ou rendu en `<pre>` brut. ~0.5 jour.
4. **Cron purge Locataires/Quittances expirés** : décision de seuil (5/10 ans), UI warning, audit explicite. ~1 jour.
5. **Procédure incident + registre traitements** : doc-only, pas de code. ~0.5 jour.

---

## Annexes

### A. Fichiers audités

- [src/auth.ts](src/auth.ts), [src/auth.config.ts](src/auth.config.ts)
- [src/lib/portail-magic.ts](src/lib/portail-magic.ts), [src/lib/totp.ts](src/lib/totp.ts), [src/lib/crypto.ts](src/lib/crypto.ts)
- [src/lib/multi-bailleur.ts](src/lib/multi-bailleur.ts), [src/lib/audit.ts](src/lib/audit.ts), [src/lib/rate-limit.ts](src/lib/rate-limit.ts)
- [src/lib/pdf-generator.ts](src/lib/pdf-generator.ts), [src/lib/email/index.ts](src/lib/email/index.ts), [src/lib/email/gmail-sender.ts](src/lib/email/gmail-sender.ts)
- [src/lib/archive-categories.ts](src/lib/archive-categories.ts), [src/lib/zip-export.ts](src/lib/zip-export.ts)
- [src/middleware.ts](src/middleware.ts), [next.config.js](next.config.js)
- [prisma/schema.prisma](prisma/schema.prisma), [scripts/bootstrap.mjs](scripts/bootstrap.mjs)
- 12+ routes API : auth, archives, biens, locataires, exports, parametres, portail/*, register, uploads.

### B. Hors-périmètre audit

- DSM Synology config (reverse proxy, certificats, encrypted shared folder).
- Cloudflare config (rules, WAF, bot detection).
- Postgres datadir, backups.
- Réseau (firewall, VPN d'admin).
- Sécurité physique du NAS.
