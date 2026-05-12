-- AlterTable
ALTER TABLE "AppConfig" ADD COLUMN     "inseeApiKey" TEXT,
ADD COLUMN     "inseeApiSecret" TEXT,
ADD COLUMN     "inseeLastSyncAt" TIMESTAMP(3);
