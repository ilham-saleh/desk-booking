-- Users management (tasks/users-management.md): HRIS-ready profile fields on
-- users, and a type on permissions so a Facility Admin's managed site can be
-- told apart from a Booking Manager's "book for others" site.

-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('FACILITY_ADMIN', 'BOOK_FOR_OTHERS');

-- AlterTable: profile fields (all nullable — populated by the HRIS sync later)
ALTER TABLE "users"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "employeeId" TEXT,
  ADD COLUMN "title" TEXT,
  ADD COLUMN "location" TEXT;

-- Backfill first/last name from the existing display name (split on the first space).
UPDATE "users"
SET "firstName" = NULLIF(split_part(btrim("name"), ' ', 1), ''),
    "lastName"  = NULLIF(btrim(substr(btrim("name"), length(split_part(btrim("name"), ' ', 1)) + 1)), '')
WHERE "firstName" IS NULL AND "lastName" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_organizationId_employeeId_key" ON "users"("organizationId", "employeeId");
CREATE INDEX "users_organizationId_role_idx" ON "users"("organizationId", "role");
CREATE INDEX "users_organizationId_isActive_idx" ON "users"("organizationId", "isActive");

-- AlterTable: every existing permission row meant "Facility Admin manages this
-- site", so backfill that type, then drop the default so new rows must say
-- what they grant.
ALTER TABLE "permissions" ADD COLUMN "type" "PermissionType" NOT NULL DEFAULT 'FACILITY_ADMIN';
ALTER TABLE "permissions" ALTER COLUMN "type" DROP DEFAULT;
