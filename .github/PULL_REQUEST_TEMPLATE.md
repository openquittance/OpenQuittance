<!-- Merci pour votre contribution à OpenQuittance ! -->

## Description

Que fait cette PR ? Quel problème résout-elle ?

## Issues liées

Closes #
Refs #

## Type de changement

- [ ] 🐛 Bugfix (correction sans changement de comportement public)
- [ ] ✨ Feature (nouvelle fonctionnalité backward-compatible)
- [ ] 💥 Breaking change (modifie l'API / le schéma DB / la conf)
- [ ] 📝 Doc only (README / docs/ / commentaires)
- [ ] 🔧 Refactor / perf (sans changement de comportement)
- [ ] 🧪 Tests / CI

## Tests

- [ ] J'ai ajouté / mis à jour les tests pour cette modification
- [ ] `npx tsc --noEmit` passe
- [ ] `npm run build` passe
- [ ] Tests existants OK : `npx tsx tests/<suite>.test.mts`

## Checklist

- [ ] Mon code suit les conventions du projet (TypeScript strict,
      Zod sur entrées API, pas de `any`, pas de `dangerouslySetInnerHTML`
      sans sanitize)
- [ ] J'ai mis à jour la doc concernée (README / docs/ / commentaires)
- [ ] Pas de secret / clé / PII commit (vérifié avec `git diff`)
- [ ] Si schema Prisma modifié : migration fournie + commentaire
- [ ] Commit message en [Conventional Commits](https://www.conventionalcommits.org)
      (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`)
- [ ] Pour breaking change : section "Migration" ajoutée au CHANGELOG.md

## Screenshots / GIF

(si UI changée)

## Notes additionnelles

Trade-offs, alternatives explorées, points à challenger en review.
