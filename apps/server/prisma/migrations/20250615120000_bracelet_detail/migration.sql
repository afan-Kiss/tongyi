-- BraceletDetail: SQL-only extended info (media stays in MediaAsset)

CREATE TABLE "BraceletDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "braceletId" TEXT NOT NULL,
    "description" TEXT,
    "material" TEXT,
    "jadeGrade" TEXT,
    "weightGram" TEXT,
    "origin" TEXT,
    "color" TEXT,
    "flawNotes" TEXT,
    "internalNote" TEXT,
    "tags" TEXT,
    "extraJson" TEXT DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BraceletDetail_braceletId_fkey" FOREIGN KEY ("braceletId") REFERENCES "Bracelet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BraceletDetail_braceletId_key" ON "BraceletDetail"("braceletId");
