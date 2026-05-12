-- AlterTable
ALTER TABLE "Locataire" ADD COLUMN     "dateRevisionAnnuelle" TIMESTAMP(3),
ADD COLUMN     "irlTrimestre" INTEGER,
ADD COLUMN     "irlValeurReference" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "IndiceIRL" (
    "id" TEXT NOT NULL,
    "periode" INTEGER NOT NULL,
    "annee" INTEGER NOT NULL,
    "trimestre" INTEGER NOT NULL,
    "valeur" DOUBLE PRECISION NOT NULL,
    "variation" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IndiceIRL_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionIRL" (
    "id" TEXT NOT NULL,
    "locataireId" TEXT NOT NULL,
    "dateEffet" DATE NOT NULL,
    "ancienLoyer" DOUBLE PRECISION NOT NULL,
    "nouveauLoyer" DOUBLE PRECISION NOT NULL,
    "irlReference" DOUBLE PRECISION NOT NULL,
    "irlNouveau" DOUBLE PRECISION NOT NULL,
    "trimestre" INTEGER NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'APPLIED',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevisionIRL_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IndiceIRL_periode_key" ON "IndiceIRL"("periode");

-- CreateIndex
CREATE INDEX "IndiceIRL_annee_trimestre_idx" ON "IndiceIRL"("annee", "trimestre");

-- CreateIndex
CREATE INDEX "RevisionIRL_locataireId_idx" ON "RevisionIRL"("locataireId");

-- AddForeignKey
ALTER TABLE "RevisionIRL" ADD CONSTRAINT "RevisionIRL_locataireId_fkey" FOREIGN KEY ("locataireId") REFERENCES "Locataire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
