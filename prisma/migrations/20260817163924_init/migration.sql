-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT,
    "parentId" TEXT,
    "order" INTEGER NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isHome" BOOLEAN NOT NULL DEFAULT false,
    "layoutCols" INTEGER NOT NULL DEFAULT 12,
    "rowHeight" INTEGER NOT NULL DEFAULT 8,
    "gap" INTEGER NOT NULL DEFAULT 16,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Page_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Page" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ComponentNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "parentNodeId" TEXT,
    "order" INTEGER NOT NULL,
    "gridCol" INTEGER NOT NULL DEFAULT 1,
    "gridSpan" INTEGER NOT NULL DEFAULT 12,
    "gridRow" INTEGER NOT NULL DEFAULT 1,
    "gridRowSpan" INTEGER NOT NULL DEFAULT 4,
    "propsJson" TEXT NOT NULL DEFAULT '{}',
    "bindingJson" TEXT,
    "eventsJson" TEXT NOT NULL DEFAULT '{}',
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ComponentNode_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ComponentNode_parentNodeId_fkey" FOREIGN KEY ("parentNodeId") REFERENCES "ComponentNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Entity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tableName" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columnName" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isUnique" BOOLEAN NOT NULL DEFAULT false,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "defaultVal" TEXT,
    "enumValues" TEXT,
    "refEntityId" TEXT,
    "order" INTEGER NOT NULL,
    CONSTRAINT "Field_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Relation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromType" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cardinality" TEXT,
    "labelText" TEXT,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GraphNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 220,
    "height" INTEGER NOT NULL DEFAULT 120,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "pageId" TEXT,
    "actionId" TEXT,
    CONSTRAINT "GraphNode_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GraphNode_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Revision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "revisionNo" INTEGER NOT NULL,
    "specJson" TEXT NOT NULL,
    "migrationSql" TEXT,
    "note" TEXT,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "activeRevisionId" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ValidationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "warnCount" INTEGER NOT NULL DEFAULT 0,
    "resultJson" TEXT NOT NULL DEFAULT '[]',
    "specHash" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");

-- CreateIndex
CREATE INDEX "Page_parentId_order_idx" ON "Page"("parentId", "order");

-- CreateIndex
CREATE INDEX "ComponentNode_pageId_parentNodeId_order_idx" ON "ComponentNode"("pageId", "parentNodeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_name_key" ON "Entity"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Entity_tableName_key" ON "Entity"("tableName");

-- CreateIndex
CREATE INDEX "Field_entityId_order_idx" ON "Field"("entityId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Field_entityId_columnName_key" ON "Field"("entityId", "columnName");

-- CreateIndex
CREATE UNIQUE INDEX "Relation_fromType_fromId_toType_toId_kind_key" ON "Relation"("fromType", "fromId", "toType", "toId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Action_name_key" ON "Action"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GraphNode_refId_key" ON "GraphNode"("refId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphNode_pageId_key" ON "GraphNode"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "GraphNode_actionId_key" ON "GraphNode"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "Revision_revisionNo_key" ON "Revision"("revisionNo");
