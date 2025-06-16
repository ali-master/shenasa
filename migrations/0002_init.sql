-- Migration number: 0002 	 2025-04-24T09:09:09.324Z
-- CreateTable
CREATE TABLE "PersianName" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "enName" TEXT
);

-- CreateIndex
CREATE INDEX "PersianName_name_idx" ON "PersianName"("name") IF NOT EXISTS;

-- CreateIndex
CREATE UNIQUE INDEX "PersianName_name_gender_key" ON "PersianName"("name", "gender") IF NOT EXISTS;


