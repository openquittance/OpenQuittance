-- CreateTable
CREATE TABLE "BailleurMembership" (
    "userId" TEXT NOT NULL,
    "bailleurId" TEXT NOT NULL,
    "role" "AppRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BailleurMembership_pkey" PRIMARY KEY ("userId","bailleurId")
);

-- CreateIndex
CREATE INDEX "BailleurMembership_userId_idx" ON "BailleurMembership"("userId");

-- CreateIndex
CREATE INDEX "BailleurMembership_bailleurId_idx" ON "BailleurMembership"("bailleurId");

-- AddForeignKey
ALTER TABLE "BailleurMembership" ADD CONSTRAINT "BailleurMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BailleurMembership" ADD CONSTRAINT "BailleurMembership_bailleurId_fkey" FOREIGN KEY ("bailleurId") REFERENCES "Bailleur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
