-- CreateTable
CREATE TABLE "ShareContribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "email" TEXT,
    "userId" TEXT,
    "completedAt" DATETIME,
    "shareId" TEXT NOT NULL,
    CONSTRAINT "ShareContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ShareContribution_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_File" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "thumbnailStatus" TEXT,
    "shareId" TEXT NOT NULL,
    "contributionId" TEXT,
    CONSTRAINT "File_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "File_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "ShareContribution" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_File" ("createdAt", "id", "name", "shareId", "size", "thumbnailStatus") SELECT "createdAt", "id", "name", "shareId", "size", "thumbnailStatus" FROM "File";
DROP TABLE "File";
ALTER TABLE "new_File" RENAME TO "File";
CREATE TABLE "new_ReverseShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token" TEXT NOT NULL,
    "maxShareSize" TEXT NOT NULL,
    "sendEmailNotification" BOOLEAN NOT NULL,
    "remainingUses" INTEGER NOT NULL,
    "publicAccess" BOOLEAN NOT NULL DEFAULT true,
    "containerShareId" TEXT NOT NULL,
    "collectionEndsAt" DATETIME NOT NULL,
    "retentionSeconds" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "password" TEXT,
    "maxViews" INTEGER,
    "creatorId" TEXT NOT NULL,
    CONSTRAINT "ReverseShare_containerShareId_fkey" FOREIGN KEY ("containerShareId") REFERENCES "Share" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReverseShare_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ReverseShare" ("createdAt", "creatorId", "description", "id", "maxShareSize", "maxViews", "name", "password", "publicAccess", "remainingUses", "sendEmailNotification", "token") SELECT "createdAt", "creatorId", "description", "id", "maxShareSize", "maxViews", "name", "password", "publicAccess", "remainingUses", "sendEmailNotification", "token" FROM "ReverseShare";
DROP TABLE "ReverseShare";
ALTER TABLE "new_ReverseShare" RENAME TO "ReverseShare";
CREATE UNIQUE INDEX "ReverseShare_token_key" ON "ReverseShare"("token");
CREATE UNIQUE INDEX "ReverseShare_containerShareId_key" ON "ReverseShare"("containerShareId");
CREATE TABLE "new_Share" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    "name" TEXT,
    "uploadLocked" BOOLEAN NOT NULL DEFAULT false,
    "isZipReady" BOOLEAN NOT NULL DEFAULT false,
    "views" INTEGER NOT NULL DEFAULT 0,
    "expiration" DATETIME NOT NULL,
    "description" TEXT,
    "removedReason" TEXT,
    "creatorId" TEXT,
    "senderEmail" TEXT,
    "expiryReminderSentAt" DATETIME,
    "hasNasImportedFiles" BOOLEAN NOT NULL DEFAULT false,
    "reverseShareId" TEXT,
    "isCollection" BOOLEAN NOT NULL DEFAULT false,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    CONSTRAINT "Share_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Share_reverseShareId_fkey" FOREIGN KEY ("reverseShareId") REFERENCES "ReverseShare" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Share" ("createdAt", "creatorId", "description", "expiration", "expiryReminderSentAt", "hasNasImportedFiles", "id", "isZipReady", "name", "removedReason", "reverseShareId", "senderEmail", "storageProvider", "updatedAt", "uploadLocked", "views") SELECT "createdAt", "creatorId", "description", "expiration", "expiryReminderSentAt", "hasNasImportedFiles", "id", "isZipReady", "name", "removedReason", "reverseShareId", "senderEmail", "storageProvider", "updatedAt", "uploadLocked", "views" FROM "Share";
DROP TABLE "Share";
ALTER TABLE "new_Share" RENAME TO "Share";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ShareContribution_shareId_createdAt_idx" ON "ShareContribution"("shareId", "createdAt");

