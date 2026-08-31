-- CreateTable
CREATE TABLE "BrandProject" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BrandStill" (
    "slug" TEXT NOT NULL,
    "still" INTEGER NOT NULL,
    "widths" TEXT NOT NULL,

    PRIMARY KEY ("slug", "still"),
    CONSTRAINT "BrandStill_slug_fkey" FOREIGN KEY ("slug") REFERENCES "BrandProject" ("slug") ON DELETE CASCADE ON UPDATE CASCADE
);
