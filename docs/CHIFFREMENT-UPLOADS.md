# Chiffrement applicatif des uploads — quittances-app v2.9.0

## Pourquoi

Permettre l'app de tourner sur **n'importe quel hébergement** (NAS
Synology / QNAP, VPS, Docker, cloud) sans dépendre d'une couche
système chiffrée native (Synology Encrypted Shared Folder, LUKS, BitLocker…).

Le chiffrement at-rest applicatif déplace la responsabilité du
chiffrement vers la couche app : indépendant du filesystem,
transparent au déploiement, portable.

## Algorithme

**AES-256-GCM** (NIST SP 800-38D — Galois/Counter Mode).

- Clé : 256 bits (32 bytes).
- IV : 12 bytes (96 bits) aléatoires par fichier (recommandation NIST).
- Tag d'authentification : 16 bytes (128 bits) — vérifie l'intégrité
  ET l'authenticité au déchiffrement (AEAD).

Pourquoi GCM et pas CBC : authentification intégrée (pas besoin de
HMAC séparé), résistant aux attaques par tampering/padding oracle,
performant matériellement (AES-NI).

## Format binaire

Chaque fichier upload chiffré commence par les bytes "ENC1" :

```
┌──────┬─────────┬──────────┬───────────────┐
│ ENC1 │   IV    │ AuthTag  │  Ciphertext   │
│ 4 B  │  12 B   │  16 B    │  variable     │
└──────┴─────────┴──────────┴───────────────┘
0      4         16         32              ...
```

- **`ENC1`** : magic bytes ASCII (0x45 0x4E 0x43 0x31). Permet de :
  1. Détecter qu'un fichier est chiffré (vs legacy en clair).
  2. Versionner le format (`ENC2` réservé pour évolution future).
- **`IV`** : 12 bytes aléatoires générés via `crypto.randomBytes(12)`.
- **`AuthTag`** : 16 bytes du `cipher.getAuthTag()` après `cipher.final()`.
- **`Ciphertext`** : taille = taille fichier original (GCM mode = stream).

Overhead total = 32 bytes par fichier (négligeable).

## Génération de la clé

```bash
openssl rand -base64 32
```

Sortie : 44 caractères base64 → 32 bytes après decode.

Variable d'environnement à définir :

```env
UPLOADS_ENCRYPTION_KEY=<sortie-openssl-base64>
```

## ⚠️ Avertissements critiques

### Perte de la clé = fichiers irrécupérables

L'algo AES-256-GCM est **mathématiquement irréversible** sans la clé.
Il n'existe pas de back-door, pas de master key, pas de récupération.

Si vous perdez `UPLOADS_ENCRYPTION_KEY`, **tous** les fichiers chiffrés
deviennent illisibles à jamais. Cela inclut :

- Logos / signatures bailleur (impact UI minimal — refresh upload OK)
- Archives Locataire (bail signé, EDL, garanties — impact MAJEUR,
  re-collecte nécessaire auprès des locataires)
- Archives Bien (DPE, diagnostics, acte vente, etc. — impact MAJEUR,
  certains documents non-rééditables)

**Procédure recommandée** :

1. Générer la clé sur une machine de confiance (pas le serveur lui-même).
2. La sauvegarder dans **deux** emplacements distincts du serveur :
   - Gestionnaire de mots de passe (1Password, Bitwarden, KeePass).
   - Coffre-fort physique (papier imprimé) ou cloud chiffré (Cryptomator).
3. Tester la procédure de restauration au moins une fois (export
   ZIP RGPD avec une nouvelle instance + même clé).

### Pas de rotation native en v2.9

Si vous changez `UPLOADS_ENCRYPTION_KEY` après le 1er chiffrement,
les fichiers déjà chiffrés sous l'ancienne clé deviennent illisibles
(cf. ci-dessus).

Une rotation propre nécessiterait : déchiffrer tous les fichiers avec
l'ancienne clé → re-chiffrer avec la nouvelle. Pas implémenté en v2.9.
Sera ajouté en v3.0+ si besoin (migration script avec `OLD_KEY` +
`NEW_KEY` envs).

### Backup de la clé séparément du serveur

Si attaquant compromet le serveur ET récupère la clé en même temps,
le chiffrement at-rest ne sert à rien. Garder la clé hors du serveur
quand possible (Docker secret, vault, env var injectée au runtime,
gestionnaire de mots de passe pour reprise après sinistre).

## Migration des fichiers existants

Au premier boot avec `UPLOADS_ENCRYPTION_KEY` définie, le script
`scripts/bootstrap.mjs` étape `[bootstrap/encrypt-uploads]` :

1. Walk récursif `UPLOADS_DIR/archives/` + `UPLOADS_DIR/bailleurs/`.
2. Pour chaque fichier :
   - Si magic bytes `ENC1` présents → skip (déjà chiffré).
   - Sinon : read → encrypt → write atomic via tmpfile + rename.
3. Log `[bootstrap/encrypt-uploads] N fichiers chiffrés (M déjà OK)`.

Idempotent : peut être ré-exécuté sans risque.

## Performance

PDFKit + Buffer in-memory : OK pour les volumes attendus.

- PDFs Quittance : ~3-5 KB
- Archives Bien (DPE PDF) : ~1-3 MB
- Archives Locataire (bail PDF) : ~500 KB - 2 MB
- Limite upload : 25 MB

Test informel : chiffrement / déchiffrement d'un PDF 5 MB ≈ 50-100 ms
sur node 20. Acceptable pour serving (négligeable face aux ~100 ms
PDF generation).

Pour des fichiers > 100 MB, envisager streaming chunk par chunk
(non implémenté v2.9 — limite upload empêche ce cas).

## Endpoints concernés

### Écriture (encryption)

- `POST /api/upload` — logo / signature bailleur
- `POST /api/archives` — archives Bien / Locataire (DPE, bail, EDL…)

### Lecture (décryption)

- `GET /api/uploads/[...path]` — serving staff
- `GET /api/portail/archives/[id]` — serving locataire
- `GET /api/archives/[id]` — serving staff archives
- `GET /api/portail/bailleur/logo` — logo public bailleur
- PDF generators (`generateQuittancePdf`, `generateAvisEcheance`, etc.)
  → décryption en mémoire pour `doc.image()` PDFKit
- ZIP exports (`zip-export.ts` bailleur, `export-rgpd` locataire) →
  décryption avant inclusion dans l'archive ZIP (le ZIP n'est PAS
  chiffré — c'est un transport, pas un at-rest)

## Vérification

### Health check du chiffrement

```bash
# Sur le serveur, vérifier qu'un fichier random est chiffré :
hexdump -C /volume1/docker/quittances-app/uploads/archives/<id>.pdf | head -2
# Doit commencer par : 45 4e 43 31  ('ENC1' en ASCII)
```

### Test serving

```bash
# Logo bailleur servi correctement :
curl -L https://your-app/api/portail/bailleur/logo | file -
# Doit afficher : PNG image / JPEG image / etc. (déchiffré OK)
```

## Backup et chiffrement (v3.1.0)

À partir de **v3.1.0**, OpenQuittance peut backuper automatiquement
vers un stockage cloud (S3-compatible ou Google Drive — cf.
[BACKUP.md](BACKUP.md)).

Le backup couvre 3 éléments dont 2 chiffrés :

| Élément | Format backup | Chiffrement |
|---------|---------------|-------------|
| Base PostgreSQL | `db.sql.gz` | **Aucun côté backup** — chiffrement at-rest natif du fournisseur (B2 SSE / R2 / S3 SSE) recommandé |
| Fichiers uploads | `bailleurs/<slug>.zip` | **Déchiffrés** dans le ZIP (puis le ZIP est uploadé tel quel) |
| `.env` | `env.enc` | **Chiffré AES-256-GCM** via passphrase utilisateur distincte |

**Pourquoi déchiffrer les uploads dans le ZIP** ? Les ZIPs bailleurs
sont conçus pour être restaurés ou portables (cf. Feature C export
manuel). Les laisser chiffrés imposerait au restaurateur de connaître
`UPLOADS_ENCRYPTION_KEY` — qui est de toute façon dans le `.env`
backupé. Le ZIP est protégé par le chiffrement at-rest du bucket +
le chiffrement applicatif du `.env` (qui contient la clé pour
ré-encrypter à l'arrivée).

### Chaîne de clés à protéger

Pour restaurer un backup complet, vous avez besoin de **2 secrets** :

1. **Passphrase env.enc** : celle saisie dans l'UI Paramètres >
   Backup. ⚠️ Indépendante de `UPLOADS_ENCRYPTION_KEY`. Stockez-la
   dans un gestionnaire de mots de passe externe.
2. **Accès au bucket / dossier Drive** : credentials S3 OU compte
   Google connecté.

Une fois `env.enc` déchiffré, vous récupérez `UPLOADS_ENCRYPTION_KEY`
+ `ENCRYPTION_SECRET` et vous pouvez :

- Décrypter les fichiers uploads existants.
- Décrypter les champs DB chiffrés (Gmail tokens, IBAN, SMTP
  password, etc.) via `ENCRYPTION_SECRET`.

**Si vous perdez la passphrase** : le `db.sql.gz` reste accessible
mais tout ce qui est chiffré applicatif (champs DB, uploads) est
**perdu** — sauf si vous avez une copie séparée des clés.

### Recommandation gestionnaire de mots de passe

Stockez dans un coffre 1Password / Bitwarden / KeePass :

```
OpenQuittance — Recovery Kit
├── ENCRYPTION_SECRET = <openssl rand -hex 32>
├── UPLOADS_ENCRYPTION_KEY = <openssl rand -base64 32>
└── BACKUP_ENV_PASSPHRASE = <≥ 12 chars>
```

Avec ces 3 valeurs + accès au bucket cloud, vous pouvez restaurer
n'importe où.

## Threat model adressé

| Menace | Mitigation v2.9 |
|---|---|
| Vol disque physique NAS / VPS | ✓ fichiers chiffrés |
| Backup non chiffré qui fuit | ✓ contenu fichier inutilisable |
| Compromission compte cloud (Hyper Backup, S3) | ✓ idem |
| Attaquant lit `UPLOADS_DIR` via path traversal | ✓ contenu chiffré |
| Compromission clé via env vol | ✗ chiffrement défait — gardez la clé séparée |
| Tampering fichier (modification ciphertext) | ✓ auth tag GCM détecte |
| Attaquant root sur serveur live | ✗ peut lire env + decrypt — protection système classique |

## Références

- NIST SP 800-38D (GCM) : https://csrc.nist.gov/pubs/sp/800/38/d/final
- OWASP Cryptographic Storage Cheat Sheet :
  https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html
