-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaSessionId" TEXT,
ADD COLUMN     "mfaVerifiedAt" TIMESTAMP(3);
