-- Archived desks keep their booking history but must not reserve their name on
-- the floor. Suffix any already-archived desk the same way desk.deleteDesk now does.
UPDATE "desks"
SET "number" = "number" || ' [archived ' || right("id", 6) || ']'
WHERE "archivedAt" IS NOT NULL AND "number" NOT LIKE '% [archived %]';
