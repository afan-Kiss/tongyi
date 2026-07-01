-- AlterTable
ALTER TABLE "OrderFinanceAlert" ADD COLUMN "accountingRecordId" TEXT;

-- CreateTable
CREATE TABLE "AccountingRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordNo" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "businessType" TEXT NOT NULL DEFAULT 'normal',
    "amount" REAL NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "summary" TEXT,
    "remark" TEXT,
    "paySource" TEXT,
    "externalOrderNo" TEXT,
    "logisticsNo" TEXT,
    "trackingNo" TEXT,
    "buyerName" TEXT,
    "buyerPhone" TEXT,
    "braceletCode" TEXT,
    "certNo" TEXT,
    "reimbursementStatus" TEXT NOT NULL DEFAULT 'pending',
    "customerPaymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "legacyExpenseId" INTEGER,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "handledAt" DATETIME
);

CREATE TABLE "AccountingAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "localPath" TEXT NOT NULL,
    "thumbPath" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingAttachment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AccountingRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountingRecord_recordNo_key" ON "AccountingRecord"("recordNo");
CREATE INDEX "AccountingRecord_recordType_idx" ON "AccountingRecord"("recordType");
CREATE INDEX "AccountingRecord_externalOrderNo_idx" ON "AccountingRecord"("externalOrderNo");
CREATE INDEX "AccountingRecord_logisticsNo_idx" ON "AccountingRecord"("logisticsNo");
CREATE INDEX "AccountingRecord_trackingNo_idx" ON "AccountingRecord"("trackingNo");
CREATE INDEX "AccountingRecord_customerPaymentStatus_idx" ON "AccountingRecord"("customerPaymentStatus");
CREATE INDEX "AccountingRecord_occurredAt_idx" ON "AccountingRecord"("occurredAt");
CREATE INDEX "AccountingAttachment_recordId_idx" ON "AccountingAttachment"("recordId");
CREATE INDEX "OrderFinanceAlert_accountingRecordId_idx" ON "OrderFinanceAlert"("accountingRecordId");
