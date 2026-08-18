-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Page" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "parentId" TEXT,
    "order" INTEGER NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isHome" BOOLEAN NOT NULL DEFAULT false,
    "asideVisible" BOOLEAN NOT NULL DEFAULT true,
    "layoutCols" INTEGER NOT NULL DEFAULT 12,
    "rowHeight" INTEGER NOT NULL DEFAULT 8,
    "gap" INTEGER NOT NULL DEFAULT 16,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Page_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Page" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Page" ("createdAt", "gap", "icon", "id", "isHome", "isVisible", "layoutCols", "order", "parentId", "rowHeight", "slug", "title", "updatedAt") SELECT "createdAt", "gap", "icon", "id", "isHome", "isVisible", "layoutCols", "order", "parentId", "rowHeight", "slug", "title", "updatedAt" FROM "Page";
DROP TABLE "Page";
ALTER TABLE "new_Page" RENAME TO "Page";
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");
CREATE INDEX "Page_parentId_order_idx" ON "Page"("parentId", "order");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
