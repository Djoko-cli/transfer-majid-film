-- CreateTable
CREATE TABLE "ClamavScan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shareId" TEXT,
    "shareName" TEXT,
    "status" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "infectedCount" INTEGER NOT NULL DEFAULT 0,
    "infectedFileNames" TEXT,
    "errorMessage" TEXT
);

-- CreateIndex
CREATE INDEX "ClamavScan_createdAt_idx" ON "ClamavScan"("createdAt");
