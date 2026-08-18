-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ComponentNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentNodeId" TEXT,
    "order" INTEGER NOT NULL,
    "gridCol" INTEGER NOT NULL DEFAULT 1,
    "gridSpan" INTEGER NOT NULL DEFAULT 12,
    "gridRow" INTEGER NOT NULL DEFAULT 1,
    "gridRowSpan" INTEGER NOT NULL DEFAULT 4,
    "region" TEXT NOT NULL DEFAULT 'main',
    "propsJson" TEXT NOT NULL DEFAULT '{}',
    "bindingJson" TEXT,
    "eventsJson" TEXT NOT NULL DEFAULT '{}',
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComponentNode_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComponentNode_parentNodeId_fkey" FOREIGN KEY ("parentNodeId") REFERENCES "ComponentNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ComponentNode" ("bindingJson", "createdAt", "eventsJson", "gridCol", "gridRow", "gridRowSpan", "gridSpan", "id", "label", "order", "pageId", "parentNodeId", "propsJson", "type", "updatedAt") SELECT "bindingJson", "createdAt", "eventsJson", "gridCol", "gridRow", "gridRowSpan", "gridSpan", "id", "label", "order", "pageId", "parentNodeId", "propsJson", "type", "updatedAt" FROM "ComponentNode";
DROP TABLE "ComponentNode";
ALTER TABLE "new_ComponentNode" RENAME TO "ComponentNode";
CREATE INDEX "ComponentNode_pageId_parentNodeId_order_idx" ON "ComponentNode"("pageId", "parentNodeId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
