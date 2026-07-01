-- CreateTable
CREATE TABLE "AgentMachine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "machineCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "lastSeenAt" DATETIME,
    "version" TEXT,
    "ip" TEXT,
    "capabilities" TEXT NOT NULL DEFAULT '[]',
    "tokenHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "machineId" TEXT,
    "type" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "resultJson" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "AgentTask_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "AgentMachine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SystemModuleStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleKey" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "message" TEXT,
    "lastOkAt" DATETIME,
    "lastErrorAt" DATETIME,
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "QianfanRelayStatus" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "running" BOOLEAN NOT NULL DEFAULT false,
    "qianfanReady" BOOLEAN NOT NULL DEFAULT false,
    "listenerReady" BOOLEAN NOT NULL DEFAULT false,
    "wechatReady" BOOLEAN NOT NULL DEFAULT false,
    "attachedShopCount" INTEGER NOT NULL DEFAULT 0,
    "expectedShopCount" INTEGER NOT NULL DEFAULT 4,
    "lastBuyerMessageAt" DATETIME,
    "lastWechatNotifyAt" DATETIME,
    "lastWsFrameAt" DATETIME,
    "lastError" TEXT,
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "QianfanRelayMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "replyId" INTEGER,
    "shopName" TEXT,
    "buyerNick" TEXT,
    "appCid" TEXT,
    "receiverAppUidsJson" TEXT NOT NULL DEFAULT '[]',
    "text" TEXT,
    "source" TEXT,
    "notifyStatus" TEXT,
    "replyStatus" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" DATETIME,
    "repliedAt" DATETIME
);

-- CreateTable
CREATE TABLE "UploadedMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bizType" TEXT,
    "bizId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "url" TEXT,
    "localPath" TEXT,
    "size" INTEGER NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "uploadedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentMachine_machineCode_key" ON "AgentMachine"("machineCode");

-- CreateIndex
CREATE INDEX "AgentMachine_status_idx" ON "AgentMachine"("status");

-- CreateIndex
CREATE INDEX "AgentMachine_lastSeenAt_idx" ON "AgentMachine"("lastSeenAt");

-- CreateIndex
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

-- CreateIndex
CREATE INDEX "AgentTask_machineId_idx" ON "AgentTask"("machineId");

-- CreateIndex
CREATE INDEX "AgentTask_createdAt_idx" ON "AgentTask"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemModuleStatus_moduleKey_key" ON "SystemModuleStatus"("moduleKey");

-- CreateIndex
CREATE INDEX "QianfanRelayMessage_createdAt_idx" ON "QianfanRelayMessage"("createdAt");

-- CreateIndex
CREATE INDEX "QianfanRelayMessage_buyerNick_idx" ON "QianfanRelayMessage"("buyerNick");

-- CreateIndex
CREATE INDEX "QianfanRelayMessage_notifyStatus_idx" ON "QianfanRelayMessage"("notifyStatus");

-- CreateIndex
CREATE INDEX "UploadedMedia_bizType_bizId_idx" ON "UploadedMedia"("bizType", "bizId");

-- CreateIndex
CREATE INDEX "UploadedMedia_createdAt_idx" ON "UploadedMedia"("createdAt");
