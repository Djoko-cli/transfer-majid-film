-- AlterTable
ALTER TABLE "ReverseShare" DROP COLUMN "simplified";
ALTER TABLE "ReverseShare" ADD COLUMN "description" TEXT;
ALTER TABLE "ReverseShare" ADD COLUMN "password" TEXT;
ALTER TABLE "ReverseShare" ADD COLUMN "maxViews" INTEGER;
