-- Desk watches become date-specific ("notify me if this desk frees up on this
-- date"). The app never offered a way to create a watch before this, so any
-- existing rows are inert; they are kept, dated to the day they were created
-- (already past, so they never fire), rather than deleted.
ALTER TABLE "desk_watches" ADD COLUMN "date" DATE;
UPDATE "desk_watches" SET "date" = ("createdAt" AT TIME ZONE 'UTC')::date WHERE "date" IS NULL;
ALTER TABLE "desk_watches" ALTER COLUMN "date" SET NOT NULL;

DROP INDEX "desk_watches_userId_deskId_key";
CREATE UNIQUE INDEX "desk_watches_userId_deskId_date_key" ON "desk_watches"("userId", "deskId", "date");
CREATE INDEX "desk_watches_deskId_date_idx" ON "desk_watches"("deskId", "date");

-- Check-in reminders are sent once per booking.
ALTER TABLE "bookings" ADD COLUMN "checkInReminderSentAt" TIMESTAMP(3);

-- Bell: latest notifications and unread count per user.
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");
