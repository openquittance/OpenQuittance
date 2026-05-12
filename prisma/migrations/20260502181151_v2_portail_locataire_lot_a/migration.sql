-- AlterEnum
ALTER TYPE "AppRole" ADD VALUE 'TENANT';

-- AlterTable
ALTER TABLE "Locataire" ADD COLUMN     "portailActiveLe" TIMESTAMP(3),
ADD COLUMN     "tenantUserId" TEXT;

-- CreateTable
CREATE TABLE "PortailMagicLink" (
    "id" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortailMagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortailMagicLink_tokenHash_key" ON "PortailMagicLink"("tokenHash");

-- CreateIndex
CREATE INDEX "PortailMagicLink_tenantUserId_expiresAt_idx" ON "PortailMagicLink"("tenantUserId", "expiresAt");

-- CreateIndex
CREATE INDEX "Locataire_tenantUserId_idx" ON "Locataire"("tenantUserId");

-- AddForeignKey
ALTER TABLE "PortailMagicLink" ADD CONSTRAINT "PortailMagicLink_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Locataire" ADD CONSTRAINT "Locataire_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
