# jobs

pg-boss worker process (Postgres-backed queue, no Redis). Runs as its own process/container,
separate from the Next.js app; see `docker-compose.yml`.

Phase 0 booted pg-boss with zero queues registered. Phase 3 adds the `booking.check-in-sweep`
queue: a cron-scheduled job (every 5 minutes) that runs `runCheckInAutoCancelSweep` (see
`src/server/booking/auto-cancel.ts`) to auto-cancel CONFIRMED bookings on check-in-required
desks that missed their check-in deadline.

`booking.check-in-reminder` (every 5 minutes) runs `runCheckInReminderSweep`
(`src/server/booking/check-in-reminder.ts`): an in-app reminder 30 minutes before that
deadline, sent once per booking. The deadline is an hour after the booking starts (or after it was
made, if later) — see `checkInDeadline` in `src/server/booking/auto-cancel.ts`.

Desk-watch alerts are not a scheduled job: `notifyDeskWatchers`
(`src/server/notifications/desk-watch.ts`) runs whenever a booking is cancelled,
auto-cancelled or ended early.
