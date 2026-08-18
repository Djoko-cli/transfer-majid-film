-- CreateTable
CREATE TABLE "AnonymousShareVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE INDEX "AnonymousShareVerification_email_idx" ON "AnonymousShareVerification"("email");
