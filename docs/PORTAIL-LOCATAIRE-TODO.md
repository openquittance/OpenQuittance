# Portail locataire — dette technique à résorber avant v2.3.0 finale

> Pendant les Lots A → C, on ship des contournements pragmatiques pour
> débloquer les tests utilisateur. Liste exhaustive des points à corriger
> proprement dans le **Lot D** avant le tag `v2.3.0` final.

## D.1 — Page intermédiaire `/portail/login/verify` (issue du Lot B)

**Contournement actuel** : l'email d'invitation pointe directement vers la
route API `GET /api/portail/login/verify?token=...`, qui consomme le token
côté serveur via `signIn('magic-link')` puis redirige.

**Problème** : pas de page UI à `/portail/login/verify` (404 si on tape l'URL
sans le préfixe `/api/`). Sur erreur (token expiré / consommé / invalide), le
locataire atterrit sur `/portail/login?error=...` avec un message générique.

**Action attendue Lot D** :

1. Créer `src/app/portail/login/verify/page.tsx` (Server Component) qui :
   - Lit le `?token=` query param
   - Appelle la route API en interne (server-side fetch ou import direct)
   - Affiche une UI dédiée selon le résultat :
     - succès → redirect `/portail`
     - token consommé → "Ce lien a déjà été utilisé. [Demander un nouveau lien]"
     - token expiré → "Ce lien a expiré (15 minutes). [Demander un nouveau lien]"
     - token invalide → "Lien invalide. [Saisir mon email]"
2. Modifier `lib/email/portail.ts` pour pointer la `verifyUrl` vers la page
   (`/portail/login/verify`), pas vers la route API
3. Garder la route API mais en interne uniquement (appelée par la page)
4. **Tests E2E à ajouter** dans `tests/portail-isolation.mts` :
   - Test 14 : token consommé → page affiche le bon état + bouton vers form
   - Test 15 : token expiré (manipule `expiresAt` en DB) → idem
   - Test 16 : token absent → état "missing_token" affiché

**Justification du report** : le contournement est fonctionnellement
équivalent (l'utilisateur arrive bien sur `/portail/login?error=...` qui
gère les 3 cas). Mais l'UX est dégradée (un round-trip de redirect
visible dans la barre d'URL au lieu d'une vraie page). Lot D = polish UX.

---

## D.2 — Audit suite de tests d'isolation (issue du Lot B)

**Contexte** : le bug "TENANT promu ADMIN" (corrigé en 358ad87) a échappé
aux 12 tests d'isolation parce que tous créaient un ADMIN dans le setup.
adminCount > 0 quand le TENANT login → branche fautive jamais exercée.

**Action attendue Lot D** :

1. Relire chacun des tests existants dans `tests/portail-isolation.mts`
2. Identifier ceux qui supposent **implicitement** la présence d'un
   user staff (ADMIN/MEMBER/VIEWER) en base au moment où le TENANT agit
3. Pour chaque test pertinent, ajouter un cas **"rôle solo, sans staff"** :
   - le TENANT est seul en base (pas d'autre user)
   - même flow → même résultat attendu
4. Critère de pertinence : tous les tests qui touchent au jwt callback,
   à la session NextAuth, ou à la promotion automatique. Probable
   candidats : tests 1, 2, 5, 6, 7, 11.

**Pour chaque cas non pertinent** : ajouter un commentaire explicite
dans le test (`// Pas de variante "solo" : test isolé du état de la DB`).

**Tests à ajouter probablement (estimation)** : 3 à 6 nouveaux cas.
Numérotation : continuer à partir de 25+ (cf. D.4 ci-dessous).

**Justification du report** : pas de risque sécurité actif — le bug
qui a motivé cette tâche est déjà corrigé et couvert par le test 13.
On peaufine la suite pour réduire le risque qu'un futur changement
similaire passe à travers les mailles. Lot D = polish + tests E2E.

---

## D.3 — Audit Server vs Client Components du portail (issue du Lot C)

**Contexte** : `/portail/quittances` shippé en Client Component lors du
Lot C → bug `useSession()` retourne `'unauthenticated'` au premier render
SSR → `router.push('/portail/login')` → middleware rebound vers `/portail`.
Les tests d'isolation HTTP (fetch raw Node, sans browser JS) n'ont pas
attrapé le bug parce qu'ils ne déclenchent jamais l'hydratation client.

Détecté manuellement via Playwright lors de la capture des screenshots.
Fix : conversion en Server Component (`await auth()`), extraction
modal/buttons dans `QuittancesList.tsx` client child. Test 24 ajouté
(régression : fetch HTML page, assert titre rendu côté SSR).

**Action attendue Lot D** :

1. Lister chaque page sous `/portail/*` : Server ou Client ?
2. Pour chaque Client Component, vérifier qu'il ne fait pas
   `useSession() + redirect` (anti-pattern bug Lot C).
3. Privilégier Server Component dès que `await auth()` suffit ; garder
   Client uniquement pour l'interactivité réelle (forms, modals).
4. Étendre la couverture des tests d'isolation HTTP à **toutes** les
   pages du portail : assert que le HTML SSR contient le contenu attendu
   (pas seulement un placeholder "Chargement…").

**Justification du report** : bug critique attrapé et corrigé en Lot C
(test 24 protège). Étape D = audit systématique du reste pour éviter
qu'un futur ajout de page tombe dans le même piège.

---

## C.12 — Branding bailleur non appliqué (rc2 → corrigé rc3)

**Symptôme rc2** : modifier `Bailleur.pdfCouleur` côté staff
(Paramètres > Apparence ou édition bailleur) ne produit aucun
changement visible dans `/portail`, `/portail/quittances`, ni dans
les PDF générés.

**Diagnostic** :

1. **HTML portail** : `style={{ backgroundColor: \`${bailleur.pdfCouleur}10\` }}`
   concatène hex + `"10"` → `#ff000010` = 8-char hex avec alpha
   `0x10/0xff = 6.27%`. Quasi-invisible. Et si le bailleur a un
   logo uploadé, le ternaire `logoUrl ? <img> : <FileText>` masque
   l'icône colorée. Donc la seule trace de la couleur était un fond
   à 6% d'opacité, indiscernable du gris neutre.
2. **PDF (`pdf-generator.ts`)** : constante `BRAND_DARK = '#2b2540'`
   hardcodée + `PILL_BG = '#2b2540'`. Utilisées 4 fois (pill QUITTANCE,
   filet d'accent box bien, barre total). `bailleur.pdfCouleur`
   **jamais lu** dans le générateur PDF (alors qu'il est lu dans
   `pdf-recap.ts` correctement).
3. **Pourquoi aucun test ne couvrait** : test 24 vérifiait le rendu
   SSR sans assertion sur la couleur. Test 25 ajouté pour patcher
   `pdfCouleur` en DB + re-fetch HTML + assert présence visible.

**Fix appliqué (rc3)** :

- HTML : header `backgroundColor: \`${pdfCouleur}1f\`` (12% alpha,
  visible) + `borderBottom: 3px solid ${pdfCouleur}` (full opacity,
  toujours visible même avec logo) + `<span style={{color:pdfCouleur}}>`
  sur le nom du bailleur. Appliqué à `/portail` et `/portail/quittances`.
- PDF : helper `brandColor(ctx)` lit `ctx.bailleur.pdfCouleur` avec
  fallback `#1a3a5c`. Substitue les 4 usages de `BRAND_DARK`/`PILL_BG`.
- Test 25 : démontré rouge avec rc2 (occurrences=["10","10"]
  visibleColor=false) → vert avec rc3 (occurrences=["1f","","","1f","",""]
  visibleColor=true).

**À surveiller post-rc3** : la pill QUITTANCE et la barre total du
PDF utilisent désormais la couleur bailleur. Si la couleur est très
claire (ex: `#fffacd` jaune pâle), le texte blanc sur le fond clair
devient illisible. ✅ **Résolu dans le scope étendu rc3** :

## C.12 (scope étendu) — Système de branding cohérent

Plutôt que de juste lire `bailleur.pdfCouleur` correctement, on a
posé la règle métier dans `docs/PORTAIL-BRANDING.md` :

1. **Pas d'aplat plein** de la couleur bailleur. Backgrounds restent
   neutres (blanc / gris-50). La couleur n'apparaît qu'en accent.
2. **3 variables CSS dérivées** d'un seul `--brand` (`lib/branding.ts`) :
   - `--brand` = pdfCouleur telle quelle
   - `--brand-pale` = `hsl(<hue>, 30%, 95%)` pour halos
   - `--brand-text-on-brand` = noir/blanc selon luminance WCAG
3. **PDF cohérent** avec règle 1 :
   - Pill QUITTANCE → outline 1px + texte brand (au lieu de fill brand
     + texte blanc, qui devenait illisible si pdfCouleur clair)
   - Box bien : filet d'accent 3px (déjà conforme)
   - Barre total : bg neutre `HEADER_BG` + bordure 2px brand + texte
     brand pour montant + label
4. **Tests 25 + 26** : assertions sur les CSS vars injectées dans le
   HTML SSR + edge cases (#000, #fff, #ffff00 fluo, #800080 violet)
   pour vérifier que `textOnBrand` est cohérent avec la luminance.

23/23 tests passent.

---

## D.6 — Lint CI anti-régression fetches scopés (issue rc1 → rc2)

**Contexte** : le bug rc1 (`parametres/irl/page.tsx:71` faisait
`fetch('/api/locataires')` sans `?bailleurId=`) a échappé aux 12 tests
d'isolation API parce qu'ils appellent les routes en direct, jamais
via les `fetch` UI. Le pattern peut revenir sur n'importe quelle
future page client.

**Action attendue Lot D** :

1. Script `scripts/lint-fetches.mjs` qui grep dans `src/app/**/*.tsx`
   et `src/components/**/*.tsx`. Pattern conseillé (allowlist des
   routes globales) :
   - Allowlist : `/api/(audit|admin|parametres|profil|public|gmail|register|invitations|2fa-verify|portail|irl/(indices|insee))`
   - Tout `fetch(.../api/...)` qui ne match pas l'allowlist DOIT
     passer `bailleurId` (en query string OU dans le body
     `JSON.stringify`).
2. Couverture exhaustive des 31 routes scopées (cf.
   `docs/MULTI-BAILLEUR.md` §"Inventaire des routes").
3. Hook pre-commit ou GitHub Actions step `lint:fetches`. Exit 1 si
   violation. Skip explicite via commentaire `// lint-fetches: skip — <raison>`.
4. Documenter la regex finale dans `docs/MULTI-BAILLEUR.md` § "Côté client".

**Justification du report** : rc2 livre les 6 fixes manuels et un
test SSR de régression. Le filet automatique demande de la mise au
point regex pour ne pas générer de faux positifs sur les routes
globales / [id] / body POST. À traiter une fois la convention
stabilisée.

---

## D.7 — Tests SSR multi-membership pour toutes les pages staff

**Contexte** : rc2 ajoute un seul test SSR sur `/parametres/irl`
(démo TDD rouge → vert pour le bug rc1). Les autres pages staff
peuvent avoir le même pattern de bug et ne sont pas couvertes.

**Action attendue Lot D** : étendre `tests/ui-pages-multi-bailleur.mts`
avec un test SSR par page staff principale, exécuté avec un user
multi-membership :
- `/onboarding`
- `/quittances`
- `/biens`
- `/locataires`
- `/` (dashboard)
- `/exports`
- `/documents`

Pour chaque page : status 200, HTML contient le titre attendu, et
les fetches loader simulés retournent 200 (pas 400/403).

**Justification du report** : rc2 corrige les 6 sites identifiés et
prouve la mécanique TDD sur 1 page. La couverture exhaustive est un
filet anti-régression sur les futures évolutions, sans urgence.

---

## D.9 — JWT callback re-fetch User.role (issue rc3 → rc4)

**Contexte** : le jwt callback (`src/auth.ts`) re-fetch `memberships`
à chaque hit authentifié, mais pas `User.role`. `token.role` reste
celui chargé au login. Conséquence : si un user a été corrompu
(role=MEMBER alors qu'il devrait être TENANT), le sanitize rc4
restore `role=TENANT` en DB, mais son JWT existant garde `MEMBER`
jusqu'à expiration (30j).

**Pas exploitable en pratique rc4** : les filtres API
(`/api/admin/users` GET + PUT) utilisent désormais
`locatairesAccessibles` comme source of truth, pas `User.role`.
Donc même avec JWT role=MEMBER, le user reste filtré côté API.
Et `requireStaffSession` utilise `session.user.role` qui vient du
JWT — un user corrompu re-loguant avec role=TENANT en DB enverrait
un nouveau JWT role=MEMBER (ancien hash) tant que sa session n'expire
pas. Mais comme `withBailleurScope` vérifie aussi `memberships`
(sanitize les a purgées), il tombe sur "0 membership → 403".

**Action attendue Lot D** : modifier `src/auth.ts` jwt callback pour
re-fetch `User.role` aussi à chaque hit (1 query supplémentaire,
même cost que le re-fetch memberships actuel). Permet d'invalider
proprement les corruptions héritées sans attendre l'expiration JWT.

```ts
const u = await prisma.user.findUnique({
  where: { id: token.userId as string },
  select: { role: true, totpEnabled: true, mfaSessionId: true, mfaVerifiedAt: true },
});
token.role = u?.role ?? 'MEMBER';  // ← déjà fait au login, à étendre à chaque hit
```

**Justification du report** : pas urgent car attaque non exploitable
(memberships sanitize purgées + filtres API basés sur Locataire).
Hygiène de fraîcheur JWT pour Lot D.

---

## D.5 — Convention auth gating + couverture SSR

**Contexte** : le bug `/portail/quittances` Client Component
(`useSession() + router.push()` → boucle middleware) était **invisible**
aux tests E2E HTTP fetch parce qu'aucun moteur JS ne s'exécute côté
client lors de tests Node. Le test 24 colmate cette page spécifique,
mais le même pattern peut revenir sur **n'importe quelle future page
Client** du portail (ex : `/portail/profil`, `/portail/paramètres`,
etc.).

**Action attendue Lot D** :

1. Poser une convention explicite (à documenter dans
   `docs/PORTAIL-LOCATAIRE.md` §architecture) :
   > **Pas de `useSession() + redirect` côté client dans le portail.**
   > L'auth gating se fait toujours via un Server Component
   > (`await auth()` + `redirect()`). Les Client Components ne sont
   > utilisés que pour l'interactivité réelle (forms, modals, state).
2. Pour chaque page du portail (existante + nouvelle), s'assurer
   qu'**au moins un test d'isolation HTTP** vérifie le rendu HTML SSR
   (équivalent test 24) : titre attendu présent, pas de placeholder
   "Chargement…", pas de `Location:` parasite.
3. Ajouter un check CI/lint : grep `'use client'` + `useSession` dans
   `src/app/portail/**` → fail si match. Force la convention.

**Justification du report** : bug réel attrapé en Lot C (test 24
protège la page concernée). Étape D = systémique (convention +
couverture + lint), pour bloquer le pattern à la racine sur les
futures évolutions.

---

## D.4 — Numérotation des tests d'isolation

Décision actée : ne pas renuméroter rétroactivement. Séquence figée :

- **1–12** : isolation initiale (Lot A)
- **13**   : régression TENANT promu ADMIN (Lot B)
- **14–16** : réservés Lot D.1 (page `/portail/login/verify`)
- **17–23** : Lot C (download PDF, list, multi-bail, E2E)
- **24**   : régression page `/portail/quittances` SSR (Lot C, post-fix D.3)
- **25+**  : nouveaux tests Lot D.2 (audit "solo role")

Justification : renuméroter casserait l'historique (commits, screenshots,
descriptions de PR référencent les numéros). Acceptable de laisser des
"trous" 14-16 jusqu'à implémentation Lot D.

---

## Format des futures entrées

Toute dette identifiée pendant les lots intermédiaires doit être
ajoutée ici sous la forme :

```
## D.N — Titre court

Contournement actuel : ...
Problème : ...
Action attendue Lot D : ...
Tests E2E à ajouter : ...
Justification du report : ...
```

Pas d'orphan TODO. Chaque entrée est résolue avant le tag `v2.3.0`.
