-- AlterTable
ALTER TABLE "Bien" ADD COLUMN     "annonceTexte" TEXT,
ADD COLUMN     "coverPhotoArchiveId" TEXT,
ADD COLUMN     "dpeClasse" TEXT,
ADD COLUMN     "dpeGes" DOUBLE PRECISION,
ADD COLUMN     "dpeKwh" DOUBLE PRECISION,
ADD COLUMN     "etage" INTEGER,
ADD COLUMN     "surface" DOUBLE PRECISION,
ADD COLUMN     "typeBien" TEXT;
