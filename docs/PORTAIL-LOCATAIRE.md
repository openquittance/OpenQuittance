# Portail locataire (#13) — note de cadrage validée

> Statut : **validée le 2026-05-02**, livraison ciblée v2.3.0.
> Découpage : 4 lots (A : fondations · B : magic link + activation · C : portail UI · D : polish).

---

## 1. Modèle de données

### Décision : User avec rôle `TENANT` + lien polymorphe sur Locataire

```prisma
enum AppRole {
  ADMIN
  MEMBER
  VIEWER
  TENANT      // ← nouveau
}

model User {
  // champs existants inchangés
  // 2FA reste disponible pour les TENANT s'ils le souhaitent
  locatairesAccessibles Locataire[] @relation("TenantAccess")
}

model Locataire {
  // ... existant
  tenantUserId      String?
  tenantUser        User?     @relation("TenantAccess", fields: [tenantUserId], references: [id], onDelete: SetNull)
  portailActiveLe   DateTime?

  @@index([tenantUserId])
}

model PortailMagicLink {
  id            String    @id @default(cuid())
  tenantUserId  String
  tenantUser    User      @relation(fields: [tenantUserId], references: [id], onDelete: Cascade)
  tokenHash     String    @unique
  expiresAt     DateTime
  consumedAt    DateTime?
  createdAt     DateTime  @default(now())
  ip            String?

  @@index([tenantUserId, expiresAt])
}
```

- Un **User TENANT** peut être lié à **N Locataire** chez **un même bailleur** (multi-baux du même locataire OK)
- Le portail ne supporte pas v1 le cas « locataire chez 2 bailleurs distincts » (→ 2 comptes, 2 emails)

### Cycle de vie du compte TENANT

| Événement | Effet |
|---|---|
| Bailleur active le portail sur une fiche Locataire | Crée (ou réutilise) le User avec role TENANT, lie `tenantUserId`, set `portailActiveLe` |
| Bailleur supprime un Locataire | `tenantUserId = SetNull` automatique. Si le User TENANT n'a **plus aucun** Locataire actif lié → flag `portailEnabled = false` (placeholder pour audit) |
| `dateSortie` du Locataire passée depuis 5 ans | Job de purge mensuel : désactive le portail (set `portailActiveLe = null`). Bailleur peut réactiver manuellement |
| Bailleur désactive le portail | `tenantUserId = null`, magic links pendants purgés. User TENANT reste pour audit, mais ne peut plus se connecter |
| Email du Locataire identique à un user staff existant (ADMIN/MEMBER/VIEWER) | **Refus explicite** lors de l'activation, message clair, pas de fusion automatique |

---

## 2. Flow d'authentification

### Magic link uniquement (pas de password en v1)

**Activation par le bailleur** (depuis la fiche locataire) :
1. Bouton **"Inviter au portail"** (visible si `Locataire.email` renseigné)
2. Backend valide l'absence de collision email avec un user staff
3. Crée/réutilise le User TENANT, lie le Locataire, génère un magic link, l'envoie par email (Gmail API/SMTP du bailleur)

**Login locataire** :
1. `/portail/login` → saisit son email → reçoit un magic link (15 min)
2. Clic sur le lien → `/portail/login/verify?token=...` consomme le token, crée la session
3. Sessions ultérieures : nouveau magic link à chaque déconnexion (sliding window 30j entre-temps)

**Récup d'accès** : pas de mécanisme côté locataire. Le bailleur peut renvoyer un lien depuis la fiche.

---

## 3. Scope v1

### Inclus

- Voir la liste de **ses** quittances (filtrées par `tenantUserId`)
- Télécharger le PDF d'une quittance (modale aperçu + download)
- Voir ses infos de bail (loyer, charges, dépôt, dates)
- Voir l'historique des révisions IRL appliquées
- Voir le statut "envoyée par email" de chaque quittance
- **Email auto "Nouvelle quittance disponible"** quand le bailleur génère une quittance pour un locataire avec portail actif :
  - Email léger : 1 ligne + bouton "Voir mes quittances" → `/portail/quittances`
  - **Pas** de PDF en pièce jointe (le portail remplace l'envoi PDF traditionnel)
  - Si portail inactif → l'envoi PDF traditionnel reste actif (comportement v2.2)

### Hors scope v1 (reporté)

- Téléchargement d'autres documents (avis échéance, EDL, courrier IRL, archives)
- Modification (email, téléphone, mot de passe…)
- Demande de quittance manquante
- Upload de justificatifs
- Paiement en ligne (Stripe — #22)
- Messagerie / chat
- Notifications push

### Statut de paiement

Tant que #11 (suivi des paiements) n'est pas livré, on affiche `quittance.datePaiement` (déjà saisi par le bailleur). La quittance EST le reçu de paiement.

---

## 4. Sécurité

### Isolation stricte

| Zone | Règle |
|---|---|
| `/portail/*` | Middleware enforce `role === 'TENANT'`. Si autre role → redirect `/`. Si non auth → `/portail/login` |
| Routes staff (`/`, `/bailleurs`, `/quittances`, …) | Middleware refuse `role === 'TENANT'` → redirect `/portail` |
| `/api/portail/*` | Filtre toujours par `WHERE locataire.tenantUserId = session.user.id`. Jamais d'accès direct par ID en query string |
| `/api/locataires`, `/api/quittances`, `/api/admin/*` | `requireRole('VIEWER')` qui exclut TENANT (TENANT < VIEWER dans la hiérarchie) |

### Tests d'isolation obligatoires (Lot A)

1. TENANT ne peut PAS accéder à `/api/locataires` → 403
2. TENANT ne peut PAS télécharger une quittance d'un autre locataire en devinant l'ID → 404
3. Staff (MEMBER/VIEWER/ADMIN) tape `/portail` → redirect `/`
4. TENANT déconnecté tape `/portail/quittances` → redirect `/portail/login`
5. **Activation refusée si email collision avec un user staff existant** → erreur claire

### Rate limiting

- **Demande magic link** : 3 / heure / **email** (clé `portal-magic:<email>`)
- **Validation token** : 10 / heure / IP
- List/download quittance : couvert par rate limit global

### Sessions

| Type | maxAge | updateAge (sliding) |
|---|---|---|
| Magic link | **15 min**, usage unique, hash scrypt | n/a |
| Session JWT TENANT | **30 jours** | 24h (refresh à chaque visite) |
| Session JWT staff | 30 jours (inchangé) | 24h (inchangé) |

### Tokens magic link

- 32 octets `randomBytes` → 64 chars hex
- Stockage **hash scrypt** uniquement (jamais en clair en base)
- URL contient le token clair, invalidé à la 1ère consommation

### Audit log

Nouveau préfixe `tenant.*` :
- `tenant.invited` (par le bailleur, depuis la fiche locataire)
- `tenant.magic_link_requested` (email)
- `tenant.login` (avec IP)
- `tenant.quittance_view` (quittanceId)
- `tenant.quittance_download` (quittanceId)
- `tenant.portail_disabled` (par le bailleur)

Visible dans `/parametres/journal` côté admin.

---

## 5. Branding

**Page `/portail/login`** : neutre (logo Quittances générique). Pas d'info sur le bailleur avant authentification, évite la fuite d'information sur les locataires d'un bailleur donné.

**Après authentification** : le portail affiche le **nom + logo + couleur charte du bailleur** (récupéré via le Locataire lié), avec footer discret « Propulsé par Quittances · Tipeee ».

Si le User TENANT est lié à plusieurs Locataire **du même bailleur**, branding unifié (le bailleur est le même).

---

## 6. Impact multi-tenant futur (#20)

Compatible sans dette technique :
- `Locataire` est déjà rattaché à `Bailleur` via `Bien`
- Quand on introduira `Workspace`, on ajoutera `bailleur.workspaceId` et tout le reste suit
- Le filtre portail (`WHERE locataire.tenantUserId = session.user.id`) garantit l'isolation tenant
- En multi-tenant, on ajoutera juste un `WHERE bailleur.workspaceId = ...` (5 lignes par endpoint)

Un locataire chez 2 workspaces différents = 2 comptes distincts (cohérent avec l'isolation par workspace).

---

## 7. Découpage en lots

| Lot | Contenu | Effort | Tag |
|---|---|---|---|
| **A** | Schema + migration + rôle TENANT + middleware d'isolation + tests d'isolation API | 1 session | (intermédiaire) |
| **B** | Magic link API + email + page `/portail/login` + activation depuis fiche locataire + collision email | 1 session | (intermédiaire) |
| **C** | Pages `/portail` et `/portail/quittances` + API filtrée + download PDF + branding bailleur + audit | 1 session | (intermédiaire) |
| **D** | Email auto "Nouvelle quittance" + désactivation auto 5 ans + polish mobile + tests E2E complets | demi-session | **v2.3.0** |

---

## 8. Décisions actées (rappel synthèse)

- ✅ Modèle : `User.role = TENANT` + `Locataire.tenantUserId`
- ✅ Auth : magic link only en v1, activation manuelle par bailleur
- ✅ Scope v1 : voir/télécharger ses quittances + bail + révisions IRL + statut envoi
- ✅ Sécurité : isolation par middleware + filtre FK obligatoire dans toutes les requêtes
- ✅ Sessions TENANT : 30j sliding (pas 7j)
- ✅ Branding : `/portail/login` neutre, branding bailleur après auth
- ✅ Conservation ex-locataires : 5 ans après `dateSortie`, désactivation auto, réactivable
- ✅ Email auto "Nouvelle quittance" en v1 si portail actif
- ✅ Suppression locataire : SetNull + désactivation auto si plus aucun lien actif
- ✅ Collision email staff : refus explicite + test E2E obligatoire
