# Desk Booking System — Project Guide (v2)

Role-based workplace desk booking platform. Employees find/book/cancel desks across sites
and floors; admins manage sites, floor plans, desks and users. Real-time availability, a
check-in flow, and occupancy analytics. **Full requirements: see `docs/Desk-Booking-System-Spec-v2.md`.**

> This version has **no AI assistant** and **no rules engine** — both are deferred. Any desk
> marked bookable can be booked by any employee. Keep the code clean enough to add AI later.

---

## Tech Stack (locked — do not substitute without asking)

- **Framework:** Next.js (App Router) + React + TypeScript (strict)
- **API layer:** tRPC (end-to-end typed)
- **Auth:** Auth.js (NextAuth v5) — Google + Microsoft Entra ID, RBAC on top
- **DB:** PostgreSQL + Prisma ORM
- **Validation:** Zod (shared client/server; every mutation input is a Zod schema)
- **UI:** Tailwind CSS + shadcn/ui
- **Floor map:** react-konva (canvas)
- **Realtime availability:** Postgres `LISTEN/NOTIFY` → a small WebSocket server (self-hosted).
  *Display only — never the source of truth for availability.*
- **Background jobs:** pg-boss (Postgres-backed queue — no Redis/extra service)
- **Email:** Amazon SES (or Resend free tier)
- **Charts:** Recharts
- **Deployment:** self-hosted on a single VPS via Docker Compose (see Deployment).

> **If deploying managed instead of self-hosted**, only these change: realtime → Ably/Pusher,
> jobs → Inngest, DB → Neon/Supabase, host → Vercel. Everything else is identical. Ask first.

## Folder structure (conform to this)

```
desk-booking/
├── CLAUDE.md
├── docs/
│   └── Desk-Booking-System-Spec-v2.md   # the build specification
├── docker-compose.yml           # app + postgres + ws server + worker
├── Dockerfile
├── Caddyfile                    # reverse proxy / TLS
├── prisma/
│   ├── schema.prisma            # 13 core entities live here
│   ├── migrations/
│   └── seed.ts                  # dummy users + sample site/floor/desks
├── src/
│   ├── app/
│   │   ├── (auth)/              # sign-in pages
│   │   ├── (app)/               # authenticated shell: top bar + sidebar
│   │   │   ├── home/            # dashboard
│   │   │   ├── bookings/        # my bookings
│   │   │   ├── book/            # book-a-desk flow
│   │   │   ├── floor-map/       # viewer
│   │   │   └── admin/           # admin-only, guarded by middleware
│   │   │       ├── editor/      # editing platform (draft/live floor plans)
│   │   │       ├── sites/       # facilities/sites
│   │   │       └── users/       # user management
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       └── trpc/[trpc]/
│   ├── server/
│   │   ├── api/
│   │   │   ├── routers/         # one router per domain
│   │   │   ├── trpc.ts          # context, protectedProcedure, siteAdminProcedure, superAdminProcedure
│   │   │   └── root.ts
│   │   ├── auth/                # Auth.js config, session helpers
│   │   ├── db/                  # Prisma client singleton
│   │   ├── booking/             # booking + locking + one-active-booking + check-in logic
│   │   ├── search/              # desk/people/booking search (the non-AI "find a desk")
│   │   ├── notifications/       # create + dispatch (in-app + email)
│   │   └── realtime/            # LISTEN/NOTIFY publisher
│   ├── components/
│   │   ├── ui/                  # shadcn
│   │   ├── layout/              # TopBar, Sidebar
│   │   ├── floor-map/           # Konva canvas + editor
│   │   └── booking/
│   ├── lib/                     # shared utils, Zod schemas
│   └── hooks/
├── realtime/                    # standalone WebSocket server (subscribes to NOTIFY)
└── jobs/                        # pg-boss worker: reminders, check-in auto-cancel, watch alerts
```

---

## Architectural rules (non-negotiable)

1. **Double-booking is prevented in the database, not app code.** Enforce a no-overlap
   constraint per desk (unique on `(deskId, date, timeSlot)` or an exclusion constraint on the
   time range) plus a serializable transaction / row lock. The realtime layer is display only.

2. **Bookings are start–end time ranges on a single weekday.** Start and end come from
   dropdowns; validate end > start, within the site's operating hours, and reject weekends.
   Store times in UTC; display in the **site's time zone**.

3. **One active booking per user.** A standard user cannot hold two *overlapping* bookings
   (multiple different-day bookings are allowed). Admins are exempt and can create bookings on
   behalf of others, including **guest bookings** (nullable `guestName` + `bookedById`).

4. **Cancellation** is allowed any time **before** a booking's start time. Admins can cancel
   any booking; users only their own.

5. **Check-in with auto-cancel.** Desks have a `requiresCheckIn` flag. If a booking on such a
   desk is not checked in by **one hour before start** (threshold configurable), a pg-boss job
   auto-cancels it, releases the desk, and notifies the user.

6. **No rules engine.** Desks are simply active/bookable or not. Do NOT build department/
   day/priority restrictions. Booking eligibility = "desk is active and free for the slot".

7. **Floor map has draft vs live.** Admin edits mutate a `FloorPlanVersion` draft; a Publish
   action promotes it to live. Never mutate the live layout directly. Support save/publish/rollback.

8. **Meeting rooms are map-only** — drawn on the floor plan, never bookable. No room-booking flow.

9. **RBAC with three roles, checked centrally.** STANDARD_USER, SITE_ADMIN (scoped to assigned
   sites via `Permission`), SUPER_ADMIN (global). Guard `/admin/*` and admin procedures in
   middleware, and always re-check site scope for Site Admins on the server.

10. **Users come from dummy seed data for now.** HRIS auto-sync (from a Google Sheet, keyed on
    email, auto-deactivating leavers, rejecting SSO sign-in for unknown users) is a later phase —
    design for it but don't build it yet.

11. **Audit everything sensitive** (desk create/edit/delete, floor-plan publish, booking cancel,
    role change) via Prisma middleware writing to `AuditLog`.

12. **Desk occupancy is intentionally visible** (available/booked/scheduled + who booked it).
    This is an accepted privacy choice — see the GDPR section of the spec.

## Data model — 13 core entities
User, Role, Permission, Site, Floor, FloorPlanVersion, Desk, Room (map-only), Utility,
Booking, DeskWatch, Notification, AuditLog. Model these first in `schema.prisma` before any
feature code. (The v1 `Rule` entity is intentionally gone.)

Booking status enum: CONFIRMED, CHECKED_IN, CANCELLED, AUTO_CANCELLED, COMPLETED.
Desk map states: AVAILABLE, BOOKED, SCHEDULED, INACTIVE.

---

## Build phases (plan and execute one at a time — do NOT build everything at once)

- **Phase 0 — Scaffold:** Next.js + TS + Tailwind + shadcn, tRPC, Prisma client, Docker
  skeleton, `.env.example`, lint/format. App runs with an empty authenticated shell.
- **Phase 1 — Data + auth:** full `schema.prisma` (13 entities), migrations, dummy seed data,
  Auth.js (Google + Entra), RBAC middleware (3 roles + site-scoped permissions).
- **Phase 2 — Core booking:** floor-map viewer, desk info panel, both booking flows,
  DB-level no-double-booking, one-active-booking rule, weekday/time validation, cancellation.
- **Phase 3 — Check-in:** check-in flow, per-desk toggle, auto-cancel pg-boss job.
- **Phase 4 — Admin:** sites/floors management, floor-map editor with draft/live, bulk edit,
  user management, audit logs.
- **Phase 5 — Notifications + watch + analytics:** in-app + email, reminders, desk watch,
  occupancy dashboards (use check-in data for actual attendance).
- **Phase 6 (later):** HRIS Google-Sheet sync, then the optional AI assistant.

Pause for review (open a PR) at the end of each phase.

---

## Deployment (self-hosted)

Single VPS running everything via **Docker Compose**: the Next.js app, PostgreSQL, the
WebSocket realtime server, and the pg-boss worker, behind **Caddy** (automatic TLS).
- Secrets via `.env` on the server (never committed).
- **Automated, tested database backups are mandatory** (nightly `pg_dump` to off-box storage;
  periodically verify a restore). This is the highest-consequence risk in a self-hosted setup.
- Optional: install Coolify on the VPS for git-push deploys.
- Target: responsive web (desktop + mobile browser). No native app.

## Commands
```
npm run dev              # start dev server
npx prisma migrate dev   # apply schema changes
npx prisma db seed       # seed dummy data
npm run typecheck
npm run lint
docker compose up -d     # run full stack locally / on the server
```

## Conventions
- TypeScript strict. No `any`.
- All tRPC mutation inputs validated with Zod; reuse schemas on the client.
- Server-only logic stays in `src/server/**`, `realtime/**`, `jobs/**`; never import into client components.
- Keep components small; colocate feature UI under `components/<domain>/`.

---

## Git & GitHub workflow (follow this every phase)

**Remote:** GitHub repo `desk-booking` (created via `gh`). `main` is always working/deployable.

**Branch per phase.** Never commit feature work directly to `main`.
```
git checkout -b phase/<n>-<slug>     # e.g. phase/0-scaffold, phase/1-data-auth
```

**Commit conventions:** Conventional Commits — `feat:`, `fix:`, `chore:`, `refactor:`,
`docs:`, `test:`. Short imperative subject (~50 chars). Commit in small logical units, not one
giant commit per phase.

**When to commit:** after each logical unit completes and typechecks/lints clean. Always commit
at the end of a phase. Run `npm run typecheck && npm run lint` before committing.

**End of each phase:**
```
git push -u origin phase/<n>-<slug>
gh pr create --fill --base main        # PR so the human can review the phase
```
Then STOP and wait for review/merge before starting the next phase.

**Hard rules:**
- NEVER commit secrets. `.env*` (except `.env.example`) must be in `.gitignore`.
- Never `git push --force` to `main` or a shared branch. Never rewrite pushed history.
- Ask before deleting branches or resetting. Prompt for confirmation before each commit.

**One-time bootstrap (done at project start):**
```
git init
gh repo create desk-booking --private --source=. --remote=origin
# .gitignore + CLAUDE.md + docs/spec-v2.md committed as the initial commit
```
