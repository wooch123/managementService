-- CreateTable
CREATE TABLE "GraphViewPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "viewKey" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "GraphViewPosition_viewKey_idx" ON "GraphViewPosition"("viewKey");

-- CreateIndex
CREATE UNIQUE INDEX "GraphViewPosition_viewKey_refType_refId_key" ON "GraphViewPosition"("viewKey", "refType", "refId");
