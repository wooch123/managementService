-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "siteTitle" TEXT NOT NULL DEFAULT 'WebApp_V1',
    "siteSubtitle" TEXT NOT NULL DEFAULT 'v1.0.1',
    "updatedAt" DATETIME NOT NULL
);
