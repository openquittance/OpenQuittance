# Contribuer à OpenQuittance

Merci de l'intérêt pour le projet ! Les contributions sont les
bienvenues, des typos jusqu'aux features majeures.

Avant tout : lire le [Code de conduite](.github/CODE_OF_CONDUCT.md) et
la [Politique de sécurité](.github/SECURITY.md).

## Setup dev

```bash
git clone https://github.com/grx14/quittances-app.git openquittance
cd openquittance
npm install

# Postgres dev (compose dédié, ports différents pour pas conflicter
# avec une instance prod en local).
docker compose -f docker-compose.dev.yml up -d

# Variables env locales
cp .env.example .env.local
# Remplir au moins :
#   DATABASE_URL=postgresql://quittances:password@localhost:5432/quittances
#   NEXTAUTH_SECRET=$(openssl rand -hex 32)
#   ENCRYPTION_SECRET=$(openssl rand -hex 32)
#   UPLOADS_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Migrations + génération Prisma client
npx prisma migrate deploy
npx prisma generate

# Dev server (Next 14 hot reload)
npm run dev
# → http://localhost:3000
```

## Lancer les tests

```bash
# Pré-requis : dev server lancé sur :3000 + Postgres dev :5432
set -a; source .env.local; set +a
PORTAIL_BASE_URL=http://localhost:3000 \
  DATABASE_URL=postgresql://quittances:password@localhost:5432/quittances \
  npx tsx tests/<suite>.test.mts
```

Suites disponibles dans `tests/` :

| Suite | Couvre |
|-------|--------|
| `portail-isolation.mts` | isolation tenant + magic links + share toggles |
| `multi-bailleur-isolation.mts` | scope multi-bailleur + memberships |
| `ui-pages-multi-bailleur.mts` | SSR pages staff (bundle JS markers) |
| `email-leger.test.mts` | templates email léger / classique + DDT |
| `multi-bailleur-helpers.test.mts` | guards + helpers scope |
| `feature-b-bien-wizard.test.mts` | wizard nouveau logement + annonce |
| `feature-c-export-zip.test.mts` | export ZIP organisé bailleur |
| `security-rgpd-v280.test.mts` | open redirect + headers + RGPD effacement |
| `uploads-crypto.test.mts` | chiffrement AES-256-GCM uploads |
| `dompurify-signature.test.mts` | sanitization signature email |
| `v3-rebrand-rotate.test.mts` | rebrand OpenQuittance + rotation clé |

Variables env utiles :

- `PDF_TEST_MODE=1` — désactive compression PDF (rend le contenu
  greppable pour les tests de branding PDF).
- `AUDIT_LOG_RETENTION_DAYS=N` — override la rétention audit logs
  par défaut 365j.

## Conventions de code

**TypeScript** :

- Mode strict activé. Pas de `any` sauf justification commentée.
- Préférer les types explicites sur les exports publics.
- Pas de `// @ts-ignore` (utiliser `// @ts-expect-error` avec raison).

**Validation entrée** :

- Toute route API qui prend du body : validation Zod obligatoire.
- Schemas dans `src/lib/validation.ts`.
- Réponse `400` avec message clair en cas d'invalidité.

**Sécurité** :

- Pas de `dangerouslySetInnerHTML` sans sanitization (DOMPurify).
- Toujours `withBailleurScope` ou `requireResourceInScope` sur les
  routes scopées multi-bailleur (cf. [docs/MULTI-BAILLEUR.md](docs/MULTI-BAILLEUR.md)
  si présente).
- Pas de secret en dur dans le code.
- Path serving : toujours `path.resolve` + `startsWith(UPLOADS_DIR)`.

**Tests** :

- TDD recommandé pour les features complexes.
- Cleanup setup avant chaque run (test idempotent).
- Pas de dépendance entre tests d'une même suite (chacun setup +
  teardown).

**Style** :

- ESLint Next.js. `npm run lint` doit passer.
- Pas de Prettier imposé — éditeur libre. Cohérent avec le voisinage.

## Convention de commit

[Conventional Commits](https://www.conventionalcommits.org) :

```
type(scope): courte description

Corps optionnel expliquant le pourquoi.

Refs / closes #issue.
```

**Types** :

- `feat:` nouvelle fonctionnalité
- `fix:` correction de bug
- `docs:` modification doc seulement
- `refactor:` sans changement de comportement
- `test:` ajout / modification de tests
- `chore:` build, deps, scripts (pas de changement code applicatif)
- `perf:` amélioration de perf
- `style:` formatage, whitespace (rare ici)

**Scope** (optionnel) : `auth`, `portail`, `pdf`, `email`, `irl`, etc.

## Process PR

1. Fork le repo (clic GitHub UI).
2. Branche depuis `main` : `git checkout -b feat/ma-feature`.
3. Commits atomiques et `type(scope):` dans le message.
4. Push sur ton fork.
5. Ouvre une PR vers `grx14/quittances-app:main` avec le template
   pré-rempli.
6. Attends la review — feedback en moins de 7 jours en général.
7. Adresse les commentaires (push directs sur la branche, on squash
   au merge).
8. Merge par mainteneur après approbation + CI verte.

**Pour les PRs >500 lignes** : ouvre une discussion préalable pour
valider l'approche avant de tout coder.

## Releases

Le projet suit le [Semantic Versioning](https://semver.org) :

- `MAJOR.MINOR.PATCH`
- Bumps :
  - `MAJOR` : breaking changes (schema DB, API, env vars)
  - `MINOR` : features backward-compatible
  - `PATCH` : bugfixes, sécurité

Chaque release a une entrée [CHANGELOG.md](CHANGELOG.md) curée
manuellement (pas de génération auto).

## Documentation

Si ta PR :

- ajoute une feature visible user → mettre à jour [README.md](README.md)
- modifie le schema DB → ajouter migration Prisma + commentaire schema
- ajoute env var → mettre à jour `.env.example` + `docker-compose.yml`
  + `scripts/setup.mjs`
- modifie un endpoint sécurité → mettre à jour [docs/SECURITE-CONFORMITE.md](docs/SECURITE-CONFORMITE.md)
- ajoute / change procédure RGPD → [docs/RGPD.md](docs/RGPD.md)

## Questions

Pour tout ce qui n'est ni bug ni feature concrète : ouvrir une
**Discussion** GitHub :
<https://github.com/grx14/quittances-app/discussions>

## License

En contribuant, tu acceptes que ta contribution soit publiée sous
[MIT License](LICENSE).
