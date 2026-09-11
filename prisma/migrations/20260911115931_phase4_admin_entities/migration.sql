-- AlterEnum: Add BOOKING_MANAGER role
ALTER TYPE "Role" ADD VALUE 'BOOKING_MANAGER' BEFORE 'STANDARD_USER';

-- Create new enums
CREATE TYPE "RestrictionFieldType" AS ENUM ('DEPARTMENT', 'EMAIL', 'USER');
CREATE TYPE "RestrictionOperator" AS ENUM ('IS', 'IS_NOT', 'IS_ANY_OF', 'IS_NOT_ANY_OF');
CREATE TYPE "DeskAssignmentMode" AS ENUM ('BOOKABLE', 'ASSIGNED');
CREATE TYPE "UnitSystem" AS ENUM ('METRIC', 'IMPERIAL');

-- Extend User table
ALTER TABLE "users" ADD COLUMN "phone" TEXT,
ADD COLUMN "timezone" TEXT,
ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Extend Site table
ALTER TABLE "sites" ADD COLUMN "city" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "unitSystem" "UnitSystem" NOT NULL DEFAULT 'METRIC',
ADD COLUMN "allowEmployeeSeeBookings" BOOLEAN NOT NULL DEFAULT true;

-- Extend Desk table
ALTER TABLE "desks" ADD COLUMN "spaceType" TEXT,
ADD COLUMN "assignmentMode" "DeskAssignmentMode" NOT NULL DEFAULT 'BOOKABLE',
ADD COLUMN "assignedOccupantId" TEXT;

-- Add foreign key for assignedOccupantId
ALTER TABLE "desks" ADD CONSTRAINT "desks_assignedOccupantId_fkey" FOREIGN KEY ("assignedOccupantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Extend Booking table
ALTER TABLE "bookings" ADD COLUMN "recurrenceRule" JSONB;

-- Create Department table
CREATE TABLE "departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE("organizationId", "name")
);

-- Create BookingRestriction table
CREATE TABLE "booking_restrictions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "booking_restrictions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE("organizationId", "name")
);

-- Create RestrictionRule table
CREATE TABLE "restriction_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "restrictionId" TEXT NOT NULL,
    "fieldType" "RestrictionFieldType" NOT NULL,
    "operator" "RestrictionOperator" NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "restriction_rules_restrictionId_fkey" FOREIGN KEY ("restrictionId") REFERENCES "booking_restrictions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create AvailabilityShift table
CREATE TABLE "availability_shifts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "deskId" TEXT NOT NULL,
    "restrictionId" TEXT,
    "name" TEXT,
    "daysOfWeek" INTEGER[],
    "advanceBookingWindowDays" INTEGER,
    "startTimeMinutes" INTEGER,
    "endTimeMinutes" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "availability_shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "availability_shifts_deskId_fkey" FOREIGN KEY ("deskId") REFERENCES "desks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "availability_shifts_restrictionId_fkey" FOREIGN KEY ("restrictionId") REFERENCES "booking_restrictions"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Create DeskAttribute table
CREATE TABLE "desk_attributes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "deskId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "desk_attributes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "desk_attributes_deskId_fkey" FOREIGN KEY ("deskId") REFERENCES "desks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE("deskId", "type")
);

-- Create SiteOperatingHours table
CREATE TABLE "site_operating_hours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "openAtMinutes" INTEGER NOT NULL,
    "closeAtMinutes" INTEGER NOT NULL,
    CONSTRAINT "site_operating_hours_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "site_operating_hours_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE("siteId", "dayOfWeek")
);

-- Create indices for performance
CREATE INDEX "departments_organizationId_idx" ON "departments"("organizationId");
CREATE INDEX "booking_restrictions_organizationId_idx" ON "booking_restrictions"("organizationId");
CREATE INDEX "restriction_rules_restrictionId_idx" ON "restriction_rules"("restrictionId");
CREATE INDEX "availability_shifts_organizationId_idx" ON "availability_shifts"("organizationId");
CREATE INDEX "availability_shifts_deskId_idx" ON "availability_shifts"("deskId");
CREATE INDEX "availability_shifts_restrictionId_idx" ON "availability_shifts"("restrictionId");
CREATE INDEX "desk_attributes_organizationId_idx" ON "desk_attributes"("organizationId");
CREATE INDEX "desk_attributes_deskId_idx" ON "desk_attributes"("deskId");
CREATE INDEX "site_operating_hours_organizationId_idx" ON "site_operating_hours"("organizationId");
CREATE INDEX "site_operating_hours_siteId_idx" ON "site_operating_hours"("siteId");
