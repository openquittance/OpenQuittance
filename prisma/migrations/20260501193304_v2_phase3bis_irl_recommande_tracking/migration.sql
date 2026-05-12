-- AlterTable
ALTER TABLE "RevisionIRL" ADD COLUMN     "courrierArchiveId" TEXT,
ADD COLUMN     "preuveDepotArchiveId" TEXT,
ADD COLUMN     "recommandeEnvoyeLe" TIMESTAMP(3),
ADD COLUMN     "recommandeNumero" TEXT;
