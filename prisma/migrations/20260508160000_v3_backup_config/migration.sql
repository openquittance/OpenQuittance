-- AlterTable
ALTER TABLE "AppConfig"
  ADD COLUMN "instanceId"             TEXT,
  ADD COLUMN "backupEnabled"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "backupS3Endpoint"       TEXT,
  ADD COLUMN "backupS3Region"         TEXT,
  ADD COLUMN "backupS3Bucket"         TEXT,
  ADD COLUMN "backupS3ForcePathStyle" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "backupS3AccessKeyId"    TEXT,
  ADD COLUMN "backupS3SecretKey"      TEXT,
  ADD COLUMN "backupSchedule"         TEXT,
  ADD COLUMN "backupRetentionDays"    INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "backupEnvPassphrase"    TEXT,
  ADD COLUMN "backupNotifySuccess"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "backupLastRunAt"        TIMESTAMP(3),
  ADD COLUMN "backupLastStatus"       TEXT,
  ADD COLUMN "backupLastError"        TEXT;

-- CreateTable
CREATE TABLE "BackupRun" (
    "id"             TEXT NOT NULL,
    "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"     TIMESTAMP(3),
    "status"         TEXT NOT NULL,
    "sizeBytes"      BIGINT,
    "errorMessage"   TEXT,
    "manifestS3Key"  TEXT,
    "bailleursCount" INTEGER,
    "zipsCount"      INTEGER,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupRun_startedAt_idx" ON "BackupRun"("startedAt");
