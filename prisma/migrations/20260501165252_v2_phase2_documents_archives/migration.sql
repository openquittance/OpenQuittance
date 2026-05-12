-- AlterTable
ALTER TABLE "Locataire" ADD COLUMN     "montantDepotGarantie" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Archive" (
    "id" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "category" TEXT,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Archive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Archive_ownerType_ownerId_idx" ON "Archive"("ownerType", "ownerId");

-- AddForeignKey
ALTER TABLE "Archive" ADD CONSTRAINT "Archive_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
