# Politique de sécurité — OpenQuittance

OpenQuittance suit les principes de **divulgation responsable**
(responsible disclosure). Les vulnérabilités signalées en privé sont
traitées avant publication d'advisory, pour protéger les
déploiements actifs.

## Versions supportées

| Version | Support sécurité |
|---------|------------------|
| 3.x     | ✅ active        |
| 2.9.x   | ✅ patches critiques (jusqu'à 2026-12) |
| < 2.9   | ❌ non supporté  |

OpenQuittance suit le semver. Patches sécurité sur la branche
courante + dernière minor de la précédente major.

## Signaler une vulnérabilité

**NE PAS ouvrir d'issue publique pour une vulnérabilité.** Cela
exposerait la faille à tous les déploiements existants avant que le
patch soit disponible.

### Canal préféré : GitHub Security Advisory privée

Ouvrir une advisory privée sur le repo :
<https://github.com/grx14/quittances-app/security/advisories/new>

GitHub chiffre le contenu et limite la visibilité aux mainteneurs.

### Email de fallback

Si vous ne pouvez pas utiliser GitHub Security Advisory :

`security@openquittance.example` *(à remplacer post-publication par
l'email réel du mainteneur)*

Chiffrer si possible avec la clé PGP publique (à venir).

## Que mettre dans le rapport

- Description de la vulnérabilité (type : XSS, CSRF, RCE, escalation
  de privilèges, etc.)
- Étapes pour reproduire (PoC code-level)
- Impact potentiel (fuite de données, prise de contrôle, etc.)
- Versions affectées
- Mitigation / workaround si vous en avez identifié
- Vos coordonnées si vous voulez être crédité dans la security
  advisory publique post-fix

## Réponse

| Étape | Délai cible |
|-------|-------------|
| Accusé de réception | **48 h** |
| Triage initial (severity) | 5 jours |
| Patch + advisory rédigé | dépend de la sévérité (critical = 7-14j, low = 30-60j) |
| Publication advisory + release patch | coordonné avec le rapporteur |

Pour une vulnérabilité critique exploitée activement, contact direct
mainteneur + release dans les 24-48h.

## Périmètre

**Inclus** :

- Code applicatif Next.js / API routes / lib helpers
- Scripts (setup, rotate-uploads-key, bootstrap, migrations Prisma)
- Configuration Docker / docker-compose fournie
- Documentation pouvant induire en erreur (instructions dangereuses)

**Hors périmètre** :

- Vulnérabilités dans les dépendances tierces (signaler en amont)
- Configurations user-side (ex. reverse proxy mal configuré)
- Vulnérabilités nécessitant un accès root au serveur
- Brute-force / DoS (sauf si l'app n'a aucune protection)
- Self-XSS sur saisies admin own-account (pas de victime tierce)

## Conformité RGPD

Pour les violations de données personnelles côté **bailleur exploitant
une instance** (ex. fuite de données de locataires), la procédure
RGPD art. 33-34 est documentée dans [docs/RGPD.md](../docs/RGPD.md).

OpenQuittance en tant que projet open source n'est pas responsable
de traitement RGPD — chaque opérateur d'instance l'est pour ses
propres locataires.

## Reconnaissance

Les rapporteurs ayant agi de bonne foi seront crédités dans la
security advisory publique (GitHub Hall of Fame), sauf demande
contraire.
