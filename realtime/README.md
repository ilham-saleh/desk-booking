# realtime

Standalone WebSocket server. Subscribes to Postgres `LISTEN/NOTIFY` and forwards desk/booking
state changes to connected clients. **Display only** — never the source of truth for
availability (CLAUDE.md architectural rule 1). Runs as its own process/container, separate
from the Next.js app; see `docker-compose.yml`.

Phase 0: HTTP health check + WebSocket echo only. The Postgres subscription and per-connection
auth (a short-lived signed token issued by a tRPC query) are added in Phase 2.
