# Desk Booking System — Project Guide (v2.2, Multi-Tenant SaaS)

Multi-tenant SaaS workplace desk booking platform hosting multiple **isolated customer
companies ("organizations")**. Within an organization: employees find/book/cancel desks across
sites and floors; org admins manage sites, floor plans, desks and users; **platform admins**
manage the organizations themselves. Real-time availability, a check-in flow, and occupancy
analytics. **Full requirements: `docs/Desk-Booking-System-Spec-v2.md` + `docs/spec-v2.2-addendum.md`
— the addendum supersedes the base spec wherever they conflict (tenancy, SSO, floor-plan
storage, phases).**

> Go-to-market: ship the app working for ONE company ("customer zero") through Phase 5, then
> add the SaaS platform layer (Phases 7–8) before onboarding external customers.
> **No AI assistant** and **no rules engine** — both deferred. Any bookable desk can be booked
> by any employee **within its organization**. Keep the code clean enough to add AI later.

---

## Tech Stack (locked — do not substitute without asking)

- **Framework:** Next.js (App Router) + React + TypeScript (strict)
- **API layer:** tRPC (end-to-end typed)
- **Auth:** Auth.js (NextAuth v5) — Google + Microsoft Entra ID, **per-organization SSO** (see rules)
- **DB:** PostgreSQL + Prisma ORM
- **Validation:** Zod (shared client/server; every mutation input is a Zod schema)
- **UI:** Tailwind CSS + shadcn/ui
- **Floor map:** react-konva (canvas)
- **File storage:** behind a **swappable storage abstraction** — local volume in dev,
  tenant-scoped S3-compatible object storage in production.
- **Realtime availability:** Postgres `LISTEN/NOTIFY` → a small WebSocket server. *Display only —
  never the source of truth for availability.* (Revisit a managed realtime service at scale.)
- **Background jobs:** pg-boss (Postgres-backed queue — no Redis/extra service)
- **Email:** Amazon SES (or Resend)
- **Charts:** Recharts
- **Deployment:** managed, scalable cloud infra (see Deployment). Docker Compose is fine for
  local dev / customer-zero, but production SaaS is NOT a single VPS.

## Folder structure (conform to this)

```
desk-booking/
├── CLAUDE.md
├── docs/
│   ├── Desk-Booking-System-Spec-v2.md   # base specification
│   ├── spec-v2.2-addendum.md            # SaaS changes (supersede base on conflict)
│   └── floorplans/                       # Floor-2.pdf, Floor-4.pdf, Floor-5.pdf
├── docker-compose.yml           # dev/customer-zero: app + postgres + ws server + worker
├── Dockerfile
├── prisma/
│   ├── schema.prisma            # 14 core entities live here
│   ├── migrations/
│   └── seed.ts                  # customer-zero org: dummy users + sample sites/floors/desks
├── src/
│   ├── app/
│   │   ├── (auth)/              # sign-in / org resolution
│   │   ├── (app)/               # authenticated org shell: top bar + sidebar
│   │   │   ├── home/            # dashboard
│   │   │   ├── bookings/        # my bookings
│   │   │   ├── book/            # book-a-desk flow
│   │   │   ├── floor-map/       # viewer
│   │   │   └── admin/           # ORG admins only, guarded by middleware
│   │   │       ├── editor/      # editing platform (draft/live floor plans)
│   │   │       ├── sites/       # facilities/sites
│   │   │       └── users/       # user management (org-wide directory)
│   │   ├── (platform)/          # PLATFORM admin only: manage organizations, onboarding
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       └── trpc/[trpc]/
│   ├── server/
│   │   ├── api/
│   │   │   ├── routers/         # one router per domain
│   │   │   ├── trpc.ts          # context (incl. orgId), protected/siteAdmin/orgAdmin/platformAdmin procedures
│   │   │   └── root.ts
│   │   ├── auth/                # Auth.js config, per-org SSO resolution, session helpers
│   │   ├── db/                  # Prisma client + tenant-scoping middleware
│   │   ├── tenancy/             # org context, isolation guards
│   │   ├── storage/             # file storage abstraction (local ↔ S3)
│   │   ├── booking/             # booking + locking + one-active-booking + check-in logic
│   │   ├── search/              # desk/people/booking search
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

1. **TENANT ISOLATION IS THE #1 RULE.** Every tenant-owned entity has an `organizationId`, and
   every query/mutation is scoped by it **centrally** (Prisma tenant-scoping middleware /
   org-aware client + the tRPC context), never left to individual call sites. Organization A
   must never read or affect Organization B's data. This MUST be covered by automated tests.

2. **Double-booking is prevented in the database, not app code.** No-overlap constraint per desk
   (unique on `(deskId, date, timeSlot)` or a time-range exclusion constraint) plus a
   serializable transaction / row lock. The realtime layer is display only.

3. **Bookings are start–end time ranges on a single weekday.** Dropdown start/end; validate
   end > start, within the site's operating hours, reject weekends. Store UTC; display in the
   **site's time zone**.

4. **One active booking per user.** No two *overlapping* bookings (different-day bookings are
   fine). Admins are exempt and can book on behalf of others, incl. **guest bookings**
   (nullable `guestName` + `bookedById`).

5. **Cancellation** allowed any time **before** start. Admins cancel any booking in their scope;
   users only their own.

6. **Check-in with auto-cancel.** Desks have `requiresCheckIn`. If not checked in by **one hour
   before start** (configurable), a pg-boss job auto-cancels, releases the desk, and notifies.

7. **No rules engine.** Desks are simply active/bookable or not. No department/day/priority
   restrictions. Eligibility = "desk is active and free for the slot" (within its org).

8. **Floor map has draft vs live.** Admin edits mutate a `FloorPlanVersion` draft; Publish
   promotes to live. Never edit live directly. Save/publish/rollback. Uploaded plans are
   **tenant-scoped**, stored via the storage abstraction; **PDFs are rendered first-page → PNG**
   for the canvas background.

9. **Meeting rooms are map-only** — drawn, never bookable.

10. **RBAC with FOUR roles, checked centrally.** `PLATFORM_ADMIN` (operates the SaaS, manages
    organizations, belongs to no org), `ORG_SUPER_ADMIN` (top admin within one org),
    `SITE_ADMIN` (scoped to assigned sites via `Permission`; can view the org-wide user
    directory, manages desks/floors only for their sites), `STANDARD_USER`. Guard `/admin/*`,
    `/(platform)/*`, and the matching tRPC procedures in middleware; always re-check org + site
    scope on the server.

11. **Per-organization SSO.** Each customer org connects its own IdP (Entra tenant / Google
    Workspace domain). SSO **authenticates only**; the org's `User` table is the directory.
    On sign-in, resolve the user to the correct org, then allow only if their email exists in
    that org (reject unknown users). SSO settings live on the Organization, never hard-coded.

12. **Users come from dummy seed data for now** (per org). HRIS auto-sync (per-org Google Sheet,
    keyed on email, auto-deactivating leavers) is deferred — design for it, don't build it yet.

13. **Audit everything sensitive** (desk create/edit/delete, floor-plan publish, booking cancel,
    role change, org changes) via Prisma middleware → `AuditLog` (org-scoped).

14. **Desk occupancy is intentionally visible within an org** (available/booked/scheduled + who
    booked it). Accepted privacy choice — see the GDPR section of the spec.

## Data model — 14 core entities
**Organization**, User, Role, Permission, Site, Floor, FloorPlanVersion, Desk, Room (map-only),
Utility, Booking, DeskWatch, Notification, AuditLog. Add `organizationId` FKs to all
tenant-owned entities (Floor/Desk/Room/Utility inherit via Site). Model these first in
`schema.prisma` before any feature code. (The v1 `Rule` entity is intentionally gone.)

Booking status enum: CONFIRMED, CHECKED_IN, CANCELLED, AUTO_CANCELLED, COMPLETED.
Desk map states: AVAILABLE, BOOKED, SCHEDULED, INACTIVE.

---

## Build phases (plan and execute one at a time — do NOT build everything at once)

Phases 0–5 build the tenant-aware app and ship it for **customer zero** (one org); isolation is
enforced from the schema up even with a single tenant.

- **Phase 0 — Scaffold:** ✅ complete. Next.js + TS + Tailwind + shadcn, tRPC, Prisma, Docker
  skeleton, `.env.example`, lint/format.
- **Phase 1 — Data + auth:** full `schema.prisma` (**14 entities**, `organizationId` scoping +
  tenant middleware), migrations, dummy seed for customer-zero, Auth.js (Google + Entra),
  RBAC middleware (**four roles** + site-scoped permissions).
- **Phase 2 — Core booking:** floor-map viewer, desk info panel, both booking flows, DB-level
  no-double-booking, one-active-booking, weekday/time validation, cancellation. **Seed
  `docs/floorplans/Floor-2/4/5.pdf` (rasterized, with placed desks) under customer-zero** so
  booking has real maps.
- **Phase 3 — Check-in:** check-in flow, per-desk toggle, auto-cancel pg-boss job.
- **Phase 4 — Admin:** sites/floors management, floor-map **upload UI + PDF→PNG conversion**,
  draft/live editor, bulk edit, org-wide user management, audit logs.
- **Phase 5 — Notifications + watch + analytics:** in-app + email, reminders, desk watch,
  occupancy dashboards (use check-in data for actual attendance).
- **Phase 6 (optional/deferred):** per-org HRIS Google-Sheet sync; optional AI assistant.
- **Phase 7 — SaaS platform layer:** Platform Admin area, organization onboarding/provisioning,
  per-org SSO configuration, and the **tenant-isolation test suite**.
- **Phase 8 — SaaS readiness:** move to managed/scalable hosting, monitoring, per-tenant
  backups, billing (if commercial), compliance groundwork (GDPR DPAs, SOC 2 prep).

Pause for review (open a PR) at the end of each phase.

---

## Deployment

- **Dev / customer-zero:** Docker Compose (app + Postgres + WS server + pg-boss worker) behind
  Caddy is fine.
- **Production SaaS (Phase 8):** managed, scalable infra — managed Postgres with automated
  point-in-time backups, container hosting that scales, tenant-scoped S3-compatible object
  storage for floor plans, a CDN, and a secrets manager. Design for no single point of failure.
- **Security & compliance (first-class scope, not polish):** as a **GDPR data processor** for
  customers you need per-customer Data Processing Agreements, per-tenant retention/erasure, and
  a path to **SOC 2** for enterprise sales. Hardened tenant isolation + security review.
- **Backups:** automated and **tested** (verify restores) — per tenant where applicable.
- Target: responsive web (desktop + mobile browser). No native app.

## Commands
```
npm run dev              # start dev server
npx prisma migrate dev   # apply schema changes
npx prisma db seed       # seed customer-zero dummy data
npm run typecheck
npm run lint
docker compose up -d     # run full stack locally
```

## Conventions
- TypeScript strict. No `any`.
- All tRPC mutation inputs validated with Zod; reuse schemas on the client.
- Server-only logic stays in `src/server/**`, `realtime/**`, `jobs/**`; never import into client components.
- Every server data path goes through the tenant-scoped client — no raw un-scoped Prisma queries.
- Keep components small; colocate feature UI under `components/<domain>/`.

---

## Git & GitHub workflow (follow this every phase)

**Remote:** the project's GitHub repo. `main` is always working/deployable.

**Branch per phase.** Never commit feature work directly to `main`.
```
git checkout -b phase/<n>-<slug>     # e.g. phase/1-data-auth
```

**Commit conventions:** Conventional Commits — `feat:`, `fix:`, `chore:`, `refactor:`,
`docs:`, `test:`. Short imperative subject (~50 chars). Small logical commits, not one giant
commit per phase.

**When to commit:** after each logical unit that typechecks/lints clean. Always at end of phase.
Run `npm run typecheck && npm run lint` before committing.

**End of each phase:**
```
git push -u origin phase/<n>-<slug>
gh pr create --fill --base main        # PR for human review
```
Then STOP and wait for review/merge before the next phase.

**Hard rules:**
- NEVER commit secrets. `.env*` (except `.env.example`) must be in `.gitignore`.
- Never `git push --force` to `main` or a shared branch. Never rewrite pushed history.
- Ask before deleting branches or resetting. Prompt for confirmation before each commit.