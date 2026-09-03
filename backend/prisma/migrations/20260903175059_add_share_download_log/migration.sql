-- CreateTable
CREATE TABLE "ShareDownload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileName" TEXT,
    "recipientEmail" TEXT,
    "shareId" TEXT NOT NULL,
    CONSTRAINT "ShareDownload_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ShareDownload_shareId_createdAt_idx" ON "ShareDownload"("shareId", "createdAt");
