-- Desk management: reusable availability shifts + per-desk restriction assignments.
--
-- The old per-desk "availability_shifts" table already played the role of a
-- desk restriction assignment (desk × restriction × weekdays × advance window),
-- so it is RENAMED (not dropped) to desk_restriction_assignments and its
-- inline weekday data is relocated into a new reusable availability_shifts
-- table. No booking, desk or restriction rows are deleted.

-- ===== Enums =====
ALTER TYPE "RestrictionOperator" ADD VALUE 'IS_EMPTY';
ALTER TYPE "RestrictionOperator" ADD VALUE 'IS_NOT_EMPTY';

CREATE TYPE "RuleConnector" AS ENUM ('AND', 'OR');
CREATE TYPE "DeskRestrictionMode" AS ENUM ('ANYONE', 'ASSIGNED_OCCUPANTS', 'DESK_DEPARTMENT', 'CUSTOM');

-- ===== Restrictions: colour + rule ordering/connectors =====
ALTER TABLE "booking_restrictions" ADD COLUMN "color" TEXT;

ALTER TABLE "restriction_rules"
  ADD COLUMN "connector" "RuleConnector" NOT NULL DEFAULT 'OR',
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Preserve the existing (creation) order of rules within each restriction.
UPDATE "restriction_rules" r
SET "sortOrder" = ranked.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "restrictionId" ORDER BY "createdAt", id) AS rn
  FROM "restriction_rules"
) ranked
WHERE ranked.id = r.id;

-- ===== Desks: description, department, archive marker =====
ALTER TABLE "desks"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "departmentId" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "desks"
  ADD CONSTRAINT "desks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "desks_floorId_archivedAt_idx" ON "desks"("floorId", "archivedAt");

-- ===== Per-desk shifts become desk_restriction_assignments =====
ALTER TABLE "availability_shifts" RENAME TO "desk_restriction_assignments";

ALTER TABLE "desk_restriction_assignments" RENAME CONSTRAINT "availability_shifts_pkey" TO "desk_restriction_assignments_pkey";
ALTER TABLE "desk_restriction_assignments" RENAME CONSTRAINT "availability_shifts_organizationId_fkey" TO "desk_restriction_assignments_organizationId_fkey";
ALTER TABLE "desk_restriction_assignments" RENAME CONSTRAINT "availability_shifts_deskId_fkey" TO "desk_restriction_assignments_deskId_fkey";
ALTER TABLE "desk_restriction_assignments" RENAME CONSTRAINT "availability_shifts_restrictionId_fkey" TO "desk_restriction_assignments_restrictionId_fkey";

ALTER INDEX "availability_shifts_organizationId_idx" RENAME TO "desk_restriction_assignments_organizationId_idx";
ALTER INDEX "availability_shifts_deskId_idx" RENAME TO "desk_restriction_assignments_deskId_idx";
ALTER INDEX "availability_shifts_restrictionId_idx" RENAME TO "desk_restriction_assignments_restrictionId_idx";

-- Rows soft-deleted by admins under the old model were already invisible everywhere.
DELETE FROM "desk_restriction_assignments" WHERE "isActive" = false;

-- ===== New reusable availability_shifts =====
CREATE TABLE "availability_shifts" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "daysOfWeek" INTEGER[],
  "startTimeMinutes" INTEGER,
  "endTimeMinutes" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "availability_shifts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "availability_shifts_organizationId_name_key" ON "availability_shifts"("organizationId", "name");

ALTER TABLE "availability_shifts"
  ADD CONSTRAINT "availability_shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one reusable shift per distinct (org, weekdays, time window) found
-- on existing assignments, named from its weekdays, e.g. "Mon, Tue, Wed, Thu, Fri (09:00–17:00)".
INSERT INTO "availability_shifts" ("id", "organizationId", "name", "daysOfWeek", "startTimeMinutes", "endTimeMinutes", "isActive", "createdAt", "updatedAt")
SELECT
  'shift_' || md5(src."organizationId" || ':' || COALESCE(array_to_string(src."daysOfWeek", ','), '') || ':' || COALESCE(src."startTimeMinutes"::text, '') || ':' || COALESCE(src."endTimeMinutes"::text, '')),
  src."organizationId",
  COALESCE(
    (
      SELECT string_agg(
        CASE d WHEN 0 THEN 'Sun' WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu' WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat' ELSE d::text END,
        ', ' ORDER BY d
      )
      FROM unnest(src."daysOfWeek") AS t(d)
    ),
    'No days'
  )
  || CASE
       WHEN src."startTimeMinutes" IS NOT NULL AND src."endTimeMinutes" IS NOT NULL THEN
         ' (' || lpad((src."startTimeMinutes" / 60)::text, 2, '0') || ':' || lpad((src."startTimeMinutes" % 60)::text, 2, '0')
         || '–' || lpad((src."endTimeMinutes" / 60)::text, 2, '0') || ':' || lpad((src."endTimeMinutes" % 60)::text, 2, '0') || ')'
       ELSE ''
     END,
  src."daysOfWeek",
  src."startTimeMinutes",
  src."endTimeMinutes",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "organizationId", "daysOfWeek", "startTimeMinutes", "endTimeMinutes"
  FROM "desk_restriction_assignments"
) src
ON CONFLICT ("organizationId", "name") DO NOTHING;

-- ===== Link assignments to their shift, add mode/sortOrder, drop relocated columns =====
ALTER TABLE "desk_restriction_assignments"
  ADD COLUMN "shiftId" TEXT,
  ADD COLUMN "restrictionMode" "DeskRestrictionMode" NOT NULL DEFAULT 'ANYONE',
  ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "desk_restriction_assignments" a
SET "shiftId" = s."id"
FROM "availability_shifts" s
WHERE s."organizationId" = a."organizationId"
  AND s."daysOfWeek" = a."daysOfWeek"
  AND s."startTimeMinutes" IS NOT DISTINCT FROM a."startTimeMinutes"
  AND s."endTimeMinutes" IS NOT DISTINCT FROM a."endTimeMinutes";

-- Any assignment whose weekday combination collided on name above still needs a shift.
UPDATE "desk_restriction_assignments" a
SET "shiftId" = s."id"
FROM "availability_shifts" s
WHERE a."shiftId" IS NULL
  AND s."organizationId" = a."organizationId"
  AND s."daysOfWeek" = a."daysOfWeek";

DELETE FROM "desk_restriction_assignments" WHERE "shiftId" IS NULL;

UPDATE "desk_restriction_assignments" SET "restrictionMode" = 'CUSTOM' WHERE "restrictionId" IS NOT NULL;

UPDATE "desk_restriction_assignments" a
SET "sortOrder" = ranked.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "deskId" ORDER BY "createdAt", id) AS rn
  FROM "desk_restriction_assignments"
) ranked
WHERE ranked.id = a.id;

ALTER TABLE "desk_restriction_assignments" ALTER COLUMN "shiftId" SET NOT NULL;

ALTER TABLE "desk_restriction_assignments"
  ADD CONSTRAINT "desk_restriction_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "availability_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "desk_restriction_assignments_shiftId_idx" ON "desk_restriction_assignments"("shiftId");

ALTER TABLE "desk_restriction_assignments"
  DROP COLUMN "name",
  DROP COLUMN "daysOfWeek",
  DROP COLUMN "startTimeMinutes",
  DROP COLUMN "endTimeMinutes",
  DROP COLUMN "isActive";
