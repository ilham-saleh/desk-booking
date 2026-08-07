# Desk Booking System — Build Specification (v2)

*Role-based workplace desk booking system, built with Claude Code.*
*Stack: Next.js + TypeScript + tRPC + Prisma + PostgreSQL + Auth.js (Google & Entra SSO).*

---

## Changelog from v1 (for reference)

1. **AI assistant removed** for the initial build — reintroduced as an optional later phase.
2. **Booking model** clarified: explicit start/end times chosen from dropdowns; weekdays only.
3. **Rules engine removed entirely** — any bookable desk can be booked by anyone.
4. **Roles** clarified: Standard User, Site Admin (per-site), and Super Admin (global).
5. Added missing entities: **Notification, DeskWatch, FloorPlanVersion**.
6. **Meeting rooms are map-only** (drawn, not bookable).
7. **HRIS sync** deferred; seed with dummy data for now (Google Sheet sync later).
8. Auth is **both Google and Entra** throughout.
9. **Guest/visitor bookings** modelled (admin books on behalf, under a guest name).
10. **One active booking per user** (no overlapping bookings).
11. **Check-in feature added** with auto-cancel; toggleable per desk.
12. **Per-site time zones** added.
13. Cancellation typo fixed; **bookings cancellable any time before start**.
14. Target platform: **responsive web**.
15. **GDPR / data-retention** section added.
16. Floor map shows **available / booked / scheduled** desk states to all users.

---

## Product Overview

A role-based workplace desk booking system that allows:
- Employees to find, book, manage, and cancel desks across sites and floors.
- Admins to manage sites, floors, floor plans, desks, and users.
- Real-time availability visibility on interactive floor maps.
- A structured check-in process to reduce no-shows.

The system supports flexible hybrid working. In this version, **any desk marked bookable
can be booked by any employee** — there are no department or role-based allocation rules.

> **Deferred to later phases:** AI-assisted natural-language search/booking, and HRIS
> auto-sync. Both are designed around but not built in this version.

---

## Authentication

- Sign in with **Google** and **Microsoft Entra ID** (SSO), both supported.
- **Role-based access control (RBAC)** — see Roles below.
- **Users source:** In this version, users are **seeded from dummy data** (and can be
  created/edited by admins). A future phase will auto-sync employees from a **Google Sheet**
  provided by HR (match key: email; leavers auto-deactivated; SSO sign-in rejected for
  anyone not present in the user table).

---

## User Roles

Three roles. `Permission` records link Site Admins to the site(s) they manage.

### Standard User
Can: book desks; cancel their own bookings (before start); check in; view floor maps;
search desks and people; view their bookings; manage their account; receive notifications;
watch a desk for availability.
Cannot: create/edit sites, floors, or desks; manage users; cancel other users' bookings.

### Site Admin
Everything a Standard User can do, **plus (scoped to their assigned sites only):**
manage floors and floor plans; create/edit desks, rooms, utilities, labels; bulk-edit desks;
activate/deactivate desks; toggle desk check-in; book/cancel on behalf of others; create
guest/visitor bookings; view users and booking history for their sites; edit site details.

### Super Admin
Everything a Site Admin can do, **across all sites**, plus: create/delete sites; manage all
users; assign roles; assign site permissions to Site Admins.

---

## Global Top Bar (fixed on all pages)

1. **Logo** — left, clickable, returns Home.
2. **Search bar** — global search for desks, people, and bookings by name, email,
   department, desk ID, site, or floor. Real-time suggestions (optional enhancement).
   Results can highlight a desk on the floor map or show a colleague's booked location.
3. **Notifications icon** — unread count; opens a panel showing booking confirmations,
   cancellations, reminders, check-in prompts, auto-cancellations, and desk-availability
   alerts (watch mode). Clicking a notification navigates to the booking or highlights the
   desk on the map.
4. **Profile icon** — account menu: view/edit account, manage preferences, log out.
   Displays name, role, and (optionally) site.

*(The v1 AI button is removed for this version.)*

---

## Layout

**Sidebar** — role-based navigation, items appear based on role/permissions:
- Users: Home, My Bookings, Book a Desk, Floor Map.
- Admins additionally: Editing Platform, Facilities / Sites, Users.

**Main section** — changes based on the selected sidebar item.

---

## Core Modules

### A. Dashboard (Home)
Greeting with name; quick **Book a Desk** button; **My Bookings** button; embedded floor-map
preview; floor and date dropdowns.

### B. Booking System

**Booking time model:** a booking is for a single date with an explicit **start time and end
time**, each chosen from dropdowns (e.g. 07:00–18:00, or 09:00–13:00). Bookings can be made
for any future **weekday** (weekends are not selectable). Times are interpreted in the
**site's local time zone**.

**Booking flows:**
1. **Direct map booking** — click a desk → details panel → pick date, start, end → book.
2. **Book-a-Desk button** — name field (pre-filled and locked for standard users; admins can
   change it or enter a guest name) → select site → select date, start, end → **Find
   Available Desk** → eligible desks highlight on the map → select one → confirm.

**Booking rules (system-level, not configurable per desk):**
- A desk can only be booked if it is **active/bookable**.
- **No double-booking:** two bookings cannot overlap in time on the same desk.
- **One active booking per user:** a standard user cannot hold two overlapping bookings.
  Multiple bookings on different days/times are allowed.
  *(Open toggle: if you instead want a hard cap of one upcoming booking total per user,
  this is a one-line change — confirm which you want.)*
- **Admins are exempt** and may create multiple bookings, including guest/visitor bookings
  entered under a guest name on the admin's own account.
- **Cancellation** is allowed any time **before** the booking's start time (not after start).

### C. Check-in
- Bookings on desks with check-in enabled require the user to **check in** to keep the desk.
- If the user has **not checked in by one hour before the booking start time**, the booking
  is **automatically cancelled** and the desk released (a background job enforces this; the
  user is notified). *(The one-hour threshold is configurable.)*
- Check-in can be **turned off per desk** in desk settings (then bookings are held without
  check-in).

### D. Floor Map System
Users can: view floors; navigate between floors; see **live availability**; see desk details.
Desks display state on the map: **Available**, **Booked** (in use now), **Scheduled** (has a
future booking), and **Inactive**. The desk info panel shows desk number, name field,
date/time, who has it booked, and a **Book** button (and a **Watch** button when occupied).

Admins can: upload floor plans; edit layout; add/edit/delete desks, meeting rooms (map-only),
utilities, and labels; modify capacity; multi-select for bulk updates.

### E. Editing Platform (Admin only) — the control centre
Floor-map editor; desk creation/editing; bulk-select mode; active/inactive toggling; per-desk
check-in toggle; room management (map-only); utilities management; floor labelling; space
configuration.

**Draft vs Live (version control):** admin edits are made to a **draft** floor-plan version;
a **Publish** action promotes the draft to live. Save / Publish / rollback are supported so
live layouts are never edited accidentally. (Backed by the `FloorPlanVersion` entity.)

### F. Facilities / Sites Management
Super Admin can create and delete sites (delete with validation). Site Admins can edit their
sites' details. Each site has: name, address, **time zone**, operating hours, optional photo,
and one or more floors. Each floor has floor plans, desks, and rooms.

### G. Users Management
Admins can view users (Super Admin: all; Site Admin: their sites), filter by name /
department / role / site, update role / site permission / department (where allowed), and
view booking history.

Users table columns: Name, Email (ID), Department, Role, Site Access, Status (active/inactive).

---

## Booking Features (summary)
- Real-time availability and occupied/unoccupied status.
- Booking details view; desk information panel (number, name, date/time, occupant, book/watch).
- View future bookings via a date calendar.
- Cancel own booking before start (admins can cancel any booking).
- **Watch a desk:** if a desk is occupied, a user can watch it and be notified when it frees
  up (backed by the `DeskWatch` entity — a standalone feature, no AI required).

---

## Essential System Behaviours

1. **Real-time updates & no double-booking.** Prevent two users booking the same desk/slot.
   Enforce at the database level with a uniqueness/overlap constraint plus a serializable
   transaction (or row lock) — the real-time layer is for display only, never the source of
   truth for availability.
2. **Booking conflict handling.** Prevent overlapping bookings (per desk and per user);
   validate that end time is after start time and within the site's operating hours; block
   weekends.
3. **Notifications.** Booking confirmation; cancellation confirmation; reminder before start;
   check-in prompt and auto-cancellation notice; desk-available alert (watch mode).
   Channels: in-app (persisted via the `Notification` entity) and email (optional).
   Future: push notifications.
4. **Audit logs (important).** Track who created/edited/deleted a desk, who published a floor
   plan, who cancelled a booking, who changed a user's role, etc.
5. **Occupancy analytics.** Desk usage stats, site occupancy rates, department usage, peak
   days, utilisation reports. Because check-in data exists, reports can distinguish **booked**
   from **actually attended** (checked-in) where check-in is enabled.

---

## Data Model Foundations

Core entities (13):

- **User** — identity, department, role, status; linked to bookings, watches, permissions.
- **Role** — STANDARD_USER, SITE_ADMIN, SUPER_ADMIN.
- **Permission** — links a Site Admin user to the site(s) they administer.
- **Site** — name, address, **timeZone**, operating hours, photo; has floors.
- **Floor** — belongs to a site; has a live floor plan and desks/rooms.
- **FloorPlanVersion** — draft/live layout versions for a floor (enables Draft-vs-Live + rollback).
- **Desk** — number, name, map position, capacity, **active/bookable** flag, **requiresCheckIn** flag.
- **Room** — meeting room drawn on the map (**not bookable**; display only).
- **Utility** — non-desk map element (printer, kitchen, etc.).
- **Booking** — user (booker), optional **guestName**, **bookedById** (for admin-on-behalf),
  desk, date, **startTime**, **endTime**, **status** (CONFIRMED / CHECKED_IN / CANCELLED /
  AUTO_CANCELLED / COMPLETED), check-in timestamp.
- **DeskWatch** — user watching a desk for availability (for the notify-when-free feature).
- **Notification** — persisted in-app notifications (type, payload, read/unread).
- **AuditLog** — actor, action, target entity, timestamp, before/after where relevant.

*(The v1 `Rule` entity is removed, along with the rules engine.)*

---

## Non-Functional Requirements

- **Platform:** responsive web app (works on desktop and mobile browsers). No native mobile
  app in this version.
- **Availability:** internal-tool SLA; brief planned downtime acceptable. Automated,
  regularly **tested** database backups are required (highest-consequence risk to protect).
- **Time zones:** all times stored in UTC and displayed in the relevant site's local time.
- **Security:** SSO only; no local passwords. Server-side permission checks on every mutation.

---

## Data Protection (GDPR)

The system stores employee personal data (name, email, department), booking history, and
audit logs, for a UK-based organisation.

- Define and document a **data-retention policy** (e.g. bookings and notifications retained
  for a fixed period, then purged/aggregated).
- Support **right to erasure**: on request, personal data is removed or anonymised.
  Audit logs are retained for integrity but have personal identifiers **pseudonymised** so
  the action record survives without exposing personal data.
- **Desk-occupancy visibility is intentional:** the floor map shows available/booked/scheduled
  states and the desk panel shows who has booked a desk, visible to all users. This is a
  deliberate, accepted choice; note it in the internal privacy notice to staff.

---

## Suggested Build Phases (for Claude Code)

- **Phase 0 — Scaffold:** Next.js + TS + Tailwind + shadcn, tRPC, Prisma client, config.
- **Phase 1 — Data + auth:** full Prisma schema (13 entities), migrations, dummy seed data,
  Auth.js with Google + Entra, RBAC middleware (three roles + site-scoped permissions).
- **Phase 2 — Core booking:** floor-map viewer, desk info panel, both booking flows,
  DB-level no-double-booking, one-active-booking rule, cancellation, weekday/time validation.
- **Phase 3 — Check-in:** check-in flow, per-desk toggle, auto-cancel background job.
- **Phase 4 — Admin:** sites/floors management, floor-map editor with Draft-vs-Live, bulk
  edit, user management, audit logs.
- **Phase 5 — Notifications + watch + analytics:** in-app + email notifications, desk watch,
  occupancy dashboards.
- **Phase 6 (later) — HRIS sync and AI assistant:** Google Sheet user sync; optional AI.

Build and review one phase at a time.
