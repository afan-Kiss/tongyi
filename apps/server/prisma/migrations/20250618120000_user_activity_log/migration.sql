-- CreateTable
CREATE TABLE "UserActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "category" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "path" TEXT,
    "detailJson" TEXT NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "UserActivityLog_createdAt_idx" ON "UserActivityLog"("createdAt");

-- CreateIndex
CREATE INDEX "UserActivityLog_username_idx" ON "UserActivityLog"("username");

-- CreateIndex
CREATE INDEX "UserActivityLog_category_idx" ON "UserActivityLog"("category");
