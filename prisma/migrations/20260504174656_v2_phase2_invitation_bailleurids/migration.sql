-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "bailleurIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Data migration : retro-fill bailleurIds depuis bailleurId existant
-- (Phase 2 Lot D — invitation multi-bailleur).
UPDATE "Invitation"
   SET "bailleurIds" = ARRAY["bailleurId"]
 WHERE "bailleurId" IS NOT NULL
   AND ("bailleurIds" IS NULL OR cardinality("bailleurIds") = 0);
