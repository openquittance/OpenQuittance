# FAQ — OpenQuittance

Questions fréquentes. Si tu cherches comment faire X, voir
[USER-GUIDE.md](USER-GUIDE.md).

## Général

### À qui s'adresse OpenQuittance ?

Bailleurs particuliers, SCI familiales, petites foncières,
indivisions, qui veulent générer leurs quittances de loyer
conformes loi 89-462 sans passer par un SaaS tiers.

Tu garde tes données chez toi, sur ton serveur (NAS Synology,
VPS Linux, Raspberry Pi, etc.).

### Pourquoi auto-héberger plutôt que SaaS ?

- **Souveraineté** : tes données dans ta machine, pas dans un
  cloud tiers (US Patriot Act, RGPD, etc.).
- **Pas d'abonnement** : licence MIT, gratuit à perpétuité.
- **Pas de limite** : pas de quotas (locataires / quittances /
  bailleurs).
- **Personnalisable** : c'est open source, tu peux forker.

Contrepartie : tu gère ton install, tes backups, tes mises à
jour. Il faut être un peu technique (ou avoir un proche qui
l'est).

### Y a-t-il une offre managée ?

**Non, pas pour l'instant.** Projet 100% self-hosted. Si la
demande existe, un service managé pourrait voir le jour
ultérieurement, mais ce n'est pas prévu en v3.x.

### Combien de bailleurs / locataires par instance ?

**Illimité.** Pas de hard limit côté app. Postgres encaisse
facilement 100k+ rows par table. Tests internes ont validé
jusqu'à ~50 bailleurs, ~500 locataires, ~10000 quittances sur
un NAS Synology DS220+ (4 Go RAM).

## Install + déploiement

### Puis-je auto-héberger sans Synology ?

Oui. Le déploiement est **Docker Compose** standard. Marche
sur :

- **NAS Synology / QNAP** (recommandé pour bailleurs particuliers).
- **VPS Linux** (Hetzner, OVH, Scaleway, DigitalOcean) — 2 Go RAM
  suffisent.
- **Raspberry Pi 4/5** (8 Go RAM recommandé).
- **Home server** (mini PC, vieux laptop, etc.).
- **Cloud Kubernetes** si tu sais ce que tu fais (Helm chart pas
  fourni, à composer).

Voir [INSTALL.md](INSTALL.md) pour les pré-requis.

### Quels OS sont supportés côté serveur ?

Linux (toutes distros récentes), macOS, Windows (via WSL2). Le
critère unique : Docker + Docker Compose qui tournent.

### Quels navigateurs côté utilisateur ?

Les 2 dernières versions stables de :
- Chrome / Edge / Brave (Chromium)
- Firefox
- Safari (iOS + macOS)

Pas testé sur IE / vieux Safari. Mobile-first depuis v3.6 :
fonctionne sur smartphone récent. App installable PWA (Add to
Home Screen).

### Puis-je utiliser sans Google ?

**Oui.** Google n'est utilisé que pour 2 features optionnelles :
- Email d'envoi des quittances → alternative SMTP (OVH, Mailgun,
  SendGrid, ton propre serveur Postfix, etc.).
- Backup cloud Drive → alternative S3-compatible (AWS S3, MinIO
  auto-hébergé, Backblaze B2, Wasabi).

Auth : email/password local. Google OAuth est optionnel.

## Données + sécurité

### L'app est-elle conforme RGPD ?

**Oui par défaut.** Détails dans [RGPD.md](RGPD.md) et
[SECURITE-CONFORMITE.md](SECURITE-CONFORMITE.md). Highlights :

- Données en France (si tu héberge en France ou EU).
- Chiffrement AES-256-GCM des uploads.
- Pages /mentions-legales et /politique-confidentialite générées
  automatiquement par bailleur (LCEN art. 6 + RGPD art. 13).
- Export RGPD par locataire (art. 20 portabilité) → ZIP avec
  toutes ses données.
- Suppression sur demande (cascade clean).
- Audit log (qui a fait quoi, quand).
- Aucun tracking tiers, aucun analytics, aucun pixel marketing.

Tu reste **responsable du traitement** au sens RGPD. Si tu
commercialises (revenu locatif > 23k€/an = activité pro selon
DGFiP), remplis l'onglet "Légal" du bailleur.

### Que se passe-t-il si je perds ma passphrase de backup ?

**Mauvaise nouvelle** : les fichiers `.env.enc` chiffrés sur
ton cloud backup sont définitivement **inutilisables**. Sans
passphrase, AES-256-GCM ne se cracke pas.

**Bonne nouvelle** : le reste du backup (dump SQL + uploads
chiffrés app-level) est récupérable si tu as encore :
- La clé `UPLOADS_ENCRYPTION_KEY` (dans ton `.env` local).
- Les commandes pour restaurer le SQL.

Workflow de récupération :
1. Re-créer une instance from scratch (`npm run setup`).
2. Restaurer le `pg_dump` manuellement.
3. Copier les uploads chiffrés dans `./uploads/`.
4. Mettre ta `UPLOADS_ENCRYPTION_KEY` originale dans le nouveau
   `.env`.

**Conseil** : stocke ta passphrase dans un password manager
(Bitwarden, 1Password, KeePass). Pas dans un post-it sur
l'écran.

### Que se passe-t-il si je perds `UPLOADS_ENCRYPTION_KEY` ?

Les uploads (logos, signatures, archives) sont définitivement
inaccessibles. Les données SQL (bailleurs, locataires, quittances
metadata) restent disponibles.

**Conseil** : sauvegarde ton `.env` complet dans le password
manager.

### Que se passe-t-il si je perds mon mot de passe admin ?

Pas de reset email auto en v3.7 (pas de SMTP côté app pour les
auth-reset, par design simplicité). Récupération manuelle :

```bash
docker compose exec app npx tsx scripts/reset-password.mjs <email>
```

(Le script demande une confirmation, regénère un mot de passe
temporaire affiché en console.)

### Comment supprimer définitivement un locataire ?

Soft delete : flag `actif=false` (conserve l'historique des
quittances pour comptabilité). Recommandé.

Hard delete : `DELETE /api/locataires/[id]` → cascade quittances,
archives, tokens portail. Confirmation requise côté UI. **À
réserver aux erreurs de saisie, pas aux fins de bail normales.**

## Fonctionnalités

### Puis-je traduire en anglais ?

**Pas en v3.7.** L'app est française only (textes UI, PDFs,
emails templates, dates au format FR). L'i18n est en
[roadmap future](ROADMAP-FUTURE.md) si demande communautaire.

Si tu veux contribuer une traduction : on extraira d'abord les
textes vers des fichiers JSON i18n, puis tu pourras envoyer une
PR. Pas urgent.

### Puis-je personnaliser les PDFs ?

Limité en v3.7 :
- Logo + signature + couleur d'accent (paramètres bailleur).
- Pas de templating Mustache/Handlebars custom.

Si tu veux du contrôle total : fork + édite
`src/lib/pdf/quittance.ts`. Le code PDFKit est lisible (~200
lignes).

### Puis-je personnaliser les emails ?

Oui : **Paramètres → Email → Onglet Template**. Variables
disponibles : `{{prenom}}`, `{{nom}}`, `{{moisLabel}}`, `{{annee}}`,
`{{montantTotal}}`, etc. Sujet + corps modifiables.

### Le portail locataire est-il obligatoire ?

**Non.** Tu peux gérer entièrement sans portail : générer +
envoyer PDFs par email. Le portail est optionnel par locataire
(activer / désactiver à tout moment).

### Y a-t-il une appli mobile native ?

**PWA** (Progressive Web App). Installable sur iOS + Android via
le menu "Ajouter à l'écran d'accueil". Pas d'appli native iOS/
Android dans les stores — coût + maintenance trop élevés pour un
projet OSS.

## Contribution + support

### Comment contribuer ?

Voir [CONTRIBUTING.md](../CONTRIBUTING.md). TL;DR :
- Bug : ouvre une issue avec étapes de reproduction.
- Feature : ouvre une discussion d'abord pour valider scope.
- Code : fork → branche → PR. Tests requis.

### Y a-t-il un canal Discord / Slack ?

Pas pour l'instant. Discussions sur GitHub Issues + GitHub
Discussions. Si la communauté grandit, un Discord pourra être
créé.

### Le projet est-il maintenu ?

Oui, activement (cf. CHANGELOG.md). Mainteneur principal :
solo dev OSS sur temps perso. Pas de SLA officielle.

### Je trouve un CVE / vulnérabilité, je fais quoi ?

**Ne pas ouvrir d'issue publique.** Envoie un email à l'adresse
indiquée dans [SECURITY.md](../SECURITY.md). Disclosure
coordonnée.

## Roadmap

### Quelles features sont prévues ?

Voir [ROADMAP-FUTURE.md](ROADMAP-FUTURE.md). Indicatif :
- Phase 7 : Docker Hub auto-build (CI/CD).
- Phase 8 : i18n (anglais d'abord).
- Phase 9 : États des lieux numériques (signature électronique).
- Phase 10 : Comptabilité IFRS / liasse fiscale (form 2044).

Pas d'ETA fixe — projet OSS bénévole.

### Une feature X serait géniale, vous la faites ?

Ouvre une [Discussion GitHub](https://github.com/openquittance/OpenQuittance/discussions)
pour proposer. Si plusieurs users la demandent, elle remontera
dans la roadmap.

Si tu peux la coder toi-même : PR welcomes !
