-- CreateTable
CREATE TABLE "Bracelet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "certNo" TEXT NOT NULL,
    "arrivalDate" TEXT,
    "batch" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT,
    "ringSize" TEXT,
    "cost" TEXT,
    "remark" TEXT,
    "orderNo" TEXT,
    "returnDate" TEXT,
    "soldDate" TEXT,
    "actualPrice" TEXT,
    "salesPerson" TEXT,
    "salesChannel" TEXT,
    "excelRow" INTEGER,
    "excelSheet" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Bracelet_certNo_key" ON "Bracelet"("certNo");

CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "braceletId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "thumbPath" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_braceletId_fkey" FOREIGN KEY ("braceletId") REFERENCES "Bracelet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "braceletId" TEXT NOT NULL,
    "certNo" TEXT NOT NULL,
    "opType" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "resultJson" TEXT,
    "excelSynced" BOOLEAN NOT NULL DEFAULT false,
    "excelSyncMsg" TEXT,
    "reverted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationLog_braceletId_fkey" FOREIGN KEY ("braceletId") REFERENCES "Bracelet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LabelTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "widthMm" REAL NOT NULL DEFAULT 50,
    "heightMm" REAL NOT NULL DEFAULT 30,
    "fieldsJson" TEXT NOT NULL,
    "barcodeType" TEXT NOT NULL DEFAULT 'CODE128',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "LabelTemplate_name_key" ON "LabelTemplate"("name");

CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "json" TEXT NOT NULL DEFAULT '{}'
);
