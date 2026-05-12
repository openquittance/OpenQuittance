# Backup et restauration OpenQuittance

À partir de **v3.1.0**, OpenQuittance intègre un système de backup
automatique vers cloud :

- **S3-compatible** (Backblaze B2, Cloudflare R2, Wasabi, AWS S3,
  MinIO local)
- **Google Drive** (compte personnel, scope minimal `drive.file`)

Le backup couvre la base de données + les fichiers uploadés
(décryptés puis re-chiffrés dans des ZIPs par bailleur) + le `.env`
(chiffré avec une passphrase distincte).

## Sommaire

1. [Ce qui est sauvegardé](#ce-qui-est-sauvegardé)
2. [Configurer un backup S3-compatible](#configurer-un-backup-s3-compatible)
3. [Configurer un backup Google Drive](#configurer-un-backup-google-drive)
4. [Schedule (cron expressions)](#schedule-cron-expressions)
5. [Vérifier que les backups marchent](#vérifier-que-les-backups-marchent)
6. [Restaurer un backup](#restaurer-un-backup)
7. [Stratégie 3-2-1](#stratégie-3-2-1)
8. [Test régulier de restauration](#test-régulier-de-restauration)
9. [Sécurité](#sécurité)
10. [RPO / RTO](#rpo--rto)

---

## Ce qui est sauvegardé

Layout produit dans le bucket / dossier Drive :

```
openquittance/<instanceId>/<timestamp>/
  ├── manifest.json     (versions, counts, hashes SHA-256, durée job)
  ├── db.sql.gz         (pg_dump global toutes tables, gzippé)
  ├── env.enc           (.env chiffré AES-256-GCM scrypt(passphrase))
  └── bailleurs/
        ├── <slug-bailleur-1>.zip
        ├── <slug-bailleur-2>.zip
        └── ...
```

- **`manifest.json`** : point d'entrée pour restauration. Liste les
  fichiers, leurs hashes SHA-256, leur taille. Permet de vérifier
  l'intégrité avant restauration.
- **`db.sql.gz`** : `pg_dump --no-owner --no-acl --clean --if-exists`
  + gzip. Inclut toutes les tables (Users, Bailleurs, Biens,
  Locataires, Quittances, Archives, AuditLog, AppConfig, etc.).
- **`env.enc`** : votre fichier `.env` (qui contient
  `ENCRYPTION_SECRET` + `UPLOADS_ENCRYPTION_KEY`) chiffré avec une
  passphrase distincte. **Sans cette passphrase, vos backups sont
  inutilisables**.

  **Note v3.1.0-rc9** : si l'app tourne dans Docker compose avec
  `environment:` (sans bind-mount du `.env`), le contenu `env.enc`
  est reconstruit à partir de `process.env` filtré par une **whitelist
  explicite** de 16 variables critiques :
  `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
  `ENCRYPTION_SECRET`, `UPLOADS_ENCRYPTION_KEY`,
  `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_DRIVE_CLIENT_ID/SECRET`,
  `INSEE_API_KEY`, `BACKUP_NOTIFY_EMAIL`, `BACKUP_ENV_PATH`,
  `UPLOADS_DIR`, `AUDIT_LOG_RETENTION_DAYS`, `NEXT_PUBLIC_APP_NAME`,
  `TZ`. Les vars système Linux (PATH, HOME, NODE_ENV, etc.) ne sont
  **pas** incluses. Si `BACKUP_ENV_PATH` est défini ET le fichier
  existe, le contenu du fichier est utilisé verbatim (override).
- **`bailleurs/<slug>.zip`** : un ZIP par bailleur actif, contenant
  les fichiers physiques (logos, signatures, archives Bien +
  Locataire, photos), tous **déchiffrés** dans le ZIP (pas de
  redondance avec le chiffrement applicatif). Le ZIP lui-même n'est
  pas re-chiffré côté backup — c'est le `.env` chiffré qui protège
  la chaîne.

L'**`instanceId`** est un UUID v4 généré au premier setup backup et
persisté à vie. Il sert de prefix dans le bucket — vous pouvez ainsi
avoir plusieurs instances OpenQuittance dans le même bucket sans
collision.

---

## Configurer un backup S3-compatible

### Étape 1 — Créer un bucket chez votre fournisseur

Exemples avec **Backblaze B2** (le moins cher, souvent recommandé
pour 1-100 GB de backups) :

1. Créer un compte sur <https://www.backblaze.com>
2. Onglet **B2 Cloud Storage** → **Create a Bucket**
   - Bucket Unique Name : `openquittance-backup-<votre-nom>`
   - Files in Bucket are : **Private**
   - Default Encryption : Disable (chiffrement client-side via
     OpenQuittance)
   - Object Lock : Disable (sauf si vous voulez WORM)
3. Onglet **Application Keys** → **Add a New Application Key**
   - Name : `openquittance-app`
   - Allow access to Bucket : sélectionner le bucket créé
   - Type of Access : **Read and Write**
   - File name prefix : *(laissez vide)*
4. **IMPORTANT** : copier le `keyID` et le `applicationKey` —
   l'`applicationKey` n'est affichée **qu'une seule fois**.
5. Notez l'**Endpoint** affiché (`s3.<region>.backblazeb2.com`).

Procédure équivalente pour **Cloudflare R2**, **Wasabi**, **AWS S3**,
ou **MinIO** local — chaque fournisseur a son interface. L'idée est
toujours : créer un bucket privé + créer une paire access key /
secret key avec les permissions read+write+delete sur ce bucket.

### Étape 2 — Renseigner la config dans OpenQuittance

1. Sidebar → **Backup** (icône cloud, ADMIN only).
2. Toggle "Activer le backup automatique".
3. **Type de stockage** : sélectionner **S3-compatible**.
4. **Fournisseur S3** : cliquer sur le bouton du fournisseur (B2 /
   R2 / Wasabi / AWS / Personnalisé) — l'endpoint et la région se
   pré-remplissent. Adaptez la région au bucket (ex : `eu-central-003`
   pour B2 EU).
5. **Bucket** : nom exact du bucket créé.
6. **Force path-style** : laisser décoché (sauf MinIO local).
7. **Access Key ID** + **Secret Access Key** : depuis l'application
   key créée à l'étape 1.
8. **Schedule** : sélectionner un preset ou cron custom (cf. section
   Schedule).
9. **Rétention** : slider 7-365 jours (default 30). Backups plus
   anciens supprimés automatiquement après chaque run.
10. **Passphrase env** : chaîne longue (≥ 12 caractères) qui chiffre
    votre `.env`. ⚠️ **IRRÉCUPÉRABLE** si perdue. Sauvegardez-la dans
    un gestionnaire de mots de passe (1Password, Bitwarden, KeePass)
    **séparé du serveur**. Cocher "Je comprends" pour valider.
11. **Notifier aussi les backups réussis** : laisser décoché par
    défaut (les échecs sont toujours notifiés).
12. **Enregistrer** → toast confirmation.
13. **Tester la connexion** → doit afficher ✅ vert. Si ❌ rouge :
    `failedAt: head/put/delete` indique l'étape qui a échoué (auth,
    permission write, permission delete).
14. **Backup maintenant** → 202 Accepted, le run apparaît dans
    l'historique en bas avec status `running`. Auto-refresh toutes
    les 30s jusqu'à `success` ou `failed`.

---

## Configurer un backup Google Drive

Drive est une alternative S3 pour les utilisateurs qui ont déjà un
compte Google Workspace ou Drive personnel et préfèrent éviter un
fournisseur tiers payant. Limites : **15 GB gratuits** (compte
personnel) ou **2 TB** (Google One Basic à 2,99 €/mois). Pour de gros
volumes, S3 reste plus économique.

### Étape 1 — Créer un projet Google Cloud + activer Drive API

1. Aller sur <https://console.cloud.google.com>
2. **New Project** : nommer `openquittance-backup` (ou autre).
3. Sélectionner le projet créé.
4. **APIs & Services** → **Library** → chercher **Google Drive
   API** → **Enable**.

### Étape 2 — Configurer l'écran de consentement OAuth

5. **APIs & Services** → **OAuth consent screen**.
6. User Type : **External** (sauf si Workspace privé) → Create.
7. App information :
   - App name : `OpenQuittance Backup`
   - User support email : votre email
   - Developer contact : votre email
8. Scopes : **Add or Remove Scopes** → ajouter :
   - `https://www.googleapis.com/auth/drive.file`
   - `https://www.googleapis.com/auth/userinfo.email`
9. Test users : ajouter votre email Google (et les autres ADMIN
   qui se connecteront).
10. Save and Continue.

### Étape 3 — Créer les credentials OAuth

11. **APIs & Services** → **Credentials** → **Create Credentials**
    → **OAuth 2.0 Client ID**.
12. Application type : **Web application**.
13. Name : `OpenQuittance Backup Web Client`.
14. **Authorized redirect URIs** : ajouter
    `${NEXTAUTH_URL}/api/admin/backup/drive/oauth/callback`
    (ex : `https://quittance.example.com/api/admin/backup/drive/oauth/callback`).
15. Create → noter le **Client ID** et le **Client Secret**.

### Étape 4 — Renseigner les credentials dans l'UI (v3.1.0-rc10+)

Plus besoin de toucher au `.env`. Aller directement dans
**Paramètres > Backup** :

1. Sidebar → **Backup**.
2. Toggle "Activer le backup automatique" + storage **Google Drive**.
3. Section "Google Drive — Configuration Google Cloud" :
   - **Google Client ID** : `12345-abc.apps.googleusercontent.com`
   - **Google Client Secret** : `GOCSPX-xxxxx`
4. **Enregistrer** → indicateur ✓ vert "Credentials Google configurés".

Pas de redémarrage nécessaire. Les credentials sont chiffrés
AES-256-GCM (`enc:v1:`) dans la DB.

> **Migration depuis ancienne config `.env`** : si vous aviez
> `GOOGLE_DRIVE_CLIENT_ID/SECRET` dans le `.env` (rc1-rc9), le boot
> script copie automatiquement ces valeurs vers la DB au premier
> démarrage post-rc10 (idempotent). Vous pouvez ensuite supprimer
> ces lignes du `.env`.

### Étape 5 — Créer un dossier Drive cible

16. Aller sur <https://drive.google.com>
17. **Nouveau** → **Dossier** : nommer `OpenQuittance Backups`.
18. Ouvrir le dossier — l'URL contient `/folders/<ID>`. Copier
    l'ID.

### Étape 6 — Connecter le compte dans OpenQuittance

19. Toujours dans Paramètres > Backup, après avoir saisi+enregistré
    Client ID + Secret à l'étape 4.
20. Bouton **Connecter Google Drive** apparaît → redirection vers
    Google consent. Approuver les scopes demandés. Au retour, l'email
    du compte s'affiche en vert.
21. **ID du dossier Drive** : coller l'ID copié à l'étape 5.
22. Renseigner schedule + rétention + passphrase env (cf. S3 Étape 2).
23. **Enregistrer** + **Tester la connexion** + **Backup maintenant**.

### Limitation Drive

- 1 seul compte Drive connecté à la fois (singleton). Pour switcher,
  bouton **Reconnecter** qui réécrit le refresh_token.
- Pas de UI native pour parcourir/sélectionner le dossier — il faut
  copier l'ID depuis l'URL Drive.

---

## Schedule (cron expressions)

Le scheduler interne `node-cron` interprète des expressions cron à
**5 champs** : `minute heure jour mois jourSemaine`.

| Preset UI | Cron | Sens |
|-----------|------|------|
| Quotidien 3h | `0 3 * * *` | Tous les jours à 03:00 |
| Hebdo dimanche 3h | `0 3 * * 0` | Dimanche à 03:00 |
| Lundi + jeudi 3h | `0 3 * * 1,4` | Lundi et jeudi à 03:00 |

Cron custom courants :

| Expression | Sens |
|------------|------|
| `*/15 * * * *` | Toutes les 15 minutes |
| `0 */6 * * *` | Toutes les 6 heures |
| `0 0 1 * *` | Le 1er du mois à minuit |
| `30 2 * * 1-5` | 02:30 lundi-vendredi |

**Note** : la timezone du cron est celle du conteneur Docker
(default UTC). Si vous voulez un cron heure locale Paris, ajoutez
`TZ=Europe/Paris` à `docker-compose.yml service app environment`.

---

## Vérifier que les backups marchent

### Logs

```bash
docker compose logs app --tail=200 | grep -i backup
```

Lignes attendues au boot :

```
[backup/scheduler] init : started schedule="0 3 * * *"
```

Au tick cron :

```
[backup/scheduler] Backup planifié déclenché
```

Au save config :

```
[backup/scheduler] Scheduler démarré avec schedule "0 3 * * *"
```

### Historique UI

Sidebar → **Backup** → tableau "Historique" en bas. Affiche les 50
derniers runs avec :

- Date locale
- Durée (formatée s/min)
- Taille (formatée KB/MB/GB)
- Bailleurs (nombre de ZIPs uploadés)
- Statut (badge couleur : vert=success, rouge=failed, bleu=running)
- Erreur (tronquée + tooltip si présente)
- Bouton **Détails** → modale avec JSON complet du run

Auto-refresh toutes les 30s si un run est `running`.

### Notifications email

- Échec backup : email envoyé automatiquement aux Users ADMIN actifs
  (ou à `BACKUP_NOTIFY_EMAIL` si défini en env).
- Succès : seulement si toggle "Notifier aussi les backups réussis"
  activé dans l'UI.

---

## Restaurer un backup

### Restauration complète (DB + uploads + .env)

```bash
# 1. Stopper l'app (DB doit rester up).
docker compose stop app

# 2. Télécharger l'archive du bucket S3 / dossier Drive.
#    Pour S3 (avec aws-cli ou rclone) :
aws s3 sync s3://<bucket>/openquittance/<instanceId>/<timestamp>/ \
  ./restore-2026-05-08/ \
  --endpoint-url https://s3.<region>.backblazeb2.com

#    Pour Drive : télécharger les 4+ fichiers manuellement depuis
#    drive.google.com (manifest.json, db.sql.gz, env.enc, bailleurs/*).

# 3. Vérifier l'intégrité via manifest.
cd ./restore-2026-05-08
cat manifest.json | jq '.files[] | "\(.key) \(.sha256)"'
# Comparer avec :
sha256sum db.sql.gz env.enc bailleurs/*.zip

# 4. Déchiffrer le .env (cf. scripts/restore-env.mjs).
node /chemin/openquittance/scripts/restore-env.mjs env.enc env.restored
# Prompt passphrase → output env.restored mode 0600.

# 5. Comparer avec le .env actuel (sanity check).
diff env.restored /chemin/openquittance/.env

# 6. Restaurer la DB.
zcat db.sql.gz | docker compose exec -T db psql -U quittances -d quittances

# 7. Restaurer les uploads (si nécessaire — typiquement ils n'ont pas
#    été perdus, ils sont déjà sur disque).
#    Si vous avez perdu uploads/, extraire chaque ZIP bailleur :
for zip in bailleurs/*.zip; do
  node /chemin/openquittance/scripts/restore-bailleur.mjs "$zip" \
    /chemin/openquittance/uploads-restored/
done
# Le script re-chiffre auto les fichiers si UPLOADS_ENCRYPTION_KEY
# défini dans l'env. Copier ensuite vers /chemin/openquittance/uploads/.

# 8. Restaurer le .env si nécessaire (sinon garder l'actuel).
cp env.restored /chemin/openquittance/.env
chmod 600 /chemin/openquittance/.env

# 9. Relancer l'app.
docker compose up -d app
sleep 10
curl -fsS http://localhost:3800/api/health
```

### Restauration sélective (1 bailleur uniquement)

Cas typique : un bailleur a perdu un fichier, on veut le restaurer
sans toucher au reste.

```bash
# 1. Télécharger uniquement le ZIP du bailleur concerné depuis le
#    bucket / Drive.
aws s3 cp s3://<bucket>/openquittance/<inst>/<ts>/bailleurs/<slug>.zip ./

# 2. Extraire les fichiers.
node scripts/restore-bailleur.mjs <slug>.zip /tmp/restore-<slug>/

# 3. Identifier le fichier perdu (les ZIPs respectent l'arborescence
#    d'origine — biens/ + locataires/ + quittances/ + documents/).

# 4. Copier manuellement le fichier dans uploads/ (re-chiffré si
#    UPLOADS_ENCRYPTION_KEY défini lors du restore-bailleur).
```

### Restauration `.env` seule

Si vous avez perdu votre `.env` (et donc `ENCRYPTION_SECRET` +
`UPLOADS_ENCRYPTION_KEY`), c'est l'opération critique : sans ces
clés, votre DB est inutile (champs chiffrés) et vos uploads sont
illisibles. Heureusement, votre `env.enc` est dans chaque backup.

```bash
# Télécharger env.enc d'un backup récent.
aws s3 cp s3://<bucket>/openquittance/<inst>/<ts>/env.enc ./

# Déchiffrer (prompt passphrase).
node scripts/restore-env.mjs env.enc /chemin/openquittance/.env
# Prompt passphrase → écrit .env mode 0600.

# Redémarrer.
docker compose restart app
```

---

## Stratégie 3-2-1

**Règle classique de l'IT pro** :

- **3** copies des données (1 originale + 2 backups)
- **2** supports différents (NAS local + cloud, par exemple)
- **1** copie off-site (hors local du serveur principal)

Mise en pratique avec OpenQuittance :

| Copie | Emplacement | Type |
|-------|-------------|------|
| 1 | Serveur de prod (NAS Synology) | Original |
| 2 | Backup cloud quotidien (B2 / R2 / Drive) | Off-site auto |
| 3 | Snapshot Synology Hyper Backup vers disque externe | Local hors-prod |

Le backup cloud OpenQuittance couvre la copie 2. Pour la 3, utilisez
**Hyper Backup** (Synology) ou **rsync vers disque USB** côté
serveur.

---

## Test régulier de restauration

> **Une stratégie de backup non testée n'est pas une stratégie.**

Tous les **6 mois** minimum, faire un test de restauration sur
instance staging :

```bash
# Cloner l'instance prod sur staging.
mkdir openquittance-staging
cd openquittance-staging
git clone https://github.com/grx14/quittances-app.git src
docker compose -f src/docker-compose.yml up -d db

# Restaurer le dernier backup (cf. section "Restauration complète").

# Vérifier :
# 1. L'app démarre (curl /api/health).
# 2. Login fonctionne (test ENCRYPTION_SECRET → JWT decode).
# 3. Un PDF s'affiche (test UPLOADS_ENCRYPTION_KEY → décryption).
# 4. Le portail locataire fonctionne (test multi-couches OK).
```

Si le test échoue : votre stratégie est cassée, **avant** un vrai
sinistre. C'est exactement le moment où on veut découvrir le
problème.

---

## Sécurité

### Passphrase env.enc

- **Sauvegardée séparément du serveur** (gestionnaire de mots de
  passe externe).
- **Différente** de `ENCRYPTION_SECRET` et `UPLOADS_ENCRYPTION_KEY`.
- **Minimum 12 caractères**, idéalement 20+ avec mélange.
- **Si compromise** : rotater immédiatement (UI Backup → re-saisir
  passphrase + cocher IRRÉCUPÉRABLE → save). Les backups suivants
  utilisent la nouvelle passphrase. Les anciens backups restent
  déchiffrables avec l'ancienne.

### Credentials S3

- **Permissions minimales** : read+write+delete sur **un seul
  bucket** dédié à OpenQuittance. Pas de permissions globales.
- **Rotation** : tous les 12 mois. Régénérer key + secret côté
  fournisseur, mettre à jour dans l'UI Backup.
- **Si compromises** : révoquer immédiatement la key côté fournisseur.
  Les backups passés restent intacts (S3 ne lit pas l'historique
  via key révoquée).

### Refresh token Drive

- Stocké chiffré (`enc:v1:`) en DB. Visible uniquement avec
  `ENCRYPTION_SECRET` + accès DB.
- **Si compromis** : révoquer côté Google (myaccount.google.com →
  Sécurité → Connexions tierces) puis bouton **Reconnecter** dans
  l'UI Backup.

### Chiffrement at-rest

- **DB** : pas de chiffrement applicatif sauf champs sensibles
  (Gmail tokens, IBAN, IBAN, SMTP password — tous chiffrés
  AES-256-GCM via `ENCRYPTION_SECRET`).
- **Uploads** : chiffrés AES-256-GCM via `UPLOADS_ENCRYPTION_KEY`
  avant écriture disque (cf. [CHIFFREMENT-UPLOADS.md](CHIFFREMENT-UPLOADS.md)).
- **Backup `.env`** : chiffré AES-256-GCM scrypt via passphrase
  utilisateur (cf. format OQENC1 ci-dessous).
- **Backup `db.sql.gz`** : **PAS chiffré côté backup**. Le bucket
  fournisseur doit être configuré avec chiffrement at-rest natif
  (B2 SSE, R2 default encryption, AWS S3 SSE-S3, etc.). À défaut,
  utilisez `restic` ou `gpg` côté CI pour wrapper le backup.

### Chiffrement transit

- HTTPS obligatoire : `NEXTAUTH_URL=https://...` sinon les redirects
  OAuth + cookies session sont en clair.
- Endpoint S3 : tous les fournisseurs cités exposent HTTPS par
  défaut.
- Drive API : HTTPS only.

### Format `env.enc`

```
OQENC1 (6 octets magic) | salt (16) | iv (12) | tag (16) | ciphertext
```

- Clé dérivée : `scrypt(passphrase, salt, N=16384, r=8, p=1)` → 32 bytes.
- AES-256-GCM (12B IV + 16B auth tag).
- Pas de dépendance externe (`gpg`, `openssl` CLI). Déchiffrable
  avec ~20 lignes de Node.js (cf. `scripts/restore-env.mjs`).

---

## RPO / RTO

Avec backup quotidien activé :

| Métrique | Valeur typique |
|----------|----------------|
| **RPO** (Recovery Point Objective) | 24h max (= dernière sauvegarde nuit) |
| **RTO** (Recovery Time Objective) | 30 min - 2h selon volume uploads |

Pour réduire le RPO :

- **Backup plus fréquent** : `0 */6 * * *` (toutes les 6h) — RPO
  6h.
- **Streaming réplication Postgres** (`pgbackrest` / `wal-g`) — RPO
  ~ minute. **Pas géré par OpenQuittance**, à mettre en place côté
  Postgres directement.

Pour réduire le RTO :

- Garder un staging warm avec restauration testée mensuellement.
- Documenter la procédure step-by-step au-delà de ce fichier
  (runbook interne avec captures + commandes copy-paste).

---

## Variables d'environnement

| Variable | Optionnel | Défaut | Description |
|----------|-----------|--------|-------------|
| `BACKUP_NOTIFY_EMAIL` | Oui | (admins DB) | Override destinataires email (comma-sep) |
| `BACKUP_ENV_PATH` | Oui | `.env` | Chemin du `.env` à backuper |
| `GOOGLE_DRIVE_CLIENT_ID` | Si Drive | — | Client OAuth GCP |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Si Drive | — | Secret OAuth GCP |

---

## Troubleshooting

| Symptôme | Cause probable | Fix |
|----------|----------------|-----|
| `[backup/scheduler] Cron expression invalide` | Cron mal saisi | Re-saisir, valider 5 champs |
| Test connexion S3 → `failedAt: head 403` | Mauvais credentials ou bucket privé sans permission | Vérifier key + secret, recréer key avec read+write |
| Test connexion S3 → `failedAt: head 404` | Bucket inexistant ou mauvaise région | Vérifier endpoint + nom bucket |
| Test connexion S3 → `failedAt: put` | Permission read OK mais pas write | Recréer key avec write |
| Drive callback → `drive_error=invalid_grant` | Refresh token expiré (compte révoqué) | Bouton "Reconnecter" |
| Drive list → 403 | Folder non accessible au compte | Vérifier que le folder est partagé avec le compte connecté |
| `pg_dump exit=1 stderr=connection refused` | Service `db` down | `docker compose ps`, restart `db` |
| Backup `success` mais 0 bailleurs | Aucun bailleur `actif=true` en DB | Activer au moins 1 bailleur |
| Notif email non reçue | Aucun ADMIN avec config email valide | Configurer Parametres email d'un admin (Gmail OAuth ou SMTP) |

---

## Limitations v3.1.0

- **Pas de UI restauration** — opération manuelle CLI volontairement
  (trop dangereux UI : risque écraser DB prod par erreur).
- **1 seul bucket / dossier Drive** (pas de multi-cible
  onsite+offsite simultané).
- **Pas de cluster multi-replica** : si l'app tourne en N instances,
  les N déclencheront le cron simultanément. À fixer Phase 4 avec
  Postgres advisory lock.
- **Pas de WORM / object lock** activé par défaut. Si vous voulez
  une protection ransomware (impossible de supprimer un backup
  pendant N jours), configurez le bucket en immutable côté
  fournisseur.
