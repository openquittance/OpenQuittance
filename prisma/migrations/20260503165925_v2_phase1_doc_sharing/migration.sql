-- AlterTable
ALTER TABLE "Archive" ADD COLUMN     "visibleLocataire" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Locataire" ADD COLUMN     "partageBail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "partageEtatDesLieux" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "partageQuittances" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "portailActif" BOOLEAN NOT NULL DEFAULT false;

-- Data migration : restore portailActif=true pour les locataires déjà
-- invités au portail pré-Phase 1 (tenantUserId set ET portailActiveLe non null).
UPDATE "Locataire"
   SET "portailActif" = true
 WHERE "tenantUserId" IS NOT NULL
   AND "portailActiveLe" IS NOT NULL;

-- Normalisation catégorie : 'contrat' (libre, pré-Phase 1) → 'bail' (canonique).
-- L'API accepte les deux en lecture pour compat rétro avec d'éventuels
-- imports tiers, mais l'UI émet toujours 'bail'.
UPDATE "Archive" SET "category" = 'bail' WHERE "category" = 'contrat';
