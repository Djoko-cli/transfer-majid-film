-- AlterTable
ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "pendingEmailToken" TEXT;
ALTER TABLE "User" ADD COLUMN "pendingEmailTokenExpiresAt" DATETIME;
-- CreateIndex
CREATE UNIQUE INDEX "User_pendingEmailToken_key" ON "User"("pendingEmailToken");
