-- CreateTable
CREATE TABLE "AnchorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionNo" TEXT NOT NULL,
    "title" TEXT,
    "anchorName" TEXT NOT NULL,
    "anchorProfileId" TEXT,
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "platform" TEXT NOT NULL DEFAULT 'xiaohongshu',
    "grossSalesAmount" REAL NOT NULL DEFAULT 0,
    "validSalesAmount" REAL NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "refundCount" INTEGER NOT NULL DEFAULT 0,
    "afterSaleAmount" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LiveSession_anchorProfileId_fkey" FOREIGN KEY ("anchorProfileId") REFERENCES "AnchorProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "LiveOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "buyerName" TEXT,
    "productName" TEXT,
    "skuName" TEXT,
    "amount" REAL NOT NULL DEFAULT 0,
    "validAmount" REAL NOT NULL DEFAULT 0,
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "afterSaleStatus" TEXT,
    "paidAt" DATETIME,
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LiveOrder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LiveImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'csv',
    "filename" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

CREATE UNIQUE INDEX "AnchorProfile_name_key" ON "AnchorProfile"("name");
CREATE INDEX "AnchorProfile_status_idx" ON "AnchorProfile"("status");
CREATE UNIQUE INDEX "LiveSession_sessionNo_key" ON "LiveSession"("sessionNo");
CREATE INDEX "LiveSession_anchorName_idx" ON "LiveSession"("anchorName");
CREATE INDEX "LiveSession_startedAt_idx" ON "LiveSession"("startedAt");
CREATE INDEX "LiveSession_anchorProfileId_idx" ON "LiveSession"("anchorProfileId");
CREATE UNIQUE INDEX "LiveOrder_sessionId_orderNo_key" ON "LiveOrder"("sessionId", "orderNo");
CREATE INDEX "LiveOrder_sessionId_idx" ON "LiveOrder"("sessionId");
CREATE INDEX "LiveOrder_orderNo_idx" ON "LiveOrder"("orderNo");
CREATE INDEX "LiveOrder_productName_idx" ON "LiveOrder"("productName");
CREATE INDEX "LiveImportBatch_status_idx" ON "LiveImportBatch"("status");
CREATE INDEX "LiveImportBatch_createdAt_idx" ON "LiveImportBatch"("createdAt");
