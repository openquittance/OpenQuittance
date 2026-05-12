# Upgrade OpenQuittance

Procédure de mise à jour entre versions.

## Avant tout : backup

**OBLIGATOIRE** avant toute upgrade :

```bash
# 1. Backup DB
docker compose exec db pg_dump -U quittances quittances \
  | gzip > backup-$(date +%F).sql.gz

# 2. Backup uploads (chiffrés)
tar czf uploads-$(date +%F).tar.gz uploads/

# 3. Backup .env
cp .env env-$(date +%F).bak

# 4. Sauvegarder les 3 fichiers hors du serveur (S3, NAS distant,
#    cloud chiffré, ou simple disque externe)
```

Voir [BACKUP.md](BACKUP.md) pour la procédure complète.

## Procédure générale

```bash
cd openquittance

# 1. Stopper l'app (DB reste up pour migrations)
docker compose stop app

# 2. Récupérer la nouvelle version
git fetch --tags
git checkout v3.0.0       # ou la version cible

# 3. Rebuild + relancer (Prisma migrate appliqué auto au boot)
docker compose up -d --build app

# 4. Suivre les logs de démarrage
docker compose logs -f app | head -100
```

Vérifier dans les logs :

- `Prisma migrate deploy` → `All migrations have been successfully applied`
- `[bootstrap/...]` → toutes les étapes idempotentes OK
- `Ready in X.Xs` → Next.js démarré

## Procédure spéciale v3.1.0 → v3.2.0

v3.2.0 = migration credentials Google OAuth (login + Gmail API) du
`.env` vers DB chiffrée + UI Paramètres > Intégrations. Cohérent
avec migration Drive v3.1.0-rc10.

### Migration auto au boot

`scripts/bootstrap.mjs` étape 1quater : si `process.env.GOOGLE_CLIENT_ID/
SECRET` définis ET `AppConfig.googleClientId/Secret` null, copie les
valeurs vers la DB chiffrées `enc:v1:`. Idempotent — skip si DB déjà
rempli.

### Vérification post-upgrade

1. Logs boot : `[bootstrap/google-oauth-migrate] credentials Google
   OAuth .env → DB (chiffrés enc:v1:)` (si migration effectuée).
2. Sidebar > **Intégrations** (icône Plug, ADMIN only) → badge "✓
   Configuré via UI" attendu si migration OK.
3. Test Gmail OAuth flow inchangé (`/parametres/email` → Connecter
   Gmail).
4. Test login Google : doit fonctionner.

### Cleanup `.env` post-upgrade (recommandé)

Une fois la migration validée, retirer les lignes du `.env` du NAS
pour cohérence single-source-of-truth :

```bash
# Sur le NAS
sudo nano /volume1/docker/quittances-app/.env
# Commenter ou supprimer :
#   GOOGLE_CLIENT_ID=...
#   GOOGLE_CLIENT_SECRET=...
sudo docker compose restart app
```

UI badge passe "✓ Configuré via UI" (au lieu de "⚠ Configuré via
.env legacy").

### Restart container après modification credentials Google

⚠️ **Trade-off important** : NextAuth (login Google) lit les
credentials au démarrage du container. Modifier les credentials via
UI nécessite un **restart container** pour que login Google utilise
les nouvelles valeurs.

Gmail API (envoi quittances) : **effet immédiat** post-save (cache
invalidé, lecture dynamique).

UI Intégrations affiche un warning explicit lors de la modification.

## Procédure spéciale v2.x → v3.0

v3.0 = rebrand "OpenQuittance" + scripts setup/rotate. **Aucun
changement de schema DB**, aucun changement d'API.

Étapes spécifiques :

1. **2FA TOTP** : si vous utilisez Google Authenticator / Authy /
   1Password, le label affiché passe de `Quittances` à
   `OpenQuittance`. L'ancien secret reste valide. Pour cosmétique :
   - Désactiver 2FA dans `/profil/securite`
   - Réactiver → nouveau QR avec label `OpenQuittance`
   - Ou laisser tel quel — ça marche.

2. **Pas de migration DB nécessaire** — toutes les migrations Prisma
   v2.x déjà appliquées sont compatibles v3.0.

3. **Rotation `UPLOADS_ENCRYPTION_KEY`** (recommandé si
   l'historique git contenait votre clé en clair v2.9.0 / v2.9.1).
   Voir section "Rotation" ci-dessous.

4. **Footer email** : passe à "Propulsé par OpenQuittance" sur les
   prochains envois. Les emails envoyés avant ne changent pas.

## Procédure spéciale v2.8 → v2.9

v2.9 ajoute le chiffrement des uploads. Migration **automatique** au
boot via `[bootstrap/encrypt-uploads]`.

**Avant l'upgrade** :

1. Générer la clé : `openssl rand -base64 32`.
2. Ajouter à `.env` : `UPLOADS_ENCRYPTION_KEY=<clé>`.
3. Sauvegarder la clé hors serveur (1Password / Bitwarden / coffre).
4. Sauvegarder les uploads non chiffrés (par sécurité, en cas de
   problème de migration).
5. Stopper l'app, rebuild v2.9, redémarrer.
6. Le boot affichera `[bootstrap/encrypt-uploads] N fichiers
   chiffrés (M déjà OK)`.

**Si vous oubliez** `UPLOADS_ENCRYPTION_KEY` au démarrage v2.9 : la
migration est skippée (warning log), les fichiers restent en clair.
Les nouveaux uploads ne seront pas chiffrés non plus tant que la clé
n'est pas définie. Pas de perte de données.

## Procédure spéciale v2.5 → v2.6 (Wizard)

v2.6 ajoute des fields à `Bien` (surface, typeBien, etage, dpeClasse,
dpeKwh, dpeGes). Migration Prisma `v2_phase5_bien_wizard`
auto-appliquée. Tous nullable, aucun backfill.

## Rotation `UPLOADS_ENCRYPTION_KEY`

⚠️ Procédure délicate. **Backup uploads avant.**

```bash
# 1. Générer la nouvelle clé
NEW_KEY=$(openssl rand -base64 32)
echo "Nouvelle clé : $NEW_KEY"
# → Sauvegarder dans 1Password/coffre AVANT de continuer

# 2. Stopper l'app (sinon race condition uploads en cours)
docker compose stop app

# 3. DRY-RUN — compte les fichiers à rotater, ne modifie rien
OLD_UPLOADS_KEY=$(grep '^UPLOADS_ENCRYPTION_KEY=' .env | cut -d= -f2-) \
NEW_UPLOADS_KEY=$NEW_KEY \
UPLOADS_DIR=./uploads \
node scripts/rotate-uploads-key.mjs

# Si DRY-RUN OK (0 erreurs) :

# 4. APPLY
OLD_UPLOADS_KEY=$(grep '^UPLOADS_ENCRYPTION_KEY=' .env | cut -d= -f2-) \
NEW_UPLOADS_KEY=$NEW_KEY \
UPLOADS_DIR=./uploads \
node scripts/rotate-uploads-key.mjs --apply

# 5. Mettre à jour .env avec la nouvelle clé
sed -i.bak "s|^UPLOADS_ENCRYPTION_KEY=.*|UPLOADS_ENCRYPTION_KEY=$NEW_KEY|" .env

# 6. Redémarrer l'app
docker compose up -d app

# 7. Vérifier que l'app fonctionne (logo bailleur s'affiche, PDF OK)
curl http://localhost:3800/api/health

# 8. Conserver l'ancienne clé en backup 30 jours en cas de rollback
#    (puis détruire définitivement)
```

**Si erreurs DRY-RUN** : ne pas appliquer. Investiguer les fichiers
en erreur (probablement corrompus ou clé incohérente). Restaurer
backup uploads + reprendre.

## Rollback

Si l'upgrade casse :

```bash
# 1. Stopper la nouvelle version
docker compose down

# 2. Restaurer DB (depuis backup pg_dump)
zcat backup-2026-05-08.sql.gz | docker compose exec -T db \
  psql -U quittances -d quittances

# 3. Restaurer uploads
rm -rf uploads/
tar xzf uploads-2026-05-08.tar.gz

# 4. Restaurer .env
cp env-2026-05-08.bak .env

# 5. Checkout l'ancienne version
git checkout v2.X.Y

# 6. Rebuild + relancer
docker compose up -d --build
```

## Versions LTS / EOL

| Version | Sortie | Support |
|---------|--------|---------|
| 3.x | mai 2026 | actif |
| 2.9.x | mai 2026 | patches sécurité jusqu'à 2026-12 |
| < 2.9 | — | ❌ non supporté, upgrade obligatoire |

Recommandation : rester sur la dernière minor de la major courante.
Patches sécurité disponibles seulement sur les branches actives.
