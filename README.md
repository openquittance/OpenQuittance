# OpenQuittance

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-3.7.1-blue.svg)](https://github.com/openquittance/OpenQuittance/releases)
[![Tests](https://img.shields.io/badge/tests-127%20passing-brightgreen.svg)](#tests)
[![Status](https://img.shields.io/badge/status-stable-green.svg)](#)

**Application open source auto-hébergée pour la gestion locative en France.**

Génération de quittances de loyer conformes loi 89-462, envoi par email,
suivi de l'indexation IRL via API INSEE, archivage de documents,
multi-utilisateurs avec rôles, portail locataire avec partage sélectif,
chiffrement des données et conformité RGPD.

Pensée pour les bailleurs particuliers, SCI ou petites foncières qui
veulent garder leurs données chez eux.

> **Pas un SaaS, pas de cloud tiers, pas de tracking.** Vos données
> vivent dans votre Postgres, vos documents dans votre filesystem
> (chiffrés AES-256-GCM), vos emails partent depuis votre Gmail.

## 📚 Documentation

| Doc                                       | Pour                                |
|-------------------------------------------|-------------------------------------|
| [Guide utilisateur](docs/USER-GUIDE.md)   | Bailleurs non-dev : tout le cycle   |
| [Installation](docs/INSTALL.md)           | Setup serveur, prod, reverse proxy  |
| [FAQ](docs/FAQ.md)                        | Questions fréquentes                |
| [Glossaire](docs/GLOSSAIRE.md)            | Termes métier (IRL, DDT, EDL, …)    |
| [Architecture](docs/ARCHITECTURE.md)      | Stack technique, modèle données     |
| [API REST](docs/API.md)                   | Référence endpoints                 |
| [Sécurité](docs/SECURITE-CONFORMITE.md)   | RGPD, chiffrement, conformité       |
| [Backup](docs/BACKUP.md)                  | Sauvegarde + restauration           |
| [Multi-bailleur](docs/MULTI-BAILLEUR.md)  | Isolation server-side, rôles        |
| [Portail locataire](docs/PORTAIL-LOCATAIRE.md) | Flow tenant, magic links       |
| [Captures écran](docs/SCREENSHOTS.md)     | Galerie + régénération Playwright   |

## 🚀 Quick start

```bash
git clone https://github.com/openquittance/OpenQuittance.git openquittance
cd openquittance
npm run setup       # wizard interactif : prompts + secrets + docker compose up
```

Ouvrir <http://localhost:3800> · premier inscrit = ADMIN automatique.

> Le wizard `setup.mjs` génère vos secrets (`NEXTAUTH_SECRET`,
> `ENCRYPTION_SECRET`, `UPLOADS_ENCRYPTION_KEY`), prompt vos URL/OAuth,
> écrit `.env`, lance Docker. Pour install manuelle : `cp .env.example
> .env` puis voir [Configuration](#configuration-env) ci-dessous.

## 📸 Aperçu

| Dashboard | Wizard onboarding |
|---|---|
| ![Dashboard](docs/screenshots/01-dashboard.png) | ![Wizard](docs/screenshots/03-wizard-onboarding.png) |

| Indexation IRL | Aperçu PDF live |
|---|---|
| ![IRL](docs/screenshots/04-irl-revisions.png) | ![Quittance](docs/screenshots/02-quittance-pdf.png) |

| Journal d'activité (admin) | 2FA TOTP |
|---|---|
| ![Audit](docs/screenshots/05-audit-log.png) | ![2FA](docs/screenshots/06-2fa-setup.png) |

| Documents + archives | Mobile |
|---|---|
| ![Documents](docs/screenshots/07-documents.png) | ![Mobile](docs/screenshots/08-mobile-dashboard.png) |

> Les captures sont régénérables avec `npx tsx scripts/screenshots.mts` (Playwright + données de démo créées à la volée).

---

## ✨ Fonctionnalités principales

### 📄 Génération de documents PDF

Tous les PDFs ont un en-tête personnalisable (logo + couleur charte + adresse bailleur), une signature scannée et un footer légal. Aperçu **inline en modale** plein écran (mobile-friendly), boutons "Ouvrir nouvel onglet" / "Télécharger".

- **Quittance de loyer** — A4 avec mentions loi 6 juillet 1989, pavé "PAYÉ" en cas de paiement, détail loyer/charges/total, montant en lettres, conforme aux exigences APL/CAF/MSA
- **Avis d'échéance** — appel de loyer avant paiement
- **Reçu de dépôt de garantie** — article 22 loi 1989, montant en encadré sombre + en lettres
- **État des lieux entrée/sortie** — 2 pages, tableau de pièces (sols/murs/plafond/menuiseries/observations), relevé compteurs, clés remises, signatures
- **Courrier de révision IRL** — article 17-1 loi 1989, calcul détaillé (ancien loyer × IRL_nouveau ÷ IRL_ref), date d'effet
- **Récap comptable PDF** — par bailleur sur une période, avec totaux par locataire et par bien
- **Export XML** — pour import dans logiciel comptable

### 💰 Gestion locative complète

- **Bailleurs** : nom, RCS, adresse, ville de signature, logo et signature scannée, couleur PDF personnalisable
- **Biens** : adresse complète + complément (étage, lot, escalier…)
- **Locataires** : rattachés à un bien, loyer nu + charges + dépôt de garantie, dates d'entrée/sortie, email pour envoi auto, IRL de référence pour révisions
- **Quittances** : génération unitaire ou mensuelle de masse pour tous les locataires actifs d'un bailleur en 1 clic

### 💸 Avoirs et trop-perçus

- Suivi des **trop-perçus** (locataire qui paie plus) → reportés en avoir sur le mois suivant
- Application d'**avoirs** (déduction du loyer ou des charges)
- Commentaire automatique généré sur la quittance avec détail du report

### 📈 Indexation IRL automatique

- **Sync directe API INSEE** (BDM « Séries Chronologiques », série 001515333) : **aucune clé requise**, l'accès est public et gratuit
- **Auto-sync hebdomadaire** : la synchro se déclenche automatiquement à l'ouverture de la page IRL si la dernière a plus de 7 jours
- **Stockage local 5 ans glissants** (≈ 20 trimestres), purge automatique de l'historique plus ancien
- **Saisie manuelle possible** en parallèle (utile pour des indices futurs ou si l'INSEE rétablit l'auth)
- **Détection automatique des révisions éligibles** : bail indexé + date anniversaire passée + IRL plus récent disponible
- **Application en 1 clic** : loyer mis à jour + courrier PDF généré et archivé automatiquement
- **Suivi du recommandé** : date d'envoi, n° de suivi La Poste, upload de la preuve de dépôt scannée
- **Alertes dashboard** quand des révisions sont disponibles

### 🗂️ Archivage de documents

- Associez n'importe quel fichier à un Bien ou un Locataire (contrat signé, DPE, amiante, plomb, assurance GLI, attestation, courrier…)
- **Drag & drop** ou sélecteur classique
- Catégories libres (`contrat`, `DPE`, `GLI`, `caf`…)
- Upload max 25 Mo, tous formats acceptés
- **Visualisation inline** des PDFs et images
- Stockage filesystem (volume Docker `uploads`), jamais en base de données

### 📧 Envoi par email

- **Gmail API OAuth2** (recommandé) : envoi via le compte Gmail du bailleur, refresh token chiffré AES-256-GCM en base, refresh automatique
- **SMTP classique** en fallback : Gmail avec mot de passe d'application, ou tout autre serveur SMTP
- **Templates** avec variables `{prenom}` `{nom}` `{mois}` `{annee}`
- Signature HTML personnalisable
- Envoi par lots avec rapport (succès/échecs par locataire)

### 📊 Dashboard & alertes intelligentes

- KPIs : locataires actifs, biens, quittances du mois, revenus mensuels
- **Alertes automatiques** actionnables :
  - 🟧 Bail expirant (< 90 jours)
  - 🔵 Révision IRL disponible avec calcul automatique
  - 🟧 Locataire sans quittance pour le mois courant
  - 🟧 Locataires sans email configuré
  - 🔵 Quittances générées mais non envoyées

### 🚀 Onboarding guidé

Wizard 4 étapes pour les nouveaux comptes : **Bailleur → Bien → Locataire → 1ère quittance**. Skippable, reprise automatique à la bonne étape si interrompu.

### 🔐 Multi-utilisateurs avec rôles

- **3 rôles** : `ADMIN` (tout pouvoir + gestion app), `MEMBER` (CRUD métier), `VIEWER` (lecture seule)
- **2 modes d'inscription** : `CLOSED` (fermée) ou `INVITATION_ONLY` (sur invitation par email)
- **Invitation par email** OU **création directe** par un admin (mot de passe temporaire généré et affiché 1 fois — utile si SMTP/Gmail pas encore configuré)
- **Tout premier utilisateur** = ADMIN automatique, sans condition
- **Login** : email/password (bcrypt 10 rounds) ou Google OAuth

### 🔒 Sécurité

- **2FA TOTP** disponible pour tous les utilisateurs (optionnel) :
  - Compatible Google Authenticator, Authy, 1Password (RFC 6238)
  - 8 codes de secours hashés scrypt à usage unique
  - Login en 2 étapes avec page `/verify-2fa` même après Google OAuth
- **Chiffrement AES-256-GCM** des champs sensibles en base :
  - Refresh tokens OAuth Gmail
  - Secret TOTP
  - Codes de secours
  - API key INSEE (si fournie)
- **Audit log** complet :
  - Connexions, mutations métier, exports, opérations de sécurité, IRL
  - Auteur + horodatage + IP + métadonnées JSON
  - Rétention configurable (365j par défaut)
  - Page `/parametres/journal` avec filtres et **export CSV**
- **Sessions JWT** signées, sans table session en DB (stateless)
- Validation systématique côté serveur (Zod)
- Tokens d'invitation à usage unique avec expiration
- CSRF, no-store, headers de sécurité

### 🎨 UX

- **Mode sombre / clair / système** auto-détecté, modifiable dans les préférences
- **Mobile-first responsive** : sidebar burger, modales adaptatives, tableaux scrollables horizontalement
- **Aperçu PDF live** : tous les documents s'affichent en modale plein écran avec viewer PDF natif du navigateur (pas de dépendance pdfjs-dist)
- **Drag & drop upload** sur les zones d'archives
- **Variables CSS token-based** : la charte couleur du bailleur s'adapte aux deux modes

---

## 🛠️ Stack technique

| Brique | Outil |
|---|---|
| Framework | Next.js 14 (App Router, output standalone) |
| Langage | TypeScript strict |
| Base de données | PostgreSQL 16 |
| ORM | Prisma 5 |
| Auth | Auth.js / NextAuth v5 (Prisma adapter) |
| 2FA | otplib (TOTP RFC 6238) + qrcode |
| Chiffrement | `node:crypto` AES-256-GCM (natif) |
| PDF | PDFKit |
| Aperçu PDF | iframe + viewer PDF natif du navigateur |
| Email | googleapis (Gmail API) + Nodemailer (SMTP) |
| IRL | API publique INSEE BDM (Key Less) |
| Validation | Zod |
| UI | Tailwind CSS, dark mode, mobile-first |
| Conteneurisation | Docker + Docker Compose |

---

## 📋 Prérequis

- **Docker** et **Docker Compose** v2
- Un nom de domaine pointant sur votre serveur (recommandé pour Google OAuth, optionnel sinon)
- Un compte Google Cloud avec un projet OAuth (uniquement si vous voulez le login Google ou l'envoi via Gmail API)

---

## 🚀 Installation rapide (Docker)

```bash
# 1. Cloner
git clone https://github.com/<votre-user>/quittances-app.git
cd quittances-app

# 2. Configurer
cp .env.example .env
# Éditer .env (cf. section suivante)

# 3. Générer les secrets
echo "NEXTAUTH_SECRET=$(openssl rand -hex 32)" >> .env
echo "ENCRYPTION_SECRET=$(openssl rand -hex 32)" >> .env

# 4. Lancer
docker compose up -d --build

# 5. Ouvrir l'app sur http://localhost:3800
# Premier utilisateur → /register → devient ADMIN automatiquement
```

L'app écoute par défaut sur le port `3800` du host (mappé sur `3000` côté conteneur). Modifiable dans [docker-compose.yml](docker-compose.yml).

---

## ⚙️ Configuration (.env)

```bash
# ═══════════════════════════════════════════════════════════════════
# Base de données — pas besoin de toucher si vous utilisez le service `db` du compose
# ═══════════════════════════════════════════════════════════════════
DATABASE_URL=postgresql://quittances:password@db:5432/quittances

# ═══════════════════════════════════════════════════════════════════
# Auth (REQUIS)
# ═══════════════════════════════════════════════════════════════════
# URL publique de l'app — CRUCIAL derrière un reverse proxy
NEXTAUTH_URL=https://quittances.exemple.fr
# Secret JWT — générer avec : openssl rand -hex 32
NEXTAUTH_SECRET=remplacer-par-32-octets-hex-aleatoires

# ═══════════════════════════════════════════════════════════════════
# Chiffrement (REQUIS)
# ═══════════════════════════════════════════════════════════════════
# Clé AES-256-GCM pour chiffrer en base : tokens OAuth Gmail, secret TOTP, etc.
# Générer avec : openssl rand -hex 32
# ⚠️ NE JAMAIS CHANGER après le premier démarrage — les données chiffrées
#    deviendraient illisibles. Sauvegardez cette clé en dehors du serveur
#    (gestionnaire de mots de passe).
ENCRYPTION_SECRET=remplacer-par-32-octets-hex-aleatoires

# ═══════════════════════════════════════════════════════════════════
# Google OAuth (OPTIONNEL — pour login Google + envoi via Gmail API)
# ═══════════════════════════════════════════════════════════════════
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ═══════════════════════════════════════════════════════════════════
# Stockage local — logos, signatures, archives, PDFs auto-générés
# ═══════════════════════════════════════════════════════════════════
UPLOADS_DIR=/app/uploads

# ═══════════════════════════════════════════════════════════════════
# INSEE (OPTIONNEL) — La BDM est en plan Key Less, aucune clé n'est
# requise par défaut. Cette variable est conservée au cas où l'INSEE
# rétablirait une authentification ou pour les plans payants futurs.
# ═══════════════════════════════════════════════════════════════════
INSEE_API_KEY=
```

### Génération des secrets

```bash
# NEXTAUTH_SECRET
openssl rand -hex 32

# ENCRYPTION_SECRET (clé distincte recommandée)
openssl rand -hex 32
```

### Configuration Google OAuth (optionnelle)

Si vous voulez activer le login Google et/ou l'envoi de quittances via Gmail API :

1. Aller sur [Google Cloud Console](https://console.cloud.google.com/) → créer un projet
2. **APIs & Services → OAuth consent screen** → configurer (External, ajouter votre email comme utilisateur de test)
3. **APIs & Services → Library** → activer **Gmail API** (uniquement pour l'envoi)
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID** :
   - Type : **Web application**
   - **Authorized JavaScript origins** : `https://quittances.exemple.fr`
   - **Authorized redirect URIs** :
     - `https://quittances.exemple.fr/api/auth/callback/google` (login)
     - `https://quittances.exemple.fr/api/gmail/callback` (envoi via Gmail API)
5. Récupérer `Client ID` et `Client Secret` → les mettre dans `.env`

> Pour le login Google seul, seule la première URI suffit. La seconde est nécessaire pour l'envoi via Gmail API.

Si vous laissez `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` vides, le bouton Google s'affichera mais ne fonctionnera pas. Vous pouvez aussi commenter le provider dans [src/auth.config.ts](src/auth.config.ts).

---

## 🎬 Premier démarrage

1. Ouvrez l'app → vous êtes redirigé vers `/login`
2. Cliquez sur **S'inscrire** → créez votre compte (email + mot de passe **ou** bouton Google)
3. Vous êtes automatiquement **ADMIN** (premier utilisateur)
4. Le **wizard d'onboarding** vous guide en 4 étapes : Bailleur → Bien → Locataire → 1ère quittance
5. Configurez ensuite vos préférences d'envoi email dans **Paramètres → Email**
6. Synchronisez l'IRL en allant dans **Paramètres → Indexation IRL** → "Synchroniser maintenant"

---

## 🌐 Reverse proxy / déploiement

L'app génère les redirects à partir de `NEXTAUTH_URL`. **Vérifiez** que cette variable correspond exactement à l'URL publique (avec `https://`).

### Cloudflare + Synology DSM (Reverse Proxy)

Configuration testée :
- Cloudflare DNS : enregistrement A vers l'IP publique du NAS
- Synology DSM → Panneau de configuration → Portail de connexion → Proxy inversé :
  - Source : `https` / `quittances.exemple.fr` / `443`
  - Destination : `http` / `localhost` / `3800`
- Activer **WebSocket** dans les en-têtes personnalisés

### Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name quittances.exemple.fr;

  ssl_certificate     /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://localhost:3800;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

### Caddy

```
quittances.exemple.fr {
  reverse_proxy localhost:3800
}
```

### Traefik (docker-compose labels)

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.quittances.rule=Host(`quittances.exemple.fr`)"
  - "traefik.http.routers.quittances.tls.certresolver=letsencrypt"
  - "traefik.http.services.quittances.loadbalancer.server.port=3000"
```

---

## 💾 Sauvegardes

### Backup automatique cloud (recommandé, v3.1.0+)

Sidebar → **Backup** (ADMIN). Configuration via UI vers :

- **S3-compatible** : Backblaze B2, Cloudflare R2, Wasabi, AWS S3, MinIO local.
- **Google Drive** : compte personnel, scope minimal `drive.file`.

Le backup couvre DB + uploads + `.env` chiffré, schedule cron
configurable (quotidien / hebdo / custom), rétention configurable
(7-365 jours), notifications email échec, historique 50 derniers runs.

📖 **Documentation complète** : [docs/BACKUP.md](docs/BACKUP.md) —
configuration step-by-step (B2, R2, Drive), restauration complète /
sélective, stratégie 3-2-1, sécurité, RPO/RTO.

### Backup manuel (toujours utile en complément)

Trois cibles à sauvegarder :

1. **PostgreSQL** (volume `pgdata`) : utilisateurs, bailleurs, biens, locataires, quittances, audit log, IRL
2. **Uploads** (volume `uploads`) : logos, signatures, archives + PDFs auto-générés (courriers de révision, preuves de dépôt)
3. **Variables d'env** : `.env` contenant `ENCRYPTION_SECRET` (sans elle, les données chiffrées sont perdues)

### Backup PostgreSQL

```bash
# Dump
docker exec quittances-db pg_dump -U quittances quittances > backup-$(date +%Y%m%d).sql

# Restore
cat backup.sql | docker exec -i quittances-db psql -U quittances quittances
```

### Backup uploads

```bash
docker run --rm -v quittances-app_uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

### Sauvegarde de la clé de chiffrement

```bash
# À conserver en lieu sûr (gestionnaire de mots de passe, coffre-fort numérique)
grep ENCRYPTION_SECRET .env
```

> ⚠️ **Si vous perdez `ENCRYPTION_SECRET`** : les tokens Gmail chiffrés deviennent illisibles (vous devrez reconnecter Gmail), les secrets TOTP idem (les utilisateurs devront réactiver le 2FA), les codes de secours sont perdus.

---

## 🔄 Mise à jour

```bash
git pull
docker compose up -d --build
```

Les migrations Prisma sont appliquées automatiquement au démarrage via `prisma migrate deploy` (cf. [Dockerfile](Dockerfile)).

---

## 🏗️ Architecture

```
src/
├── app/                                # Routes Next.js (App Router)
│   ├── api/
│   │   ├── 2fa-verify/                 # Validation 2nd facteur post-Google
│   │   ├── admin/
│   │   │   ├── audit/                  # Journal d'activité (filtres + export CSV)
│   │   │   ├── config/                 # AppConfig (registrationMode, etc.)
│   │   │   ├── insee/                  # Configuration INSEE
│   │   │   ├── invitations/            # CRUD invitations
│   │   │   └── users/                  # CRUD users + création directe
│   │   ├── archives/                   # Upload polymorphe Bien|Locataire
│   │   ├── auth/[...nextauth]/         # NextAuth handlers
│   │   ├── bailleurs/, biens/, locataires/, quittances/
│   │   ├── dashboard/                  # KPIs + alertes
│   │   ├── documents/                  # Avis, dépôt, EDL, courrier IRL
│   │   ├── exports/                    # Récap PDF + XML
│   │   ├── gmail/                      # OAuth callback Gmail API
│   │   ├── irl/                        # Indices, révisions, sync INSEE
│   │   ├── parametres/                 # Email, parametres user
│   │   ├── profil/totp/                # Setup / enable / disable 2FA
│   │   ├── public/                     # Endpoints non authentifiés (config)
│   │   └── register/                   # Création de compte
│   ├── bailleurs/, biens/, locataires/, quittances/, exports/  # Pages CRUD
│   ├── documents/                      # Page documents (PDFs + archives)
│   ├── invitations/                    # Acceptation invitation par token
│   ├── login/, register/               # Auth UI
│   ├── onboarding/                     # Wizard 4 étapes
│   ├── parametres/
│   │   ├── admin/                      # Config app (admin)
│   │   ├── apparence/                  # PDF couleur/police par bailleur
│   │   ├── email/                      # Gmail API + SMTP
│   │   ├── irl/                        # Indices + sync INSEE + historique
│   │   ├── journal/                    # Audit log UI (admin)
│   │   └── membres/                    # Membres + invitations
│   ├── profil/securite/                # 2FA TOTP user
│   ├── verify-2fa/                     # Page 2nd facteur post-OAuth
│   └── page.tsx                        # Dashboard
├── auth.config.ts                      # Config NextAuth (edge-safe)
├── auth.ts                             # NextAuth complet (Prisma, callbacks, events)
├── middleware.ts                       # Protection routes + ACL + 2FA gate
├── components/
│   ├── ArchiveManager.tsx              # Upload + drag&drop + preview
│   ├── DashboardAlertes.tsx            # Bandeau alertes contextuelles
│   ├── PdfPreviewModal.tsx             # Modale PDF mobile-first
│   ├── Modal.tsx                       # Modale générique
│   └── layout/                         # AppShell, Sidebar, ThemeToggle
└── lib/
    ├── audit.ts                        # logAudit + catalogue typé d'actions
    ├── crypto.ts                       # AES-256-GCM encrypt/decrypt
    ├── email/                          # Gmail API + SMTP + MIME builder
    ├── insee.ts                        # Client API BDM (XML + JSON)
    ├── insee-config.ts                 # Lecture config chiffrée
    ├── irl.ts                          # Calcul révision + détection éligibles
    ├── pdf-generator.ts                # Quittance de loyer
    ├── pdf-documents.ts                # Avis, dépôt, EDL, courrier IRL
    ├── totp.ts                         # TOTP + codes de secours
    ├── access-control.ts               # Helpers rôles
    ├── app-config.ts                   # Singleton AppConfig
    └── prisma.ts                       # Client Prisma (singleton)

prisma/
├── schema.prisma                       # 11 modèles : User, Bailleur, Bien,
│                                       # Locataire, Quittance, Archive,
│                                       # AuditLog, Invitation, IndiceIRL,
│                                       # RevisionIRL, AppConfig
└── migrations/                         # Historique versionné
```

### Modèle de données

```
User ─┬─ Account (OAuth)
      ├─ Session
      ├─ Parametres (email config par user)
      ├─ AuditLog[] (actions tracées)
      └─ Archive[] (uploads)

Bailleur ─┬─ Bien[] ─┬─ Locataire[] ─┬─ Quittance[]
          │         │                └─ RevisionIRL[]
          │         └─ Archive[] (polymorphe)
          └─ Invitation[]

AppConfig (singleton) ── registrationMode + INSEE config + audit retention
IndiceIRL (cache trimestriel, fenêtre 5 ans)
```

---

## 🧑‍💻 Développement local

```bash
# DB seule en Docker, app en npm run dev sur le host
docker compose -f docker-compose.dev.yml up -d
cp .env.example .env.local
# Éditer .env.local (DATABASE_URL=postgresql://quittances:password@localhost:5432/quittances)

# Générer les secrets
echo "NEXTAUTH_SECRET=$(openssl rand -hex 32)" >> .env.local
echo "ENCRYPTION_SECRET=$(openssl rand -hex 32)" >> .env.local

npm install
npx prisma migrate dev
npm run dev
```

L'app tourne alors sur http://localhost:3000.

### Type checking

```bash
npx tsc --noEmit
```

### Migrations

```bash
# Après modif du schema.prisma
npx prisma migrate dev --name votre_nom_de_migration

# En production
npx prisma migrate deploy
```

---

## 🔐 Sécurité — récapitulatif

| Mesure | Détail |
|---|---|
| Mots de passe | bcrypt 10 rounds |
| Sessions | JWT signées avec `NEXTAUTH_SECRET` (HS256) |
| 2FA | TOTP RFC 6238 optionnel par user, 8 backup codes scrypt |
| Chiffrement DB | AES-256-GCM avec préfixe `enc:v1:` (refresh OAuth, secret TOTP, codes secours, INSEE key) |
| **Rate limiting** | **Login : 5/15 min/IP · Register : 3/heure/IP · in-memory, sans Redis** |
| Audit | Toutes actions sensibles loggées avec auteur + IP + métadonnées |
| Tokens d'invitation | Usage unique, expirent en 7 jours |
| CSRF | Géré par NextAuth (double-submit cookie) |
| Validation | Zod côté serveur sur tous les inputs |
| Logs | Aucune information sensible en clair |
| Secrets | `NEXTAUTH_SECRET` ≥ 32 octets, `ENCRYPTION_SECRET` ≥ 32 octets |

⚠️ **À retenir** :
- Ne committez **jamais** votre `.env` (déjà dans `.gitignore`)
- **Ne changez pas `ENCRYPTION_SECRET`** après le premier démarrage
- **Sauvegardez `ENCRYPTION_SECRET` en dehors du serveur** (gestionnaire de mots de passe)
- Activez HTTPS en production
- Gardez `GOOGLE_CLIENT_SECRET` secret — il donne accès au login + Gmail

---

## ❓ FAQ

### Le premier utilisateur est-il vraiment admin ?

Oui. Tant qu'aucun ADMIN n'existe, le `/register` est ouvert sans condition et le compte créé est promu ADMIN. Une fois un ADMIN existant, le mode d'inscription configuré (`CLOSED` ou `INVITATION_ONLY`) s'applique.

### Comment inviter d'autres utilisateurs ?

ADMIN → **Paramètres → Membres** → **"Ajouter un membre"** → 2 modes :
- **Inviter par email** : envoi d'un lien avec token, valable 7 jours (nécessite Gmail/SMTP configuré)
- **Créer directement** : création immédiate du compte, mot de passe temporaire généré et affiché 1 fois (à transmettre hors-bande)

### Comment activer le 2FA ?

Sidebar → **Sécurité** → "Activer le 2FA" → scanner le QR code avec Google Authenticator/Authy/1Password → saisir un code → recevoir 8 codes de secours à conserver précieusement.

### Le 2FA fonctionne-t-il avec Google OAuth ?

Oui. Si vous activez le 2FA, le login via Google demandera quand même le code TOTP via une page intermédiaire `/verify-2fa`.

### L'IRL se met-il à jour automatiquement ?

L'API INSEE BDM est en **Key Less** (accès anonyme), donc oui : la synchro se déclenche automatiquement quand un admin ouvre la page Indexation IRL si la dernière sync remonte à plus de 7 jours. Vous pouvez aussi cliquer **"Synchroniser maintenant"**. Aucune révision n'est appliquée automatiquement, c'est toujours le bailleur qui valide chaque révision.

### Combien d'historique IRL est conservé ?

Les 5 dernières années (≈ 20 trimestres). Les valeurs plus anciennes sont purgées automatiquement à chaque sync. La saisie manuelle d'une valeur ancienne reste possible (catégorie `manual`, jamais purgée).

### Puis-je utiliser un compte Gmail perso pour envoyer les quittances ?

Oui, c'est même le cas d'usage principal. **Paramètres → Email → Gmail API → Connecter Gmail**. Les quittances seront envoyées depuis votre Gmail (apparaîtront dans vos "envoyés"). Le refresh token est chiffré AES-256-GCM en base.

### Pas envie d'utiliser Google OAuth, juste le SMTP ?

Possible : configurez SMTP dans **Paramètres → Email**. Pour Gmail, créez un [mot de passe d'application](https://myaccount.google.com/apppasswords).

### Que se passe-t-il si je perds ma clé `ENCRYPTION_SECRET` ?

Les données chiffrées (tokens Gmail, secret TOTP, codes de secours) deviennent illisibles. **Sauvegardez cette clé en dehors de votre serveur** (gestionnaire de mots de passe, coffre-fort numérique). En cas de perte, les utilisateurs devront reconnecter Gmail et réactiver leur 2FA.

### Puis-je migrer depuis une autre app ?

Pas d'importeur dédié pour l'instant. Le schéma est documenté ([prisma/schema.prisma](prisma/schema.prisma)) et un script SQL d'import peut être écrit. Contributions bienvenues.

### Et la performance ?

L'app est mono-instance, optimisée pour 1-100 bailleurs avec 100-1000 quittances/mois (cas typique d'une petite SCI). Postgres encaisse sans problème, les PDFs sont générés à la volée (~50 ms par quittance), aucun cache n'est nécessaire.

---

## 🤝 Contribuer

Issues et PRs bienvenues. Voir [CONTRIBUTING.md](CONTRIBUTING.md)
(à venir Phase 1 Session 2).

Stack TypeScript strict, Tailwind, conventions Next.js App Router.
Tests E2E via tsx + Docker stack (cf. `tests/`).

Avant de soumettre une PR :
- `npx tsc --noEmit` sans erreur
- `npm run build` ✓
- Migration Prisma fournie si schema modifié
- Pas de secret en dur, pas de PII committée

---

## ☕ Soutenir le projet

OpenQuittance est distribué gratuitement sous licence MIT. **Pas
d'offre managée actuellement** — le projet est entièrement self-hosted.
Si la demande existe, une offre managée pourra être proposée à l'avenir.

Si l'app vous est utile, vous pouvez offrir un café à son auteur ou
sponsoriser le projet :

- [**☕ Tipeee — fr.tipeee.com/grx14**](https://fr.tipeee.com/grx14/)
- GitHub Sponsors (à activer Phase 4)
- Liberapay (à activer Phase 4)

---

## 📜 Licence

[MIT](LICENSE) — Copyright © 2026 OpenQuittance contributors.

Permission d'utilisation, modification, distribution sans
restriction. Voir [LICENSE](LICENSE) pour le texte complet.

---

## 🩺 Healthcheck

L'app expose `/api/health` (sans authentification) pour les sondes externes et le `HEALTHCHECK` Docker. Trois vérifications :

```json
{
  "status": "ok",
  "version": "2.2.0",
  "checks": {
    "db":    { "ok": true, "ms": 386 },
    "fs":    { "ok": true, "detail": "/app/uploads" },
    "insee": { "ok": true, "detail": "HTTP 200", "ms": 312 }
  }
}
```

- `status: "ok"` → tout va bien (HTTP 200)
- `status: "degraded"` → DB/FS OK mais INSEE injoignable (HTTP 200, sync IRL impossible temporairement)
- `status: "down"` → DB ou filesystem en échec (HTTP 503, le conteneur est non-fonctionnel)

Le `HEALTHCHECK` Docker (cf. [Dockerfile](Dockerfile)) tourne toutes les 30 s et reboot le conteneur si KO 3 fois.

---

## 📋 Changelog résumé

Voir [CHANGELOG.md](CHANGELOG.md) pour l'historique complet.
Highlights des dernières versions :

- **v3.7.1** — Documentation complète (USER-GUIDE, API, ARCHITECTURE, FAQ, GLOSSAIRE)
- **v3.7.0** — Fix logo dark mode (inline SVG) + UX polish + A11y (boutons icon-only aria-label, wizards transitions, Spinner component)
- **v3.6.2** — Hotfix critique responsive mobile (useIsMobile { mounted, isMobile } + overflow-x global + refacto 5 pages staff tables → vraies cards mobile)
- **v3.6.1** — Hotfix PDF preview mobile (incomplet, fixé en v3.6.2)
- **v3.6.0** — Responsive mobile (horizontal scroll tables + full-screen modales mobile)
- **v3.5.0** — PWA setup (manifest + service worker + icônes maskable, install Android + iOS Safari)
- **v3.4.0** — Fix Access Denied Google OAuth post-invitation + intégration logo officiel
- **v3.3.x** — Setup wizard web + hotfixes (redirect loop, invitation TENANT bypass)
- **v3.2.0** — Onglet Intégrations Google OAuth (Gmail API + Drive backup)
- **v3.1.0** — Backup cloud (S3 + Google Drive) avec chiffrement AES-256-GCM + passphrase
- **v3.0.x** — Multi-bailleur (memberships, isolation server-side, rôles ADMIN/MEMBER/VIEWER)
- **v2.x** — 2FA TOTP, Documents, Archives, IRL, Dashboard alertes, Audit log

---

## 🙏 Crédits

OpenQuittance s'appuie sur d'excellents projets open source :

- [Next.js](https://nextjs.org/) — framework React full-stack
- [NextAuth.js](https://authjs.dev/) — authentification
- [Prisma](https://www.prisma.io/) — ORM TypeScript
- [PostgreSQL](https://www.postgresql.org/) — base de données
- [PDFKit](https://pdfkit.org/) — génération PDF
- [Tailwind CSS](https://tailwindcss.com/) — styling
- [Lucide](https://lucide.dev/) — icônes SVG
- [Zod](https://zod.dev/) — validation TypeScript-first
- [Sonner](https://sonner.emilkowal.ski/) — toasts
- [Playwright](https://playwright.dev/) — E2E + screenshots
- [INSEE BDM](https://www.insee.fr/fr/information/2868055) — indices IRL trimestriels

Et tous les contributeurs ❤️
