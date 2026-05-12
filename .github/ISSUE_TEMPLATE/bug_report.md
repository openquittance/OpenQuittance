---
name: 🐛 Bug report
about: Signaler un bug reproductible
title: "[BUG] "
labels: bug
assignees: ''
---

## Description du bug

Description claire et concise du problème.

## Étapes pour reproduire

1. Aller sur '...'
2. Cliquer sur '...'
3. Saisir '...'
4. Voir l'erreur

## Comportement attendu

Ce qui devrait se passer.

## Comportement observé

Ce qui se passe réellement (avec screenshots / logs si pertinent).

## Environnement

- **Version OpenQuittance** : (cf. `package.json` ou pied de page)
- **Mode déploiement** : Docker Compose / Synology Container Manager / VPS / autre
- **Navigateur** : Chrome 120 / Firefox 121 / Safari 17 / autre
- **OS** : macOS / Linux / Windows
- **Reverse proxy** : Cloudflare Tunnel / Nginx / Caddy / aucun

## Logs

Si applicable, joindre :

```
docker compose logs app | tail -50
```

## Contexte additionnel

Tout autre élément utile (config particulière, modification du code, etc.).

## Checklist

- [ ] J'ai cherché dans les issues existantes
- [ ] J'ai lu la [doc d'install](../../docs/INSTALL.md) et [d'upgrade](../../docs/UPGRADE.md)
- [ ] Je suis sur la dernière version
- [ ] Aucune donnée personnelle / secret n'est inclus dans ce rapport
