# Isolation multi-bailleur server-side (Lot C bis, v2.4.0)

> Avant le Lot C bis, l'isolation multi-bailleur n'existait que côté
> UI : un selector `localStorage` choisissait un `bailleurId` que l'UI
> passait en query param. Côté API, soit le filtre était respecté
> mais sans validation server-side (les 5 routes "OK" : biens,
> locataires, quittances, dashboard, dashboard/alertes), soit absent
> (toutes les routes IRL et `/api/documents/courrier-revision`).
>
> Tout staff qui connaissait un bailleurId d'un autre tenant pouvait
> donc lire (et parfois modifier) ses données. Ce document décrit la
> nouvelle architecture qui ferme cette fuite.

## Modèle de données

### Table `BailleurMembership`

Un user staff est rattaché à 1 ou plusieurs bailleurs via une table
de jointure m:n :

```prisma
model BailleurMembership {
  userId     String
  bailleurId String
  role       AppRole  @default(MEMBER)
  createdAt  DateTime @default(now())
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  bailleur   Bailleur @relation(fields: [bailleurId], references: [id], onDelete: Cascade)

  @@id([userId, bailleurId])
  @@index([userId])
  @@index([bailleurId])
}
```

Caractéristiques :

- **PK composite** `(userId, bailleurId)` : 1 ligne par couple.
- **Cascade ON DELETE des deux côtés** : suppression d'un User ou d'un
  Bailleur purge automatiquement les memberships associés. Testé.
- **Index** sur `userId` (lookup session, hot path) et `bailleurId`
  (cascade delete + filtres admin).
- **`role` par membership** peut différer du `User.role` app-level
  (ex: ADMIN sur SCI A, VIEWER sur SCI B). La migration initiale fait
  `membership.role = user.role` pour cohérence avec l'état antérieur.

### TENANT exclu du modèle

Le rôle `TENANT` n'a **jamais** de membership. Son scope est défini
par `Locataire.tenantUserId` (cf. [PORTAIL-LOCATAIRE.md](./PORTAIL-LOCATAIRE.md)).
Les helpers `withBailleurScope` et `requireResourceInScope` lèvent
explicitement 403 si on tente de les appeler avec un session TENANT.

## JWT et session

### `auth.ts` jwt callback

Le jwt callback **re-fetch BailleurMembership à chaque hit
authentifié** :

```ts
const memberships = await prisma.bailleurMembership.findMany({
  where: { userId: token.userId as string },
  select: { bailleurId: true, role: true },
});
token.memberships = memberships;
```

**Coût** mesuré ~0.5ms par requête sur l'index `userId`, acceptable.
**Permet** ajout/retrait de membership avec effet immédiat sans
imposer un re-login. Pas de "throttle NextAuth" intermédiaire — le
re-fetch est inconditionnel.

### `auth.config.ts` session callback

`session.user.memberships` est exposé côté code (Server Components et
routes API) avec le type :

```ts
{ bailleurId: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' }[]
```

Vide pour les sessions TENANT.

### Bailleur actif côté client

`localStorage.activeBailleurId` (cf. `src/lib/bailleur-context.tsx`)
**reste** comme préférence d'affichage (UX). Ce n'est **plus** une
frontière de sécurité : chaque appel API revalide server-side que le
bailleurId demandé est dans les memberships du user.

## Helpers

Module `src/lib/multi-bailleur.ts`.

### `withBailleurScope(session, requestedBailleurId)`

Pour les routes liste/index où le bailleurId vient du client en query
param. Retourne `{ bailleurId, role }` ou `throw ScopeError`.

```ts
import { withBailleurScope, handleScopeError, ScopeError } from '@/lib/multi-bailleur';

export async function GET(req: NextRequest) {
  const session = await auth();
  try {
    const { bailleurId } = withBailleurScope(
      session,
      req.nextUrl.searchParams.get('bailleurId'),
    );
    const biens = await prisma.bien.findMany({ where: { bailleurId } });
    return NextResponse.json({ biens });
  } catch (e) {
    const r = handleScopeError(e);
    if (r) return r;
    throw e;
  }
}
```

Comportement :
- TENANT ou non auth → 401/403
- 0 membership → 403 ("Aucun bailleur associé")
- requestedBailleurId null + 1 membership → fallback automatique
- requestedBailleurId null + plusieurs → 400
- requestedBailleurId hors memberships → 403

### `requireResourceInScope(session, fetcher)`

Pour les routes `[id]` qui fetch une ressource précise. Le `fetcher`
reçoit la liste des bailleurIds autorisés et compose le where Prisma.

```ts
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  try {
    const quittance = await requireResourceInScope(session, allowed =>
      prisma.quittance.findFirst({
        where: {
          id: params.id,
          locataire: { bien: { bailleurId: { in: allowed } } },
        },
        include: { locataire: { include: { bien: { include: { bailleur: true } } } } },
      })
    );
    return NextResponse.json(quittance);
  } catch (e) {
    const r = handleScopeError(e);
    if (r) return r;
    throw e;
  }
}
```

**Toujours 404** quand la ressource n'existe pas OU n'est pas dans le
scope. Ne jamais retourner 403 pour un id `[id]` : ça révèle
l'existence cross-tenant.

### Pattern où composé selon le modèle

| Modèle           | where pattern                                                |
|------------------|--------------------------------------------------------------|
| `Bien`           | `{ bailleurId: { in: allowed } }`                            |
| `Locataire`      | `{ bien: { bailleurId: { in: allowed } } }`                  |
| `Quittance`      | `{ locataire: { bien: { bailleurId: { in: allowed } } } }`   |
| `RevisionIRL`    | `{ locataire: { bien: { bailleurId: { in: allowed } } } }`   |
| `Archive`        | dépend de `ownerType` (Locataire/Bien) — voir refactor       |

## Inventaire des routes

### Scope obligatoire (31 endpoints)

`/api/biens` GET POST · `/api/biens/[id]` GET PATCH DELETE
`/api/locataires` GET POST · `/api/locataires/[id]` GET PATCH DELETE
`/api/locataires/[id]/avoir` POST · `/api/locataires/[id]/portail-invite` POST DELETE
`/api/quittances` GET POST · `/api/quittances/[id]` GET PATCH DELETE
`/api/quittances/[id]/{pdf,preview}` GET · `/api/quittances/[id]/email` POST
`/api/quittances/{preview-mois,generer-mois,envoyer-mois}` POST
`/api/dashboard` GET · `/api/dashboard/alertes` GET
`/api/archives` GET POST · `/api/archives/[id]` GET DELETE
`/api/upload` POST · `/api/uploads/[...path]` GET
`/api/irl/eligibles` GET · `/api/irl/revisions` GET POST · `/api/irl/revisions/[id]/recommande` POST
`/api/documents/{avis-echeance,courrier-revision,depot-garantie,etat-des-lieux}` GET
`/api/exports/{pdf,xml}` GET
`/api/bailleurs` GET (liste filtrée) · `/api/bailleurs/[id]` GET PATCH DELETE

### Globales (pas de scope)

| Route                              | Statut    | Justification                              |
|------------------------------------|-----------|--------------------------------------------|
| `/api/admin/config`                | Globale   | AppConfig singleton                        |
| `/api/admin/users[/id]`            | Globale   | Gestion users + roles app-level (ADMIN)    |
| `/api/admin/invitations[/id]`      | Globale   | Flow d'invitation app-level (ADMIN)        |
| `/api/admin/insee`                 | Globale   | Config INSEE singleton                     |
| `/api/audit` (renommé)             | Hybride   | Voir ci-dessous                            |
| `/api/parametres[/test-email]`     | Globale   | Préférences user perso                     |
| `/api/profil/totp/*`               | Globale   | 2FA perso                                  |
| `/api/2fa-verify`                  | Globale   | Auth flow                                  |
| `/api/gmail/{callback,disconnect,test}` | Globale | OAuth Gmail perso                       |
| `/api/irl/indices`                 | Globale   | Référentiel INSEE public                   |
| `/api/irl/insee/{test,sync}`       | Globale   | Sync config INSEE                          |
| `/api/register`, `/api/invitations/[token]` | Globale | Inscription/acceptation                |
| `/api/public/*`                    | Globale   | Endpoints non-auth                         |

### `/api/audit` (anciennement `/api/admin/audit`)

**Décision actée** : la route a été renommée `/api/audit` (sortie
de `/api/admin/*`) parce qu'elle est désormais accessible à tout
staff avec **données filtrées par memberships**. ADMIN app-level voit
tout (les logs avec `metadata.bailleurId` non scopable inclus).

Le préfixe `/api/admin/*` est **réservé** aux opérations strictement
app-level (gestion users, AppConfig, INSEE keys), où le caller doit
être ADMIN au sens `User.role`.

## Audit log scopé

Toutes les entrées du catalogue `audit.ts` pour les actions métier
(`bailleur.*`, `bien.*`, `locataire.*`, `quittance.*`, `irl.*`,
`document.*`, `archive.*`, `export.*`) doivent porter
`metadata.bailleurId` à partir de v2.4.0. Permet :

- Filtrage `/api/audit?bailleurId=...`
- Cohérence avec `withBailleurScope` (toute action métier a un
  bailleur cible).

Logs auth (`user.login`, `user.register`, etc.) et logs portail
TENANT (`tenant.*`) inchangés (pas de scope bailleur).

## États transitoires

### Staff sans membership

Comportement après v2.4.0 : `withBailleurScope` retourne 403
("Aucun bailleur associé à votre compte. Contactez un
administrateur."). Toutes les pages staff scopées sont vides ou
refusées.

**Hors scope Lot C bis** : page d'onboarding dédiée
(`/onboarding-staff` ou message inline). Flag pour Lot D ou ultérieur.

### Migration en cours

Pendant le déploiement v2.4.0 :

1. `prisma migrate deploy` ajoute la table BailleurMembership
   (vide).
2. Script `scripts/seed-memberships.mts` peuple la table à partir
   de l'état actuel (1 membership par couple staff × bailleur
   existant).
3. Tous les JWT existants sont invalidés (shape change). Re-login
   forcé pour tous les staff.

Pendant la fenêtre où containers anciens et nouveaux coexistent
(rolling update), les vieux JWT sans `memberships` sont rejetés
proprement (`memberships=[]` → 403 "Aucun bailleur associé") par
les nouveaux endpoints.

## Tests

Suite dédiée : `tests/multi-bailleur-isolation.mts`. Distincte de
`tests/portail-isolation.mts` (qui teste l'isolation TENANT vs staff).

Cas couverts (cf. note de cadrage v2 §5) : list/by-id, cross-tenant
404, multi-membership, localStorage manipulé, GET /api/bailleurs
filtré, cascade delete user/bailleur.
