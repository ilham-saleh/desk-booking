-- CLAUDE.md rule 2 (no double-booking) and rule 4 (one active booking per user),
-- enforced in the database via GiST exclusion constraints — not app code. Only
-- CONFIRMED/CHECKED_IN rows participate, so cancelling always frees the slot.
-- Prisma has no schema syntax for EXCLUDE constraints, so these aren't reflected
-- in schema.prisma; a violation surfaces as a generic driver error whose message
-- contains the constraint name (see src/server/booking/create-booking.ts).

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- "startAt"/"endAt" are stored as naive TIMESTAMP (UTC instants, no tz attached —
-- see CLAUDE.md rule 3), so the range type is tsrange, not tstzrange. tstzrange()
-- over a plain timestamp column requires a timestamp->timestamptz cast that
-- depends on the session's TimeZone setting, which Postgres refuses to allow in
-- an index expression ("functions in index expression must be marked IMMUTABLE").

-- No two active bookings may overlap in time on the same desk.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_desk_no_overlap"
  EXCLUDE USING gist (
    "deskId" WITH =,
    tsrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" IN ('CONFIRMED', 'CHECKED_IN'));

-- No user may hold two overlapping active bookings (guest bookings have
-- userId NULL and are exempt — there's no user to double-book).
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_user_no_overlap"
  EXCLUDE USING gist (
    "userId" WITH =,
    tsrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("status" IN ('CONFIRMED', 'CHECKED_IN') AND "userId" IS NOT NULL);
