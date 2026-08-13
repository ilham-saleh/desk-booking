# jobs

pg-boss worker process (Postgres-backed queue, no Redis). Runs as its own process/container,
separate from the Next.js app; see `docker-compose.yml`.

Phase 0: boots pg-boss with zero queues registered. Phase 3 adds the check-in auto-cancel
job and its sweeper cron; Phase 5 adds reminders and desk-watch alerts.
