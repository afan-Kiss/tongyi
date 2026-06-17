-- AlterTable
ALTER TABLE "Bracelet" ADD COLUMN "barcodeValue" TEXT;

-- CreateIndex
CREATE INDEX "Bracelet_barcodeValue_idx" ON "Bracelet"("barcodeValue");
