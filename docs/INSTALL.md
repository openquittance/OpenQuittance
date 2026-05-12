# Installation OpenQuittance

3 méthodes : **wizard interactif** (recommandé débutants), **Docker
Compose manuel**, **build manuel** (avancé).

## Pré-requis

- **Docker** ≥ 24 + **Docker Compose v2** (`docker compose ...` pas
  `docker-compose`).
- 2 GB RAM minimum (Postgres + Next.js + PDFKit en mémoire).
- 10 GB disque libre (DB + uploads + images).
- Un nom de domaine si vous voulez du HTTPS public (ex:
  `quittances.example.fr` derrière reverse proxy).

Pas de Node.js requis sur l'hôte si vous utilisez seulement Docker.
Pour le wizard, Node.js 20+ est requis.

---

## Méthode 1 — Wizard interactif (recommandé)

```bash
git clone https://github.com/grx14/quittances-app.git openquittance
cd openquittance
npm run setup
```

Le wizard :

1. Vérifie que Docker est installé.
2. Génère 3 secrets (`NEXTAUTH_SECRET`, `ENCRYPTION_SECRET`,
   `UPLOADS_ENCRYPTION_KEY`) via `crypto.randomBytes`.
3. Prompt URL publique, Google OAuth (optionnel), INSEE (optionnel).
4. Écrit `.env` atomique (mode 0600).
5. **Affiche les clés une fois** — sauvegardez-les dans
   1Password / Bitwarden / coffre. **Si vous perdez
   `UPLOADS_ENCRYPTION_KEY`, vos uploads chiffrés deviennent
   irrécupérables.**
6. Lance `docker compose up -d --build`.

Fin : ouvrir l'URL d'accès, le premier inscrit devient ADMIN.

---

## Méthode 2 — Docker Compose manuel

```bash
git clone https://github.com/grx14/quittances-app.git openquittance
cd openquittance

# 1. Copier le template
cp .env.example .env

# 2. Générer les secrets et les ajouter à .env
echo "NEXTAUTH_SECRET=$(openssl rand -hex 32)" >> .env
echo "ENCRYPTION_SECRET=$(openssl rand -hex 32)" >> .env
echo "UPLOADS_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .env

# 3. Éditer .env pour mettre NEXTAUTH_URL (URL publique réelle)
# nano .env

# 4. Lancer
docker compose up -d --build

# 5. Vérifier le boot
docker compose logs -f app | head -50
```

App accessible sur `http://localhost:3800` par défaut. Modifier le
port dans `docker-compose.yml`.

---

## Première installation via wizard web (v3.3.0+)

Une fois l'app démarrée et accessible (méthode 1, 2 ou 3
ci-dessus), à la première connexion sur l'URL publique, vous
serez automatiquement redirigé vers le **wizard d'installation**
`/install`.

### Étape 1 — Compte administrateur

- **Nom** : votre nom (affiché dans l'UI staff)
- **Email** : sera votre identifiant de connexion
- **Mot de passe** : minimum 8 caractères

L'app crée le user avec rôle `ADMIN` et le connecte automatiquement
(NextAuth credentials provider).

### Étape 2 — Premier bailleur

Le bailleur est l'entité juridique qui émet les quittances. Pour
démarrer rapidement, seuls 4 champs sont requis :

- **Nom commercial** (ex : "SCI Beauregard")
- **Adresse** (ex : "12 rue de la République")
- **Code postal + ville** (ex : "75001 Paris")
- **Ville pour "Fait à …"** (ex : "Paris")

Les **mentions légales** (raison sociale, SIRET, forme juridique,
hébergeur RGPD) peuvent être complétées plus tard depuis
**Paramètres > Bailleurs > onglet Légal**. Elles sont
obligatoires en cas de commercialisation (LCEN art. 6 + RGPD
art. 13), facultatives pour usage perso.

### Étape 3 — C'est prêt !

Récap visuel + warnings éventuels (cf. ci-dessous) + 3 liens vers
les configurations optionnelles :

- **Intégrations** (Google OAuth login + Gmail API)
- **Backup** (S3-compatible ou Google Drive)
- **Indexation IRL** (API INSEE pour révisions automatiques)

Bouton **Accéder au tableau de bord** → vous voilà sur `/`.

### Détection des secrets faibles

Le wizard analyse vos 3 secrets de chiffrement (`NEXTAUTH_SECRET`,
`ENCRYPTION_SECRET`, `UPLOADS_ENCRYPTION_KEY`) à l'étape 3 et
affiche un warning rouge si :

- Longueur < 32 caractères (ou 20 pour `UPLOADS_ENCRYPTION_KEY`)
- Contient un pattern trivial (`changeme`, `secret`, `password`,
  `1234`, `admin`, etc.)

**Pour une instance publique**, régénérez ces clés :

```bash
openssl rand -hex 32  # NEXTAUTH_SECRET, ENCRYPTION_SECRET
openssl rand -base64 32  # UPLOADS_ENCRYPTION_KEY
```

Mettez à jour le `.env` puis `docker compose restart app`.

⚠️ **Ne PAS changer `ENCRYPTION_SECRET` ou `UPLOADS_ENCRYPTION_KEY`
après le premier démarrage** sans script de migration — les données
chiffrées deviendraient illisibles.

### Cleanup .env post-install

Une fois le wizard terminé, vous pouvez retirer du `.env` les
credentials Google OAuth si vous comptez les configurer via UI
**Paramètres > Intégrations** (recommandé, cf. v3.2.0 migration).
La migration auto au boot copie déjà ces valeurs vers la DB
chiffrée.

### Comportement post-install

- **Tentative d'accès `/install`** sur instance déjà installée →
  redirect `/login` (graceful).
- **`/register`** reste accessible URL directe pour qui préfère le
  flow d'inscription standard (premier user → ADMIN auto).

---

## Méthode 3 — Build manuel (Node.js + Postgres existants)

Pour les déploiements custom (Kubernetes, VPS sans Docker, etc.).

```bash
# Pré-requis : Node 20+, Postgres 14+
git clone https://github.com/grx14/quittances-app.git
cd quittances-app
npm install

# .env complet
cp .env.example .env
# Éditer DATABASE_URL pour pointer sur votre Postgres
# + tous les secrets (NEXTAUTH_SECRET, ENCRYPTION_SECRET,
#   UPLOADS_ENCRYPTION_KEY)

# Migrations Prisma
npx prisma migrate deploy
npx prisma generate

# Build
npm run build

# Bootstrap (purge audit logs + chiffre uploads existants si jamais)
node scripts/bootstrap.mjs

# Lancer
npm start
# → http://localhost:3000
```

Pour un service systemd / PM2, voir documentation upstream Next.js
output standalone.

---

## Synology NAS (Container Manager)

Workflow testé en production sur DSM 7.2+ :

1. Synology DSM → **Container Manager** → **Project** → **Create**.
2. Source = **Upload from local** (zip de votre repo).
3. Path = `/volume1/docker/openquittance/`.
4. Compose = `docker-compose.yml` du repo.
5. Avant le build, créer `.env` dans le dossier du projet (via
   File Station ou SSH) avec toutes les variables.
6. Build & start.
7. Reverse proxy DSM : Panneau de configuration → Portail de
   connexion → Proxy inversé → Créer.
   - Source : `quittances.votredomaine.fr` HTTPS 443
   - Destination : `localhost` HTTP 3800
   - Headers : ajouter `Host` = `quittances.votredomaine.fr` +
     `X-Real-IP` = `$remote_addr`
8. Certificat SSL : Let's Encrypt automatique via DSM.

**Backup** : créer une tâche Hyper Backup chiffrée vers Synology C2
ou disque externe rotation.

---

## VPS Linux (Debian/Ubuntu/Alma)

```bash
# Installer Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Cloner + setup
git clone https://github.com/grx14/quittances-app.git openquittance
cd openquittance
npm install   # juste pour le wizard
npm run setup
```

Reverse proxy : Caddy (le plus simple), Nginx, ou Traefik.

### Caddy

```caddy
quittances.votredomaine.fr {
  reverse_proxy localhost:3800
}
```

Caddy gère HTTPS automatique via Let's Encrypt.

### Nginx

```nginx
server {
  listen 443 ssl http2;
  server_name quittances.votredomaine.fr;

  ssl_certificate /etc/letsencrypt/live/quittances.votredomaine.fr/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/quittances.votredomaine.fr/privkey.pem;

  location / {
    proxy_pass http://localhost:3800;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## Cloudflare Tunnel (HTTPS sans port forwarding)

Idéal NAS derrière box ISP sans IP publique.

```bash
# Sur le NAS / VPS
docker run -d --name cloudflared --restart unless-stopped \
  --network host \
  cloudflare/cloudflared:latest tunnel --no-autoupdate run \
  --token VOTRE_TUNNEL_TOKEN
```

Configurer le tunnel via Cloudflare Zero Trust dashboard :
`quittances.votredomaine.fr` → service `http://localhost:3800`.

Aucune ouverture de port côté router. HTTPS automatique. Anti-DDoS
Cloudflare en frontal.

---

## Vérifications post-install

```bash
# 1. Healthcheck
curl http://localhost:3800/api/health
# Doit renvoyer { "status": "ok", "checks": {...} }

# 2. Boot logs
docker compose logs app | grep -E "bootstrap|Ready"
# Doit afficher "Ready in Xs" + steps bootstrap (purge-audit,
# expire-portail, sanitize, archive-cats, encrypt-uploads, etc.)

# 3. Premier admin
# → http://VOTRE_URL/register → s'inscrire → ADMIN automatique
```

## Variables d'environnement

Tableau complet dans `.env.example`. Synthèse :

| Variable | Requis | Génération |
|----------|--------|-----------|
| `DATABASE_URL` | ✅ | Default `postgresql://quittances:password@db:5432/quittances` |
| `NEXTAUTH_URL` | ✅ | URL publique réelle |
| `NEXTAUTH_SECRET` | ✅ | `openssl rand -hex 32` (≥ 32 chars) |
| `ENCRYPTION_SECRET` | ✅ | `openssl rand -hex 32` |
| `UPLOADS_ENCRYPTION_KEY` | ✅ | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | ⚪ | **Déprécié v3.2.0** — utiliser UI Paramètres > Intégrations (cf. ci-dessous) |
| `GOOGLE_CLIENT_SECRET` | ⚪ | idem |
| `INSEE_API_KEY` | ⚪ | INSEE BDM (laisser vide, l'API est key-less) |
| `UPLOADS_DIR` | ⚪ | Default `/app/uploads` (volume Docker) |
| `AUDIT_LOG_RETENTION_DAYS` | ⚪ | Default `365` |

## Installer OpenQuittance sur votre téléphone (PWA v3.5.0+)

OpenQuittance est une **PWA** (Progressive Web App) : installable
sur votre téléphone avec icône sur l'écran d'accueil et lancement
plein écran.

### Chrome Android

1. Ouvrez l'URL de votre instance (`https://votre-domaine.com`)
   dans Chrome.
2. Connectez-vous (ou utilisez le wizard install si instance vierge).
3. Chrome affiche en haut une bannière "Ajouter à l'écran d'accueil"
   (ou via menu **⋮ → Installer l'application**).
4. Confirmez. L'icône OpenQuittance apparaît sur l'écran d'accueil.
5. Tap sur l'icône → lancement plein écran sans barre URL.

### Safari iOS

1. Ouvrez l'URL dans Safari (Chrome iOS ne supporte pas l'install
   PWA — limitation Apple).
2. Tap sur l'icône **Partager** (carré + flèche vers le haut, en bas).
3. Faites défiler et tappez **Sur l'écran d'accueil**.
4. Confirmez le nom (par défaut "OpenQuittance"). L'icône apparaît
   sur l'écran d'accueil.
5. Tap sur l'icône → lancement plein écran.

### Comportement post-install

- **Status bar OS visible** (cohérent avec autres apps natives).
- **Pas de barre URL** ni boutons navigateur.
- **Notifications push** : non supportées v3.5.0 (à venir si demande).
- **Mode offline** : non supporté v3.5.0 (l'app nécessite connexion).
  Si demande utilisateur, mode offline via `serwist` en v3.5.x.

### Désinstaller

- **Android** : appui long sur l'icône → Désinstaller / Supprimer.
- **iOS** : appui long sur l'icône → Supprimer l'app.

## Configurer Google OAuth (login + Gmail API) {#google-oauth}

À partir de **v3.2.0**, les credentials Google OAuth se configurent
via l'UI **Paramètres > Intégrations** (ADMIN only). Plus besoin
d'éditer le `.env` côté serveur.

### Étape 1 — Créer un projet Google Cloud

1. Aller sur <https://console.cloud.google.com>
2. **New Project** : nommer `openquittance` (ou autre).
3. Sélectionner le projet créé.
4. **APIs & Services → Library** → activer **Gmail API** (pour
   envoi de quittances). Si vous voulez seulement le login Google
   sans Gmail API, cette étape est optionnelle.

### Étape 2 — OAuth consent screen

5. **APIs & Services → OAuth consent screen** → User Type :
   **External** (sauf Workspace privé).
6. App information :
   - App name : `OpenQuittance`
   - User support email : votre email
   - Developer contact : votre email
7. Scopes : ajouter `https://www.googleapis.com/auth/gmail.send`
   et `https://www.googleapis.com/auth/userinfo.email`.
8. Test users : ajouter votre email Google.

### Étape 3 — Créer credentials OAuth

9. **APIs & Services → Credentials → Create Credentials → OAuth
   2.0 Client ID**.
10. Application type : **Web application**.
11. Name : `OpenQuittance Web Client`.
12. **Authorized redirect URIs** : ajouter
    - `${NEXTAUTH_URL}/api/auth/callback/google` (login Google)
    - `${NEXTAUTH_URL}/api/gmail/callback` (Gmail API per-user)
13. **Create** → noter Client ID + Client Secret.

### Étape 4 — Renseigner via UI

14. Démarrer l'app, se connecter en tant qu'ADMIN.
15. Sidebar → **Intégrations** (icône Plug).
16. Section "Google OAuth (login utilisateurs + Gmail API)" :
    - Coller Client ID + Client Secret.
    - **Enregistrer**.
17. Badge passe "✓ Configuré via UI" (vert).

### Effet et restart container

- **Gmail API** : effet immédiat post-save (cache invalidé).
- **Login Google** : NextAuth lit les credentials au boot. **Restart
  container nécessaire** pour appliquer les modifications côté
  login. UI affiche un warning orange explicit.

```bash
# Restart après modification credentials Google :
docker compose restart app
```

## Problèmes courants

**App refuse de démarrer avec `NEXTAUTH_SECRET manquant ou trop court`**
→ générer `openssl rand -hex 32` minimum 32 caractères.

**Migration Prisma échoue**
→ vérifier `DATABASE_URL` accessible depuis le container app
(`docker compose exec app sh -c 'nc -zv db 5432'`).

**Uploads ne s'affichent pas**
→ vérifier `UPLOADS_ENCRYPTION_KEY` cohérente entre redémarrages.
Si fichiers en clair pré-existants, le bootstrap les chiffre au
premier boot (log `[bootstrap/encrypt-uploads] N fichiers chiffrés`).

**Build NAS échoue avec "Failed to collect page data"**
→ probablement variable env manquante au build. v2.8.0-rc2+ utilise
des checks lazy pour éviter ça mais vérifier `.env` complet avant
`docker compose up --build`.

## Suite

- [UPGRADE.md](UPGRADE.md) — procédure mise à jour
- [BACKUP.md](BACKUP.md) — sauvegarde et restauration
- [SECURITE-CONFORMITE.md](SECURITE-CONFORMITE.md) — audit sécurité
- [RGPD.md](RGPD.md) — procédures RGPD
- [CHIFFREMENT-UPLOADS.md](CHIFFREMENT-UPLOADS.md) — détails crypto uploads
