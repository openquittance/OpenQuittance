-- CreateTable
CREATE TABLE "EarlyAccessSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarlyAccessSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EarlyAccessSubscriber_email_key" ON "EarlyAccessSubscriber"("email");

-- CreateIndex
CREATE INDEX "EarlyAccessSubscriber_createdAt_idx" ON "EarlyAccessSubscriber"("createdAt");
