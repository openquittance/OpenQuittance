# Procédures RGPD — quittances-app

Version v2.8.0. Référence opérationnelle pour le bailleur responsable de
traitement.

## 1. Cadre

Le bailleur (personne physique ou morale) qui exploite cette instance
est **responsable de traitement** au sens du RGPD (article 4 §7) pour
les données des locataires gérés via l'app.

Si l'instance est exploitée pour le compte de tiers (mandataire,
agence), le mandataire devient sous-traitant — un DPA (Data Processing
Addendum) doit alors être établi avec le bailleur final.

## 2. Bases légales par finalité

| Finalité | Base légale RGPD |
|---|---|
| Émission quittances + suivi paiement | Exécution du contrat (art. 6.1.b) |
| Conservation 5-10 ans (loi française) | Obligation légale (art. 6.1.c) |
| Portail locataire consultation documents | Exécution du contrat (art. 6.1.b) |
| Logs d'audit + sécurité | Intérêt légitime (art. 6.1.f) |

## 3. Droits des personnes

### 3.1 Droit d'accès (art. 15) + droit à la portabilité (art. 20)

**Endpoint** : `GET /api/locataires/[id]/export-rgpd` (auth ADMIN
bailleur). Retourne un ZIP contenant :

- `data.json` : toutes données structurées (perso, bail, quittances, IRL)
- `quittances/{YYYY}/*.pdf` : PDF régénérés
- `documents/*.pdf` : Archives ownerType=Locataire
- `audit-log.json` : événements horodatés (acteurs anonymisés)
- `README.txt` : explication conforme art. 13

UI : bouton "Exporter données RGPD" sur fiche locataire (à venir
v2.8.1 — pour l'instant accessible via API).

Délai de réponse légal : **1 mois** à compter de la demande
(art. 12.3 RGPD).

### 3.2 Droit de rectification (art. 16)

Édition via UI staff (modale Locataire). Si la demande vient du
locataire, le staff doit la traiter manuellement. Pas d'auto-rectif
côté tenant en v2.8.0.

### 3.3 Droit à l'effacement (art. 17)

**Endpoint** : `DELETE /api/locataires/[id]` (auth ADMIN bailleur).

Cascade :

1. `Archive` ownerType='Locataire' (rows DB + fichiers physiques disque).
2. `Locataire` row → cascade FK `Quittance`, `RevisionIRL`.
3. `User` TENANT lié → soft-delete (`disabledAt`) si plus aucun autre
   locataire ne le référence.
4. `PortailMagicLink` pendants → purge.
5. `AuditLog` → anonymisation `targetId` en `deleted_loc_<sha256-12>`
   pour préserver la traçabilité légale sans exposer la PII.

**Limites légales** :

- Quittances en cours de période : conserver jusqu'à fin du bail
  (obligation légale art. 6.1.c).
- Historique fiscal (5 ans) ou comptable SCI (10 ans) : data peut être
  conservée en archive **anonymisée** mais pas effacée totalement.
- En cas de demande pendant la durée légale : informer le locataire
  du motif de refus partiel (art. 17.3.b).

### 3.4 Droit d'opposition / limitation (art. 21-22)

Toggles `Locataire.partage*` désactivent la diffusion vers le tenant
(portail) sans supprimer la donnée. Pour limitation totale : passer
`portailActif=false`.

### 3.5 Droit d'introduire une réclamation

Tout locataire peut saisir la **CNIL** via https://www.cnil.fr/fr/plaintes
si l'exercice de ses droits n'est pas satisfaisant.

## 4. Procédure de violation de données (art. 33-34)

### 4.1 Détection

Sources :

- Logs d'audit (`AuditLog`) : pattern d'accès anormal, cross-tenant
  refusé en série (signal injection / scan).
- Tentatives login échouées massives (rate-limit hit).
- Magic links portail consommés depuis IP inconnues.
- Container compromis (build alteré, intrusion SSH NAS).

### 4.2 Évaluation du risque

Risque pour les droits et libertés des personnes :

- **Faible** : log technique sans PII, échec authent sans compromission.
  → pas de notification CNIL requise.
- **Élevé** : exfiltration de données locataires (noms, adresses,
  IBAN éventuels, quittances). → notification CNIL <72h **OBLIGATOIRE**
  + notification individuelle des locataires concernés.

### 4.3 Notification CNIL (art. 33)

Délai : **72 heures** à partir du moment où le bailleur a connaissance
de la violation.

Contenu (modèle minimal) :

```
À : notifications@cnil.fr (formulaire en ligne https://notifications.cnil.fr/)
Objet : Notification de violation de données — [Nom bailleur]

1. Nature de la violation : [confidentialité / intégrité / disponibilité]
2. Catégories de personnes concernées : locataires ([nb])
3. Catégories de données : nom, adresse, dates de bail, montants loyer
4. Conséquences probables : [usurpation, phishing, etc.]
5. Mesures prises : [révocation tokens, isolation NAS, audit logs préservés]
6. Coordonnées contact : [email RGPD bailleur]
7. Date et heure de la violation : [ISO 8601]
8. Date et heure de la prise de connaissance : [ISO 8601]
```

### 4.4 Notification individuelle aux locataires (art. 34)

Obligatoire si risque **élevé**. Modèle email :

```
Objet : Information importante concernant la sécurité de vos données

Madame, Monsieur,

Nous avons détecté le [date] un incident de sécurité ayant pu affecter
les données suivantes vous concernant : [liste].

Nature de l'incident : [résumé technique simple, sans détails exploitables].

Mesures que nous avons prises :
- [révocation accès]
- [audit complet]
- [notification CNIL effectuée]

Mesures que nous vous recommandons :
- Modifier votre mot de passe portail [si applicable]
- Surveiller toute communication suspecte usurpant notre identité
- Ne jamais cliquer sur un lien email demandant des informations bancaires

Pour toute question : [email RGPD bailleur]

Vous pouvez également saisir la CNIL : https://www.cnil.fr/fr/plaintes

Cordialement,
[Nom bailleur]
```

### 4.5 Documentation interne

Le bailleur tient un **registre des violations** (art. 33.5) :
date, nature, conséquences, mesures, état CNIL. Conservation
permanente (durée de vie du traitement).

Modèle minimal (Google Sheet ou note locale chiffrée) :

```
| Date détection | Date connaissance | Nature | Catégories | Risque | CNIL notifiée | Locataires notifiés | Mesures | Statut |
```

## 5. Sous-traitants

| Sous-traitant | Service | Données concernées | Cadre légal | DPA |
|---|---|---|---|---|
| Google LLC (Gmail API) | Envoi emails (si configuré) | Email locataire, contenu quittance | Data Privacy Framework + SCCs | https://workspace.google.com/terms/dpa_terms.html |
| (Optionnel) Cloudflare | Reverse proxy si activé | IP, headers HTTP | Data Privacy Framework + SCCs | https://www.cloudflare.com/cloudflare-customer-dpa/ |
| (Optionnel) Synology C2 | Backup chiffré si activé | Backup chiffré côté client | Hébergement EU disponible | https://c2.synology.com/fr-fr/legal |

Si auto-hébergement strict + SMTP UE (ex. Mailjet, Brevo) →
**aucun transfert hors UE**.

## 6. Durées de conservation

| Donnée | Durée | Référence légale |
|---|---|---|
| Quittances de loyer | 5 ans après fin du bail | Loi du 24 mars 2014 |
| Bail signé + EDL | Durée du bail + 3 ans | Code civil |
| Cautionnement | 5 ans après fin | Code civil |
| Quittances comptables (SCI) | 10 ans | Code commerce art. L123-22 |
| Logs d'audit | 1 an glissant | Bonne pratique CNIL |
| Magic links portail | 15 minutes | Sécurité |
| Données locataire portail | Désactivation auto à 5 ans après dateSortie | Implémenté bootstrap.mjs |

## 7. Mesures techniques (art. 32)

Implémentées dans v2.8.0 (cf. [SECURITE-CONFORMITE.md](SECURITE-CONFORMITE.md)) :

- Chiffrement AES-256-GCM des champs sensibles (Gmail tokens, SMTP pass, TOTP secret).
- Hachage bcrypt 10 rounds des mots de passe.
- Authentification 2FA (TOTP) optionnelle.
- Magic link portail : entropie 256 bits + scrypt + 15 min + usage unique.
- Isolation multi-bailleur server-side (404 oracle-free).
- Headers HTTP sécurité (CSP, X-Frame-Options, nosniff, Referrer-Policy).
- Rate-limit sur endpoints critiques (login, register, portail, exports).
- Logs d'audit horodatés + purge auto 1 an.
- Path traversal protection sur file serving.
- Anti-énumération sur portail login + register.

À renforcer (cf. SECURITE-CONFORMITE.md §5.3) :
- Sanitization signature email (DOMPurify).
- Encryption at-rest applicative des uploads (déléguée NAS Encrypted
  Shared Folder en v2.8).
- DPO formel si commercialisation.

## 8. Contact

Bailleur exploitant : voir [Mentions légales](../mentions-legales) +
[Politique de confidentialité](../politique-confidentialite) du
bailleur concerné.

CNIL : 3 Place de Fontenoy, 75007 Paris — https://www.cnil.fr —
plaintes : https://www.cnil.fr/fr/plaintes
