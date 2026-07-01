-- AlterTable
ALTER TABLE "QianfanRawAfterSale" ADD COLUMN "handleStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "QianfanRawAfterSale" ADD COLUMN "handledAt" DATETIME;
ALTER TABLE "QianfanRawAfterSale" ADD COLUMN "note" TEXT;

-- AlterTable
ALTER TABLE "QianfanRawReview" ADD COLUMN "handleStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "QianfanRawReview" ADD COLUMN "handledAt" DATETIME;
ALTER TABLE "QianfanRawReview" ADD COLUMN "note" TEXT;

CREATE INDEX "QianfanRawAfterSale_handleStatus_idx" ON "QianfanRawAfterSale"("handleStatus");
CREATE INDEX "QianfanRawReview_handleStatus_idx" ON "QianfanRawReview"("handleStatus");
