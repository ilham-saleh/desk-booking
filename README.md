# Desk Booking

Role-based workplace desk booking platform. See `CLAUDE.md` for the project guide and
`docs/Desk-Booking-System-Spec-v2.md` for the full build specification.

## Status

**Phase 0 — Scaffold.** Next.js + TypeScript + tRPC + Tailwind + shadcn/ui app shell with a
role-based sidebar, a mock session (real auth lands in Phase 1), and a Docker Compose stack
that boots the app, a WebSocket realtime stub, a pg-boss worker stub, Postgres, and Caddy.

## Local development

```bash
cp .env.example .env        # fill in real secrets; never commit .env
npm install
npm run dev                 # http://localhost:3000, no database required yet
```

Once Postgres is available (Phase 1 onward):

```bash
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

**Never run `prisma db push`** on this project. The no-double-booking and one-active-booking
invariants are enforced by hand-written PostgreSQL exclusion constraints that live in the
migration history, not in `schema.prisma` — `db push` bypasses migrations and would silently
drop them.

## Commands

```bash
npm run dev              # start dev server
npx prisma migrate dev   # apply schema changes (never `prisma db push`)
npx prisma db seed       # seed dummy data
npm run typecheck
npm run lint
docker compose up -d     # run full stack locally / on the server
```

## Full stack via Docker Compose

```bash
docker compose up -d
```

Runs `app` (Next.js), `postgres`, `realtime` (WebSocket server), `worker` (pg-boss), and
`caddy` (reverse proxy / TLS). See `docker-compose.yml`.
