-- CreateTable
CREATE TABLE "DisabledBrandSlide" (
    "slug" TEXT NOT NULL,
    "still" INTEGER NOT NULL,
    "disabledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("slug", "still")
);
