-- AlterTable
ALTER TABLE "AppConfig"
  ADD COLUMN "backupStorageType"       TEXT DEFAULT 's3',
  ADD COLUMN "backupDriveFolderId"     TEXT,
  ADD COLUMN "backupDriveRefreshToken" TEXT,
  ADD COLUMN "backupDriveAccountEmail" TEXT;
