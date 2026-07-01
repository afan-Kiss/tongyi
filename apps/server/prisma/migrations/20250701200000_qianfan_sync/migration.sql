-- CreateTable
CREATE TABLE "QianfanShopAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopName" TEXT NOT NULL,
    "shopTitle" TEXT,
    "appCid" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'xiaohongshu',
    "status" TEXT NOT NULL DEFAULT 'active',
    "cookieStatus" TEXT NOT NULL DEFAULT 'unknown',
    "lastCookieAt" DATETIME,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "QianfanSyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "cursorJson" TEXT NOT NULL DEFAULT '{}',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QianfanSyncJob_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "QianfanShopAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QianfanRawOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "externalOrderId" TEXT,
    "buyerName" TEXT,
    "buyerPhoneMasked" TEXT,
    "productTitle" TEXT,
    "skuTitle" TEXT,
    "payAmount" REAL NOT NULL DEFAULT 0,
    "validAmount" REAL NOT NULL DEFAULT 0,
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "orderStatus" TEXT,
    "afterSaleStatus" TEXT,
    "paidAt" DATETIME,
    "createdAtFromPlatform" DATETIME,
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QianfanRawOrder_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "QianfanShopAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QianfanRawAfterSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "orderNo" TEXT,
    "afterSaleNo" TEXT NOT NULL,
    "afterSaleType" TEXT,
    "status" TEXT,
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "reason" TEXT,
    "createdAtFromPlatform" DATETIME,
    "updatedAtFromPlatform" DATETIME,
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QianfanRawAfterSale_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "QianfanShopAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QianfanRawLiveSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "sessionNo" TEXT NOT NULL,
    "title" TEXT,
    "anchorName" TEXT,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "grossSalesAmount" REAL NOT NULL DEFAULT 0,
    "validSalesAmount" REAL NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "refundAmount" REAL NOT NULL DEFAULT 0,
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QianfanRawLiveSession_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "QianfanShopAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QianfanRawReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "orderNo" TEXT,
    "reviewId" TEXT NOT NULL,
    "buyerName" TEXT,
    "score" REAL,
    "content" TEXT,
    "reviewTime" DATETIME,
    "replyStatus" TEXT,
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QianfanRawReview_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "QianfanShopAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QianfanShopScoreSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT NOT NULL,
    "score" REAL,
    "serviceScore" REAL,
    "logisticsScore" REAL,
    "productScore" REAL,
    "reviewCount" INTEGER,
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QianfanShopScoreSnapshot_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "QianfanShopAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QianfanSyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shopId" TEXT,
    "syncJobId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QianfanSyncLog_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "QianfanShopAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QianfanSyncLog_syncJobId_fkey" FOREIGN KEY ("syncJobId") REFERENCES "QianfanSyncJob" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "QianfanShopAccount_shopName_key" ON "QianfanShopAccount"("shopName");
CREATE INDEX "QianfanShopAccount_status_idx" ON "QianfanShopAccount"("status");
CREATE INDEX "QianfanShopAccount_cookieStatus_idx" ON "QianfanShopAccount"("cookieStatus");

CREATE INDEX "QianfanSyncJob_shopId_idx" ON "QianfanSyncJob"("shopId");
CREATE INDEX "QianfanSyncJob_syncType_idx" ON "QianfanSyncJob"("syncType");
CREATE INDEX "QianfanSyncJob_status_idx" ON "QianfanSyncJob"("status");
CREATE INDEX "QianfanSyncJob_createdAt_idx" ON "QianfanSyncJob"("createdAt");

CREATE UNIQUE INDEX "QianfanRawOrder_shopId_orderNo_key" ON "QianfanRawOrder"("shopId", "orderNo");
CREATE INDEX "QianfanRawOrder_shopId_idx" ON "QianfanRawOrder"("shopId");
CREATE INDEX "QianfanRawOrder_orderNo_idx" ON "QianfanRawOrder"("orderNo");
CREATE INDEX "QianfanRawOrder_paidAt_idx" ON "QianfanRawOrder"("paidAt");
CREATE INDEX "QianfanRawOrder_syncedAt_idx" ON "QianfanRawOrder"("syncedAt");

CREATE UNIQUE INDEX "QianfanRawAfterSale_shopId_afterSaleNo_key" ON "QianfanRawAfterSale"("shopId", "afterSaleNo");
CREATE INDEX "QianfanRawAfterSale_shopId_idx" ON "QianfanRawAfterSale"("shopId");
CREATE INDEX "QianfanRawAfterSale_orderNo_idx" ON "QianfanRawAfterSale"("orderNo");
CREATE INDEX "QianfanRawAfterSale_syncedAt_idx" ON "QianfanRawAfterSale"("syncedAt");

CREATE UNIQUE INDEX "QianfanRawLiveSession_shopId_sessionNo_key" ON "QianfanRawLiveSession"("shopId", "sessionNo");
CREATE INDEX "QianfanRawLiveSession_shopId_idx" ON "QianfanRawLiveSession"("shopId");
CREATE INDEX "QianfanRawLiveSession_startedAt_idx" ON "QianfanRawLiveSession"("startedAt");
CREATE INDEX "QianfanRawLiveSession_syncedAt_idx" ON "QianfanRawLiveSession"("syncedAt");

CREATE UNIQUE INDEX "QianfanRawReview_shopId_reviewId_key" ON "QianfanRawReview"("shopId", "reviewId");
CREATE INDEX "QianfanRawReview_shopId_idx" ON "QianfanRawReview"("shopId");
CREATE INDEX "QianfanRawReview_orderNo_idx" ON "QianfanRawReview"("orderNo");
CREATE INDEX "QianfanRawReview_reviewTime_idx" ON "QianfanRawReview"("reviewTime");

CREATE INDEX "QianfanShopScoreSnapshot_shopId_idx" ON "QianfanShopScoreSnapshot"("shopId");
CREATE INDEX "QianfanShopScoreSnapshot_capturedAt_idx" ON "QianfanShopScoreSnapshot"("capturedAt");

CREATE INDEX "QianfanSyncLog_shopId_idx" ON "QianfanSyncLog"("shopId");
CREATE INDEX "QianfanSyncLog_syncJobId_idx" ON "QianfanSyncLog"("syncJobId");
CREATE INDEX "QianfanSyncLog_createdAt_idx" ON "QianfanSyncLog"("createdAt");
