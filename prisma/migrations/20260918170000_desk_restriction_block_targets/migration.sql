-- Restriction blocks carry their own audience: named occupants (ASSIGNED_OCCUPANTS)
-- or department names (DEPARTMENT), instead of relying on a desk-level department.

ALTER TYPE "DeskRestrictionMode" RENAME VALUE 'DESK_DEPARTMENT' TO 'DEPARTMENT';

ALTER TABLE "desk_restriction_assignments" ADD COLUMN "departmentNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "desk_restriction_occupants" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "desk_restriction_occupants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "desk_restriction_occupants_assignmentId_userId_key" ON "desk_restriction_occupants"("assignmentId", "userId");
CREATE INDEX "desk_restriction_occupants_organizationId_idx" ON "desk_restriction_occupants"("organizationId");
CREATE INDEX "desk_restriction_occupants_userId_idx" ON "desk_restriction_occupants"("userId");

ALTER TABLE "desk_restriction_occupants"
  ADD CONSTRAINT "desk_restriction_occupants_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "desk_restriction_occupants_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "desk_restriction_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "desk_restriction_occupants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over any existing department-mode blocks from the desk's department...
UPDATE "desk_restriction_assignments" a
SET "departmentNames" = ARRAY[d."name"]
FROM "desks" k
JOIN "departments" d ON d."id" = k."departmentId"
WHERE a."deskId" = k."id" AND a."restrictionMode" = 'DEPARTMENT' AND k."departmentId" IS NOT NULL;

-- ...and any assigned-occupant blocks from the desk's permanent occupant.
INSERT INTO "desk_restriction_occupants" ("id", "organizationId", "assignmentId", "userId")
SELECT 'dro_' || md5(a."id" || ':' || k."assignedOccupantId"), a."organizationId", a."id", k."assignedOccupantId"
FROM "desk_restriction_assignments" a
JOIN "desks" k ON k."id" = a."deskId"
WHERE a."restrictionMode" = 'ASSIGNED_OCCUPANTS' AND k."assignedOccupantId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- The desk-level department field (added earlier today, never populated by the UI) is retired.
ALTER TABLE "desks" DROP CONSTRAINT "desks_departmentId_fkey";
ALTER TABLE "desks" DROP COLUMN "departmentId";
