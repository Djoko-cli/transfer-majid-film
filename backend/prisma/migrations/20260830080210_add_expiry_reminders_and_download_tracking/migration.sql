-- AlterTable
ALTER TABLE "Share" ADD COLUMN "expiryReminderSentAt" DATETIME;

-- AlterTable
ALTER TABLE "ShareRecipient" ADD COLUMN "downloadedAt" DATETIME;
ALTER TABLE "ShareRecipient" ADD COLUMN "expiryReminderSentAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "ldapDN" TEXT,
    "shareSizeLimit" TEXT,
    "storageQuotaLimit" TEXT,
    "canCreatePermanentShares" BOOLEAN NOT NULL DEFAULT false,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpVerified" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "isActivated" BOOLEAN NOT NULL DEFAULT true,
    "activationToken" TEXT,
    "activationTokenExpiresAt" DATETIME,
    "activationAttempts" INTEGER NOT NULL DEFAULT 0,
    "notifyOnExpiringSentShares" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_User" ("activationAttempts", "activationToken", "activationTokenExpiresAt", "canCreatePermanentShares", "createdAt", "email", "id", "isActivated", "isAdmin", "ldapDN", "password", "shareSizeLimit", "storageQuotaLimit", "totpEnabled", "totpSecret", "totpVerified", "updatedAt", "username") SELECT "activationAttempts", "activationToken", "activationTokenExpiresAt", "canCreatePermanentShares", "createdAt", "email", "id", "isActivated", "isAdmin", "ldapDN", "password", "shareSizeLimit", "storageQuotaLimit", "totpEnabled", "totpSecret", "totpVerified", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_ldapDN_key" ON "User"("ldapDN");
CREATE UNIQUE INDEX "User_activationToken_key" ON "User"("activationToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
