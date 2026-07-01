-- CreateTable
CREATE TABLE "QianfanSendJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT,
    "source" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "shopTitle" TEXT NOT NULL,
    "buyerNick" TEXT NOT NULL,
    "appCid" TEXT NOT NULL,
    "receiverAppUidsJson" TEXT NOT NULL DEFAULT '[]',
    "replyId" INTEGER,
    "text" TEXT,
    "mediaId" TEXT,
    "imageUrl" TEXT,
    "imageLocalPath" TEXT,
    "targetLockJson" TEXT NOT NULL,
    "payloadSummaryJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "ackMsgId" TEXT,
    "qianfanMsgId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "nextRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "finishedAt" DATETIME
);

CREATE TABLE "QianfanSendAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestJson" TEXT NOT NULL DEFAULT '{}',
    "responseJson" TEXT NOT NULL DEFAULT '{}',
    "ackJson" TEXT NOT NULL DEFAULT '{}',
    "logJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "QianfanSendAttempt_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "QianfanSendJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OrderFinanceAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "orderNo" TEXT,
    "logisticsNo" TEXT,
    "trackingNo" TEXT,
    "buyerName" TEXT,
    "buyerPhone" TEXT,
    "type" TEXT NOT NULL,
    "amount" REAL,
    "title" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "externalId" TEXT,
    "rawJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "handledAt" DATETIME
);

CREATE UNIQUE INDEX "QianfanSendJob_taskId_key" ON "QianfanSendJob"("taskId");
CREATE INDEX "QianfanSendJob_status_idx" ON "QianfanSendJob"("status");
CREATE INDEX "QianfanSendJob_createdAt_idx" ON "QianfanSendJob"("createdAt");
CREATE INDEX "QianfanSendJob_buyerNick_idx" ON "QianfanSendJob"("buyerNick");
CREATE INDEX "QianfanSendAttempt_jobId_idx" ON "QianfanSendAttempt"("jobId");
CREATE INDEX "OrderFinanceAlert_orderNo_idx" ON "OrderFinanceAlert"("orderNo");
CREATE INDEX "OrderFinanceAlert_logisticsNo_idx" ON "OrderFinanceAlert"("logisticsNo");
CREATE INDEX "OrderFinanceAlert_trackingNo_idx" ON "OrderFinanceAlert"("trackingNo");
CREATE INDEX "OrderFinanceAlert_buyerPhone_idx" ON "OrderFinanceAlert"("buyerPhone");
CREATE INDEX "OrderFinanceAlert_status_idx" ON "OrderFinanceAlert"("status");
