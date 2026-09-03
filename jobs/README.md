# jobs

pg-boss worker process (Postgres-backed queue, no Redis). Runs as its own process/container,
separate from the Next.js app; see `docker-compose.yml`.

Phase 0 booted pg-boss with zero queues registered. Phase 3 adds the `booking.check-in-sweep`
queue: a cron-scheduled job (every 5 minutes) that runs `runCheckInAutoCancelSweep` (see
`src/server/booking/auto-cancel.ts`) to auto-cancel CONFIRMED bookings on check-in-required
desks that missed their check-in deadline. Phase 5 adds reminders and desk-watch alerts.
