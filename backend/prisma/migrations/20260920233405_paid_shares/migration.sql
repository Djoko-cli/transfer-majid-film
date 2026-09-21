-- AlterTable
ALTER TABLE "Share" ADD COLUMN "priceCents" INTEGER;

-- CreateTable
CREATE TABLE "SharePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareId" TEXT,
    "shareName" TEXT,
    "email" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'EMAIL',
    "sellerId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "paidAt" DATETIME NOT NULL,
    "accessUntil" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "SharePayment_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SharePayment_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SharePayment_stripeCheckoutSessionId_key" ON "SharePayment"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "SharePayment_shareId_email_idx" ON "SharePayment"("shareId", "email");
