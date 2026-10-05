# CLAUDE.md

## Purpose

This repository is an internal workplace desk-booking platform.

Read `PROJECT_SPECS.md` before implementing product features. It is the main product and workflow specification.

The existing application already contains basic desk booking, floor-map and upload functionality. Extend the existing codebase rather than recreating it.

The reference application/recordings are behavioural references only. Do not copy branding, proprietary text or visual design pixel-for-pixel.

## Task Files

Feature implementation tasks are stored in `/tasks`.

When the user asks to work on a specific feature:

1. Read `CLAUDE.md`.
2. Read `PROJECT_SPECS.md`.
3. Read the relevant file inside `/tasks`.
4. Treat that task file as the current implementation scope.
5. Do not implement unrelated tasks unless required as a dependency.
6. Follow the implementation order and acceptance tests in the task file.
7. Do not mark the task complete until its acceptance criteria are verified.

---

# 1. First Rule: Inspect Before Editing

Before implementing a requested feature:

1. Inspect the relevant current code.
2. Inspect the current database/schema.
3. Inspect authentication and authorization.
4. Inspect existing API routes/server actions.
5. Inspect existing UI components that can be reused.
6. Inspect package scripts and test setup.
7. Identify the smallest safe implementation path.

Do not assume framework/library choices.

The existing repository is the source of truth for:

- frontend framework
- backend framework
- ORM/query layer
- database
- authentication library
- map/floor-plan rendering library
- component library
- test framework

Do not replace core libraries simply because another library would be easier.

---

# 2. Do Not Rebuild Working Features

Preserve existing working functionality unless the task explicitly requires changing it.

Especially avoid unnecessary rewrites of:

- current booking flow
- current floor map
- authentication/session handling
- floor-plan rendering
- existing database entities
- navigation shell
- design system

Prefer incremental extension.

If an existing implementation is flawed, explain the specific problem and make the smallest justified correction.

---

# 3. Work in Vertical Slices

Do not attempt the whole product in one uncontrolled change.

For each request, implement the requested workflow end-to-end.

Example desk-management slice:

```text
DB/schema
→ API/server mutation
→ authorization
→ UI
→ persistence
→ refresh/reload test
→ normal Floor Map integration
```

A visible button with no backend behaviour is not progress.

Do not move to unrelated features until the current slice works.

---

# 4. Plans Are Not the Deliverable

When the user asks for implementation:

- give a short inspection summary if useful
- state the files/models you will touch
- then implement

Do not stop after writing a long plan unless the user explicitly asks only for a plan.

---

# 5. Product Source of Truth

Use `PROJECT_SPECS.md` for intended product behaviour.

If the current implementation conflicts with it:

1. Preserve data and working functionality where possible.
2. Implement toward the specification incrementally.
3. Do not silently invent new product behaviour.
4. If a true ambiguity blocks safe implementation, ask one focused question.

Do not treat screenshot sample names, dates, people or departments as production seed data.

---

# 6. Roles

Core roles:

```text
SYSTEM_ADMIN
FACILITY_ADMIN
BOOKING_MANAGER
STANDARD_USER
```

Use an inactive/no-access account state separately when appropriate.

Do not reproduce the many roles seen in the reference application unless explicitly requested.

---

# 7. Authorization Is Server-Side

Never treat hidden navigation as authorization.

All protected actions must validate the actor on the server.

Use centralized reusable authorization helpers where practical:

```text
canManageSite(actor, site)
canManageFloor(actor, floor)
canEditDesk(actor, desk)
canManageUser(actor, target)
canBookForUser(actor, occupant)
canCancelBooking(actor, booking)
```

Use these checks for:

- page/server loaders
- APIs
- server actions
- mutations
- batch actions

Never trust:

- role sent by client
- user ID sent by client
- site/floor scope sent by client

Resolve permissions from the authenticated session and database.

---

# 8. Authentication

Microsoft Entra ID SSO is the only sign-in and sign-up method.

There is no HRIS integration and no email/password login.

Important rules:

- company-isolated access: only the configured Entra tenant
- sign-up = first successful Entra sign-in, which creates the internal User
- new users get `STANDARD_USER` and no admin permissions
- map the Entra object ID to the internal User
- disabled/inactive users cannot authenticate, and signing in again never reactivates them
- application roles remain app-managed
- Entra authentication does not imply admin access

If authentication is not yet fully implemented, do not fake it. Add it incrementally and keep development access explicit (dev-only sign-in must stay disabled in production).

---

# 9. Employee Data Ownership

Employee profile data comes from Microsoft Entra ID (token claims and/or Microsoft Graph) and refreshes on each sign-in.

Entra-owned fields may include:

- Entra object ID
- name
- work email
- department
- title
- phone
- office location
- employee ID (if set in Entra)

Application-owned fields include:

- role
- active/no-access state
- site permissions
- floor permissions
- delegation settings
- application preferences

A sign-in profile refresh must not overwrite app-owned fields.

Match users by Entra object ID first, then verified work email.

Never create duplicate users because their work email changed when the Entra object ID already matches.

Users appear in the directory only after their first sign-in.

---

# 10. Database Changes

Before adding a new table/model:

1. Search for an existing equivalent.
2. Reuse/extend it when appropriate.
3. Avoid parallel duplicate concepts.

Migrations should be:

- additive where possible
- data-safe
- reversible when practical
- small enough to review

Do not delete existing production-like data just to make a migration easy.

Do not reset the database unless explicitly authorized.

---

# 11. Core Domain Relationships

Keep these relationships conceptually intact, adapting names to the existing schema:

```text
Site
└── Floor
    ├── FloorPlan
    ├── Desk
    ├── Utility
    ├── RoomSpace
    ├── Neighborhood
    └── FloorLabel
```

Booking domain:

```text
Desk
├── Booking[]
└── DeskRestrictionAssignment[]
    ├── BookingRestriction
    ├── AvailabilityShift
    └── AdvanceBookingWindow
```

People domain:

```text
User
├── Department
├── Site permissions
├── Floor permissions
└── Delegate assignments
```

Do not simplify desk restrictions to one `department` string on Desk.

---

# 12. Desk Coordinates

Map object positions must persist in a floor-plan coordinate system.

Prefer normalized coordinates or another stable model:

```text
x: 0..1
y: 0..1
```

Do not persist only viewport pixel positions.

Coordinate behaviour must survive:

- browser resize
- refresh
- floor switching
- map zoom/pan

If using a canvas/SVG/map library, convert correctly between viewport and floor-plan coordinates.

---

# 13. Floor Plan Editing

Editing Platform is admin functionality.

Normal Floor Map is employee functionality.

Do not leak editing behaviours into Floor Map.

Editing Platform may support:

- create
- select
- drag/reposition
- edit
- delete

Normal Floor Map supports:

- select
- inspect
- book

Keep these interaction modes separate.

---

# 14. Creating Desks

Preferred flow:

```text
Editor Tools
→ Seats
→ Create
→ placement cursor
→ click floor
→ desk created
→ edit modal opens
```

Acceptable fallback:

```text
Create
→ desk appears at map centre
→ admin drags it
→ edit modal opens
```

Never require an admin to type coordinates manually.

Persist the desk and its coordinates.

---

# 15. Deleting Desks

Always confirm deletion.

If future bookings exist:

- do not silently hard-delete them
- block deletion, archive/deactivate, or use an explicit admin cancellation flow

Retain booking/audit history.

---

# 16. Desk Edit Modal

The edit modal should support the product behaviour described in `PROJECT_SPECS.md`.

Core information:

- name
- active/inactive
- assignment mode
- description
- department if applicable
- space type
- check-in setting
- assets
- attributes
- booking restrictions
- availability shifts
- advance booking window

Use the existing component system.

Do not build a static mock.

Save must persist.

---

# 17. Reusable Booking Restrictions

Restrictions are first-class reusable records.

Do not duplicate full rule JSON on every desk unless the existing data model requires a transitional compatibility layer.

Support rule fields such as:

```text
Department
Email
User
JobTitle
```

Support operators such as:

```text
is
is not
is any of
is not any of
is empty
is not empty
```

Support AND/OR connectors.

Use real employee/department data in selectors.

---

# 18. Restriction Evaluation

Restriction evaluation must be centralized.

Do not reimplement different logic in:

- Floor Map
- Book a Desk
- booking API
- admin preview

Create one domain/service function and reuse it.

Conceptually:

```text
evaluateDeskEligibility({
  actor,
  occupant,
  desk,
  site,
  startAt,
  endAt
})
```

It should determine:

- applicable shift
- applicable restriction
- whether occupant matches
- advance-window validity
- site/floor access
- operating-hours validity

The server is authoritative.

The UI may call the same logic or a read-only eligibility endpoint to explain results.

---

# 19. Occupant vs Booking Creator

Never conflate:

```text
occupantUserId
createdByUserId
```

For self-booking they may be equal.

For delegated booking they differ.

All restriction checks use the **occupant**.

Audit information uses the creator.

---

# 20. Availability Shifts

A desk can have multiple restriction/shift assignments.

Example:

```text
Mon + Fri → Anyone
Tue       → Anyone
Wed       → Technology
Thu       → Global Client Services
```

Model this with a relation such as:

```text
DeskRestrictionAssignment
```

Do not store a single permanent restriction on Desk.

Detect and prevent ambiguous overlapping shift assignments for the same day/time unless the product explicitly defines precedence.

---

# 21. Timezones

Use site timezone as the authority for workplace rules.

Do not calculate day-of-week restrictions solely using browser timezone.

Persist timestamps consistently and convert intentionally.

A London desk booked at 09:00 London time must remain a London 09:00 booking regardless of the viewer's local timezone.

---

# 22. Booking Conflict Safety

Availability displayed in the UI is not sufficient.

Booking creation must re-check conflicts on the server immediately before write.

Use a transaction.

Use database constraints or locking strategies available in the current stack where appropriate.

Never rely on "it looked available when the page loaded."

---

# 23. Booking Errors

Return actionable domain messages.

Good:

```text
This desk is restricted to Technology on Wednesdays.
```

Good:

```text
Desk 4.45 is already booked from 09:00 to 17:00.
```

Bad:

```text
Something went wrong.
```

Do not expose raw database errors to users.

---

# 24. Users Page

Use one combined Users area.

The Users area should combine:

- Entra employee data (columns such as name, email, title, department, location and additionally role and permission data columns which are created in the app by admin, not from Entra)
- search/filter
- employee detail
- application role
- site/floor permissions
- delegation
- booking context
- last login/activity

Entra-owned fields should be read-only in normal admin editing.

---

# 25. Home Page Scope

Do not add:

- announcements
- second floor map
- full analytics dashboard

Home should remain useful and light:

- greeting
- current/next booking
- Book a Desk CTA
- optional booking summary

---

# 26. Out-of-Scope Modules

Unless specifically requested, do not implement reference-product modules such as:

- announcements
- visitor management
- move management
- request subscriptions/general request manager
- large reporting/analytics platform
- mobile app

Do not let reference screenshots expand scope automatically.

---

# 27. UI Rules

Use the existing application's visual language.

Functional reference behaviours are important:

- right-side desk detail panel
- large desk edit modal
- searchable dropdowns
- restriction management modal
- rule builder
- shift dropdown
- editor sidebar

But do not make a pixel-perfect clone.

Requirements:

- responsive where practical
- keyboard-accessible controls
- labels for inputs
- visible loading states
- visible validation
- confirmation for destructive actions
- do not rely only on colour for state

---

# 28. Persistence Rule

No important feature is complete if refresh loses it.

Persistent items include:

- sites
- floors
- floor-plan references
- desks
- desk positions
- desk status
- restrictions
- restriction rules
- shifts
- desk restriction assignments
- bookings
- user roles
- floor permissions
- delegation

Do not use local component state or localStorage as the source of truth for these unless the repository's architecture explicitly requires a temporary client cache on top of server persistence.

---

# 29. No Fake Data in Production Paths

Do not:

- hardcode reference employee names
- hardcode reference departments
- hardcode desk restriction results
- return fake successful API responses
- show fake matching-record counts
- create UI-only buttons

Seed/demo fixtures are acceptable only in clearly separated development/test data.

---

# 30. Testing Expectations

After each feature, run the relevant repository checks.

Discover commands from package scripts/config.

Typical categories:

- typecheck
- lint
- unit tests
- integration tests
- build

Do not invent commands without checking the repo.

Critical domain tests should cover:

- standard user cannot access admin route
- Facility Admin cannot edit another site
- desk position persists
- overlapping booking rejected
- restriction selects correct shift
- eligible department allowed
- ineligible department rejected
- Booking Manager validation uses occupant
- standard user cannot cancel another user's booking
- first Entra sign-in creates one STANDARD_USER
- Entra profile refresh preserves app role/permissions
- other-tenant or deactivated user sign-in rejected

---

# 31. Manual Acceptance Checks

For map/editor features, automated tests alone are not enough.

Verify the actual user flow:

```text
Editing Platform
→ site
→ floor
→ map loads
→ create desk
→ drag desk
→ save
→ refresh
→ desk remains
→ edit restrictions
→ save
→ Floor Map
→ select same desk
→ restrictions appear
```

If a browser automation environment exists in the repo, use it.

Otherwise document exactly what was verified programmatically and what still needs manual browser verification.

Do not claim manual verification that did not happen.

---

# 32. Error Handling

Handle:

- missing site
- missing floor
- floor with no plan
- failed upload
- invalid coordinates
- duplicate desk name
- deleted/inactive desk
- stale edit
- restriction deleted while assigned
- missing/malformed Entra profile claims
- unauthorized mutation
- booking collision
- timezone conversion failure

Show user-safe messages and log useful server diagnostics.

---

# 33. Destructive Operations

Use confirmations for:

- deleting desk
- deleting floor
- deleting site
- deleting restriction
- deactivating user where consequences exist
- replacing floor plan when object alignment may be affected

Where dependent records exist, prefer safe blocking/archive behaviour over cascading destruction.

---

# 34. Performance

Avoid loading the entire company employee directory into every page.

Use:

- server-side filtering/search
- pagination/virtualization where needed
- targeted floor queries
- indexes on booking time ranges, floor IDs and user IDs
- debounced searchable selects

Floor Map should load only the selected floor's relevant map data.

---

# 35. Security

Never expose secrets to client bundles.

Validate file uploads by:

- type
- size
- safe storage path
- authorization

Sanitize/validate free text displayed back in UI.

Use parameterized ORM/query operations.

Apply CSRF protections appropriate to the framework/session model.

Do not log passwords, tokens or full authentication secrets.

---

# 36. Sign-up Provisioning Safety

First-sign-in provisioning must be safe and idempotent:

```text
validate tenant/token
→ match by Entra object ID, then email
→ reject if matched user is inactive
→ create (STANDARD_USER) or refresh Entra-owned fields
→ record last login
```

Concurrent first sign-ins must not create duplicate users (rely on unique constraints).

Do not delete users. A user missing from Entra is disabled/inactive, not removed.

---

# 37. Entra Integration Safety

When implementing Entra:

- tenant ID must be configured server-side
- validate issuer/audience
- map stable Entra object ID
- reject accounts outside the configured tenant, including personal Microsoft accounts
- do not derive application admin role from arbitrary Entra claims unless explicitly configured
- keep logout/session expiry correct

---

# 38. Documentation

When a feature materially changes architecture:

- update relevant project documentation
- keep `PROJECT_SPECS.md` aligned with agreed product behaviour
- keep comments focused on non-obvious logic

Do not write huge comments that duplicate obvious code.

---

# 39. Definition of Done

Do not mark a task done because:

- component renders
- button exists
- mock data displays
- API returns 200 in one happy path

A feature is done when relevant items below are true:

- end-to-end workflow works
- server authorization exists
- data persists
- refresh preserves state
- domain validation is correct
- errors are understandable
- tests pass
- existing related features still work
- no fake production data was introduced
- schema/API/UI agree
- acceptance case has been verified

---

# 40. Default Development Behaviour

When working on a task:

1. Read the task.
2. Read relevant sections of `PROJECT_SPECS.md`.
3. Inspect existing implementation.
4. State a concise change plan.
5. Implement the smallest complete vertical slice.
6. Run tests/checks.
7. Fix failures introduced by the change.
8. Summarize:
   - what changed
   - files changed
   - migrations
   - tests run
   - any remaining manual verification

Do not broaden scope without necessity.

Do not "clean up" unrelated code during feature work.

Do not rewrite the project architecture unless there is a concrete blocking reason.
