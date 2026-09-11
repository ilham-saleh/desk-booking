# Phase 4 Implementation Plan

**Status:** PHASE 3 COMPLETE (Phase 3 committed on `phase/3-check-in`, awaiting review/merge to main)

**Goal:** Transform the desk-booking prototype into a fully featured workplace management system with:
- Proper facility/site administration (create/edit/delete)
- Department and booking restriction system
- Availability shifts with multi-day/multi-restriction support
- Complete admin user & permission management
- Floor-plan editor with draft/live versioning
- Updated floor-map UI with desk details, restrictions display, and admin booking capabilities

---

## Current State Audit

### What's Already Implemented (Phases 1–3)
- ✅ **Schema:** 14 core entities, tenant scoping, multi-org support, RBAC (4 roles)
- ✅ **Auth:** Auth.js, Google + Entra SSO, per-org SSO configuration
- ✅ **RBAC:** PLATFORM_ADMIN, ORG_SUPER_ADMIN, SITE_ADMIN, STANDARD_USER with role-based middleware
- ✅ **Booking Core:** Create, cancel, check-in, end-early, no-double-booking constraints, one-active-booking rule
- ✅ **Floor-Map Viewer:** Konva canvas, desk/room/utility display, live desk state via polling
- ✅ **Check-in Flow:** Per-desk toggle, auto-cancel pg-boss job (Phase 3)
- ✅ **Database Constraints:** GiST exclusion constraints for booking overlap

### What's Missing / Placeholder (Needed for Phase 4)

#### Database Schema (Must Add)
- ❌ `Department` — user departments, used by restrictions
- ❌ `BookingRestriction` — reusable restriction rules (e.g., "Editorial Only")
- ❌ `RestrictionRule` — individual rule entries within a restriction (dept = X, email = Y, etc.)
- ❌ `AvailabilityShift` — per-desk booking rules (name, days of week, restriction ref, advance window)
- ❌ `DeskAttribute` — desk features (standing desk, dual monitors, etc.)
- ❌ `UserFacilityPermission` (extend `Permission`) — track if user can access a facility/floor

#### Existing Schema Gaps
- ❌ `Site` missing: city, country, postal code, description, metric/imperial units, employee-visibility toggle
- ❌ `Site.operatingHours` — currently just start/end minutes; needs per-day configuration (Mon 7am–7pm, etc.)
- ❌ `Desk` missing: department assignment, space-type, assignment-mode, attributes relation
- ❌ `User` missing: phone, timezone, last-login, creation date (department exists but not yet used)
- ❌ `Booking` missing: repeating bookings support (for now, design the schema to allow it)

#### Server/API (Must Implement)
- ❌ Site CRUD (create, update, delete with validation)
- ❌ Floor CRUD (create, update, delete, reorder)
- ❌ Department management (CRUD)
- ❌ BookingRestriction & RestrictionRule CRUD with rule builder
- ❌ AvailabilityShift CRUD per desk
- ❌ User profile edit (role, department, phone, timezone, permissions)
- ❌ Permission management — UserFacilityPermission CRUD
- ❌ Floor-plan image upload + PDF→PNG conversion
- ❌ Desk bulk operations (create multiple, bulk edit)
- ❌ Desk attributes management
- ❌ Floor-plan version publish/draft workflow

#### UI/Components (Must Implement)
- ❌ Facilities / Sites page — full CRUD table with filters
- ❌ Facilities create/edit form — address, timezone, operating hours per day, settings
- ❌ Floors section within facility — CRUD, display order
- ❌ Editing Platform — floor selector, canvas with pan/zoom, desk/room/utility placement
- ❌ Floor-plan upload modal + PDF conversion
- ❌ Desk editor — properties, attributes, availability shifts, restrictions
- ❌ Restrictions builder — visual rule editor with AND/OR logic
- ❌ Users management page — searchable table with role/dept filters
- ❌ User edit form — profile, permissions, delegation
- ❌ Updated floor-map desk panel — restrictions display, admin controls, desk calendar

#### Authorization/Testing
- ❌ FACILITY_ADMIN scope enforcement (verify site scope is re-checked on every mutation)
- ❌ BOOKING_MANAGER role differentiation (no admin access, just booking delegation)
- ❌ Desk occupant field for permanent assignments (optional, used by BOOKING_MANAGER)
- ❌ Test cases from phase4.md (CASE 1–16)

---

## Phase 4 Implementation Strategy

**Recommendation:** Do this in **9 logical sub-phases** (as outlined in phase4.md section 31) rather than building everything at once. Each sub-phase ends with a testable, working feature.

### Phase 4.1: Schema Extensions + Audit Helpers
**Goal:** Add all missing schema entities and migrations; no UI yet.

**Changes:**
1. Add `Department` table (name, organizationId)
2. Add `BookingRestriction` (id, name, organizationId, createdAt, etc.)
3. Add `RestrictionRule` (id, restrictionId, fieldType: DEPARTMENT|EMAIL|USER, operator: IS|IS_NOT|IS_ANY_OF|IS_NOT_ANY_OF, value: JSON)
4. Add `AvailabilityShift` (id, deskId, name, daysOfWeek: int[], restrictionId, advanceBookingWindowDays, optional startTime/endTime)
5. Add `DeskAttribute` (id, deskId, type: STANDING_DESK|DUAL_MONITORS|etc., createdAt)
6. Extend `Site` schema with: city, country, postalCode, description, unitSystem (metric|imperial), allowEmployeeSeeBookings (default true)
7. Extend `Site.operatingHours` → create `SiteOperatingHours` table (siteId, dayOfWeek: 0–6, openAt: minutes, closeAt: minutes)
8. Extend `Desk` with: spaceType (optional), assignedOccupantId (optional, nullable User ref), assignmentMode (BOOKABLE|ASSIGNED)
9. Extend `User` with: phone, timezone, lastLoginAt, createdAt (already exists), department FK
10. Extend `Booking` with repeating schema (recurrenceRule: JSON, nullable)
11. Create migration + update Prisma client

**Files to Create:**
- `prisma/migrations/add_phase4_entities/migration.sql`

**Files to Update:**
- `prisma/schema.prisma`

**Tests:** Run migration on test DB, verify constraints, no data loss on existing records.

---

### Phase 4.2: RBAC Refinement + Authorization Helpers
**Goal:** Distinguish FACILITY_ADMIN from ORG_SUPER_ADMIN; update procedure guards; implement authorization helpers.

**Changes:**
1. Rename `SITE_ADMIN` → `FACILITY_ADMIN` in Role enum (or add mapping for backwards compat with Phase 3)
2. Add `BOOKING_MANAGER` role (intermediate between STANDARD_USER and FACILITY_ADMIN)
3. Update role checks in `src/server/auth/roles.ts`:
   - `isAdminRole()` → match FACILITY_ADMIN + ORG_SUPER_ADMIN
   - `isFacilityAdmin()` — checks only FACILITY_ADMIN
   - `isOrgSuperAdmin()` — checks only ORG_SUPER_ADMIN
   - `isBookingManager()` — checks BOOKING_MANAGER
4. Create auth helper functions:
   - `canManageFacility(user, facilityId)` — ORG_SUPER_ADMIN or FACILITY_ADMIN with permission
   - `canManageFloor(user, floorId)` — same as facility for floor's parent
   - `canEditDesk(user, deskId)` → checks facility scope
   - `canManageUser(actor, targetUserId)` → only ORG_SUPER_ADMIN or FACILITY_ADMIN for user's facilities
   - `canBookForUser(actor, occupantUserId)` → BOOKING_MANAGER/admin only
   - `canCancelBooking(actor, bookingId)` → occupant (if own), BOOKING_MANAGER (if delegated), or admin for scope
5. Update nav-items to distinguish BOOKING_MANAGER (gets Book-a-Desk delegation UI, no admin access)
6. Add `siteAdminProcedure` → requires FACILITY_ADMIN role (rename if needed for clarity)

**Files to Update:**
- `src/server/auth/roles.ts`
- `src/lib/auth-helpers.ts` (create if not exists)
- `src/server/api/trpc.ts` (add procedures)
- `src/components/layout/nav-items.ts`
- `prisma/schema.prisma` (Role enum)

**Tests:** Unit test auth helpers with different role/permission combos.

---

### Phase 4.3: Site/Facility Management (CRUD)
**Goal:** Sites page, full site management (create/edit/delete/list) with per-day operating hours.

**Changes:**
1. Create router: `src/server/api/routers/facility.ts` (initially extends site router)
   - `list: facilityAdminProcedure` — org-scoped (ORG_SUPER_ADMIN sees all; FACILITY_ADMIN sees assigned only)
   - `get: facilityAdminProcedure`
   - `create: facilityAdminProcedure` → Zod schema with city, country, postal, timezone, unitSystem, settings
   - `update: facilityAdminProcedure` (call `assertFacilityAdmin` on facilityId)
   - `delete: facilityAdminProcedure`
   - `listOperatingHours: query(facilityId)` → returns per-day hours
   - `updateOperatingHours: facilityAdminProcedure` → set Mon 7-19, Tue 7-19, etc.
2. Create UI components:
   - `src/components/admin/facility-list.tsx` — table with CRUD buttons, filters (name, city, active)
   - `src/components/admin/facility-form.tsx` — form with address, timezone picker, operating hours grid
   - `src/components/admin/facility-detail-panel.tsx` — read-only view + edit/delete
3. Update page:
   - `src/app/(app)/admin/sites/page.tsx` — replace placeholder with list + create button
4. Add Zod schema:
   - `src/lib/schemas/facility.ts` — facility input validation
5. Update seed data for CUSTOMER_ZERO with city/country/operating hours

**Files to Create:**
- `src/server/api/routers/facility.ts`
- `src/components/admin/facility-list.tsx`
- `src/components/admin/facility-form.tsx`
- `src/lib/schemas/facility.ts`

**Files to Update:**
- `src/app/(app)/admin/sites/page.tsx`
- `prisma/seed.ts`
- `src/server/api/root.ts` (add facilityRouter)

**Tests:** Create facility → verify persists, edit → verify updates, delete → verify cascade/softdelete behavior.

---

### Phase 4.4: Floors Management (CRUD + Reorder)
**Goal:** Floors CRUD within a facility, display order, active/inactive, optional visibility toggle.

**Changes:**
1. Extend floor router `src/server/api/routers/floor.ts`:
   - `create: facilityAdminProcedure` (check parent site access)
   - `update: facilityAdminProcedure`
   - `delete: facilityAdminProcedure`
   - `reorder: facilityAdminProcedure` → takes array of floorId + sortOrder
   - `list: orgProcedure` — all floors in site (filtering on user's scope done client-side later)
2. Extend Floor schema fields (already in schema.prisma, but add UI for):
   - active/inactive toggle
   - display order
   - description
   - isVisible toggle
3. Create UI:
   - `src/components/admin/floor-list.tsx` — within facility detail
   - `src/components/admin/floor-form.tsx` — create/edit
4. Integrate into facility detail page as "Associated Floors" section

**Files to Update:**
- `src/server/api/routers/floor.ts`
- `src/components/admin/facility-detail-panel.tsx` (add floors section)
- `src/lib/schemas/facility.ts` (add floor schemas)

**Tests:** Create floor under facility → appears in list with correct sort order. Edit → persists. Delete → removes desks.

---

### Phase 4.5: Departments + Booking Restrictions + Availability Shifts
**Goal:** Create reusable restriction groups and per-desk availability shifts with multi-day/multi-restriction mapping.

**Changes:**
1. Create router `src/server/api/routers/restriction.ts`:
   - `listDepartments: orgProcedure`
   - `createDepartment: facilityAdminProcedure`
   - `updateDepartment: facilityAdminProcedure`
   - `deleteDepartment: facilityAdminProcedure` (soft-delete if used by restrictions)
   - `listRestrictions: facilityAdminProcedure` (org-scoped)
   - `createRestriction: facilityAdminProcedure` (Zod schema: name, rules[], AND/OR logic)
   - `updateRestriction: facilityAdminProcedure`
   - `deleteRestriction: facilityAdminProcedure`
   - `validateRestrictionForUser: query` — check if occupant matches restriction (async server-side validation)
2. Create UI:
   - `src/components/admin/restriction-builder.tsx` — visual rule editor (department, email, user fields)
   - `src/components/admin/restriction-list.tsx` — list with edit/delete
3. Create router extensions `src/server/api/routers/desk.ts` (new):
   - `listAvailabilityShifts: query(deskId)`
   - `createAvailabilityShift: facilityAdminProcedure` (name, daysOfWeek, restrictionId, advanceWindow)
   - `updateAvailabilityShift: facilityAdminProcedure`
   - `deleteAvailabilityShift: facilityAdminProcedure`
4. Add Zod schemas:
   - `src/lib/schemas/restriction.ts`
   - `src/lib/schemas/desk.ts`

**Files to Create:**
- `src/server/api/routers/restriction.ts`
- `src/server/api/routers/desk.ts`
- `src/components/admin/restriction-builder.tsx`
- `src/components/admin/restriction-list.tsx`
- `src/lib/schemas/restriction.ts`
- `src/lib/schemas/desk.ts`

**Files to Update:**
- `src/server/api/root.ts` (add routers)
- Booking validation logic in `src/server/booking/create-booking.ts` (enforce restriction + shift rules)
- Seed data (add sample departments + restrictions)

**Tests:** Create restriction → verify reusable. Assign to multiple desks' availability shifts. Book with occupant that doesn't match restriction → should fail with clear message. Match occupant → should succeed.

---

### Phase 4.6: Editing Platform Improvements + Floor-Plan Upload
**Goal:** Draft/live floor-plan editor, floor-plan file upload, PDF→PNG conversion, object (desk/room/utility) placement.

**Changes:**
1. Create router extension for floor-plan versioning:
   - `uploadFloorPlan: facilityAdminProcedure` (multipart file, PDF/PNG/JPG)
   - `renderPdfFirstPage: internal helper` (already exists; use it)
   - `publishFloorPlan: facilityAdminProcedure` (promote draft to live)
   - `revertFloorPlan: facilityAdminProcedure` (rollback to previous live)
   - `getDraftFloorPlan: facilityAdminProcedure` (current draft for editing)
   - `saveDraftFloorPlan: facilityAdminProcedure` (update draft metadata)
2. Update UI:
   - `src/app/(app)/admin/editor/page.tsx` — replace placeholder
   - `src/components/admin/editor/floor-selector.tsx` — facility + floor picker
   - `src/components/admin/editor/floor-plan-uploader.tsx` — file upload + PDF preview
   - `src/components/admin/editor/canvas.tsx` — extend existing Konva canvas for admin mode (add mode toggle)
   - `src/components/admin/editor/object-properties.tsx` — panel to edit selected desk/room/utility/label properties
   - `src/components/admin/editor/publish-controls.tsx` — draft/live tabs, publish/revert buttons
3. Extend Konva canvas to support:
   - Object creation (click to place, drag to position)
   - Object selection + property edit
   - Bulk desk creation (paste desk names, then place on canvas)
4. Storage abstraction already exists; use it for floor plans

**Files to Create:**
- `src/components/admin/editor/floor-selector.tsx`
- `src/components/admin/editor/floor-plan-uploader.tsx`
- `src/components/admin/editor/canvas-admin.tsx` (admin editing mode)
- `src/components/admin/editor/object-properties.tsx`
- `src/components/admin/editor/publish-controls.tsx`

**Files to Update:**
- `src/app/(app)/admin/editor/page.tsx`
- `src/server/api/routers/floor.ts` (add upload/publish endpoints)
- `src/components/floor-map/floor-canvas.tsx` (add admin mode)

**Tests:** Upload PDF → converts to PNG, displays on canvas. Place desk → persists coordinates. Publish → moves to live. Revert → restores previous.

---

### Phase 4.7: Users Management Page + Permission Assignment
**Goal:** Full user management UI, role changes, department assignment, facility/floor permissions.

**Changes:**
1. Extend user router `src/server/api/routers/user.ts`:
   - `list: facilityAdminProcedure` (all users if ORG_SUPER_ADMIN; users of assigned facilities if FACILITY_ADMIN)
   - `get: facilityAdminProcedure(userId)` → user profile + permissions
   - `update: facilityAdminProcedure` (role, department, phone, timezone, active status)
   - `assignFacilityPermission: facilityAdminProcedure` (add user to facility)
   - `revokeFacilityPermission: facilityAdminProcedure` (remove user from facility)
   - `listPermissions: query(userId)` — user's facility assignments
   - `assignDelegateTarget: bookingManagerProcedure` (Booking Manager assigns delegable users)
2. Create UI:
   - `src/app/(app)/admin/users/page.tsx` — replace placeholder
   - `src/components/admin/user-list.tsx` — searchable table (name, email, dept, role, last login, active)
   - `src/components/admin/user-detail-panel.tsx` — full profile (basic info, role, permissions, booking history)
   - `src/components/admin/user-form.tsx` — edit profile form
   - `src/components/admin/permission-selector.tsx` — facility/floor permission multi-select
3. Add Zod schema:
   - `src/lib/schemas/user.ts`

**Files to Create:**
- `src/components/admin/user-list.tsx`
- `src/components/admin/user-detail-panel.tsx`
- `src/components/admin/user-form.tsx`
- `src/components/admin/permission-selector.tsx`
- `src/lib/schemas/user.ts`

**Files to Update:**
- `src/app/(app)/admin/users/page.tsx`
- `src/server/api/routers/user.ts`

**Tests:** Change user role → verify backend enforces it. Assign user to facility → can now book there. Revoke → loses access.

---

### Phase 4.8: Desk Management + Attributes
**Goal:** Full desk CRUD, attributes (standing desk, etc.), availability shifts per desk.

**Changes:**
1. Extend desk router `src/server/api/routers/desk.ts`:
   - `create: facilityAdminProcedure` (single or bulk)
   - `update: facilityAdminProcedure`
   - `delete: facilityAdminProcedure`
   - `list: query(floorId)` (all desks on floor with attributes + availability shifts)
   - `createAttribute: facilityAdminProcedure` (add attribute to desk)
   - `deleteAttribute: facilityAdminProcedure`
2. Create UI:
   - `src/components/admin/desk-list.tsx` — table with CRUD
   - `src/components/admin/desk-form.tsx` — edit form (name, active, requiresCheckIn, spaceType, attributes, availability shifts)
   - `src/components/admin/availability-shift-form.tsx` — create/edit shift (days, restriction, advance window)
3. Integrate bulk desk creation into editor (Phase 4.6)

**Files to Update:**
- `src/server/api/routers/desk.ts`
- `src/components/admin/editor/object-properties.tsx` (reuse desk form)

**Tests:** Create desk → verify appears on floor. Add attributes → persists. Create availability shift (Mon/Wed Editorial, Tue/Thu Credit) → verify booking respects it.

---

### Phase 4.9: Floor-Map UX Upgrade + Admin Booking Capabilities
**Goal:** Enhanced desk detail panel showing restrictions, availability, bookings; admin can book on behalf of others.

**Changes:**
1. Update floor-map desk panel:
   - Show desk name, status (available/booked/restricted/inactive)
   - Show booking form:
     - Standard user: occupant is auto-filled (self)
     - Booking manager: occupant is user selector
     - Admin: occupant is user selector
   - Show "Restrictions on This Desk" (visual list of shifts + restrictions + days)
   - Show "Today's Bookings" → expand to "Desk Calendar" (view other dates)
   - Show location (floor, facility, attributes/amenities)
2. Enhance booking form validation display:
   - If user not eligible on selected day → show "Not eligible today. This desk is restricted to Editorial on Mondays."
   - If desk already booked → show occupant name (if privacy setting allows), time
   - If advance booking window exceeded → show "Booking must be within 30 days"
3. Admin booking management:
   - From desk detail panel: "Cancel" button (with confirmation) visible to admins for others' bookings
   - Update cancel endpoint to verify admin scope before allowing
4. Integrate "My Bookings" page cancellation logic

**Files to Update:**
- `src/components/booking/desk-panel.tsx`
- `src/components/booking/book-a-desk-view.tsx`
- `src/components/booking/subject-fields.tsx` (update to support occupant selector for booking managers)
- `src/server/booking/create-booking.ts` (add restriction + shift validation at booking time)
- `src/server/booking/cancel-booking.ts` (verify admin scope)
- `src/app/(app)/bookings/page.tsx` (admin can cancel others' bookings from here)

**Tests:** Book as standard user → occupant locked to self. Book as booking manager → occupant selector works. Book outside advance window → rejected. Restricted desk with occupant from ineligible dept on restricted day → rejected with message.

---

### Phase 4.10: Integration Testing + Acceptance Cases
**Goal:** Verify all 16 acceptance test cases from phase4.md work end-to-end.

**Tests to Run:**
- CASE 1: Standard User manually visits /users → 403/redirect ✅
- CASE 2: Standard User manually visits /admin/editor → 403/redirect ✅
- CASE 3: Org Super Admin creates London → Level 5 → Desk 5.52 → all persist after refresh ✅
- CASE 4: Org Super Admin creates "Editorial Only" restriction ✅
- CASE 5: Desk 5.52 has Mon/Wed "Editorial Only", Tue/Thu "Credit & Equities", Fri "Anyone" ✅
- CASE 6: Editorial employee books Wednesday → allowed ✅
- CASE 7: Editorial employee books Thursday → rejected with message ✅
- CASE 8: Credit & Equities employee books Thursday → allowed ✅
- CASE 9: Finance employee books Friday → allowed ✅
- CASE 10: Standard User calls cancel API for someone else's booking → 403 ✅
- CASE 11: Facility Admin (London) cancels London booking → allowed ✅
- CASE 12: Facility Admin (London) cancels New York booking → 403 ✅
- CASE 13: Org Super Admin cancels New York booking → allowed ✅
- CASE 14: Booking Manager books for another eligible user → occupant/createdBy correct ✅
- CASE 15: Booking Manager books restricted desk for ineligible user → fails based on occupant's dept ✅
- CASE 16: Select desk → panel shows name, status, booking form, restrictions, bookings, calendar, location ✅

**Files to Create/Update:**
- `src/server/booking/__tests__/phase4-acceptance.test.ts` — comprehensive test suite
- Run through UI manually (no real browser, but verify DB state after each action)

---

## Execution Order (Recommended)

1. **Start branch:** `git checkout -b phase/4-admin-facilities`
2. **4.1:** Add schema → migrate → seed
3. **4.2:** Update RBAC, auth helpers
4. **4.3:** Site CRUD + UI
5. **4.4:** Floor CRUD + UI
6. **4.5:** Departments + Restrictions + Availability Shifts
7. **4.6:** Editing Platform improvements
8. **4.7:** Users management
9. **4.8:** Desk management + attributes
10. **4.9:** Floor-map UX + admin booking
11. **4.10:** Integration tests + acceptance cases
12. **PR Review:** Create PR to main, wait for approval before Phase 5

---

## File Changes Summary

### New Routers
- `src/server/api/routers/facility.ts`
- `src/server/api/routers/restriction.ts`
- `src/server/api/routers/desk.ts` (extend existing)

### New Components
- Admin facility/floor/user/desk management components (estimated 15+ new files)
- Editor components (upload, object properties, publish controls, etc.)

### Updated Files
- `prisma/schema.prisma` (6 new entities, extend existing 4)
- `src/server/api/trpc.ts` (add procedures)
- `src/server/auth/roles.ts` (extend role checks)
- `src/server/booking/create-booking.ts` (add restriction validation)
- `src/components/layout/nav-items.ts` (refine role mappings)
- Booking components (desk panel, form updates)

### New Schemas (Zod)
- `src/lib/schemas/facility.ts`
- `src/lib/schemas/restriction.ts`
- `src/lib/schemas/desk.ts`
- `src/lib/schemas/user.ts`

### Tests
- `src/server/booking/__tests__/phase4-acceptance.test.ts`

---

## Known Constraints & Decisions

1. **Backwards Compat:** Phase 3 code (check-in, end-booking) stays unchanged; Phase 4 builds on top
2. **Soft Deletes:** Departments/restrictions stay in DB (soft-delete via `isActive` flag) to preserve audit history
3. **Repeating Bookings:** Schema allows it (JSON recurrence rule field), but UI/logic deferred to Phase 5 (per phase4.md)
4. **Tenant Isolation:** All Phase 4 CRUD ops scoped via `organizationId`; FACILITY_ADMIN scope re-checked on every mutation
5. **Operating Hours:** Per-day configuration (Mon 7-19, etc.) stored as discrete rows, not a cron string
6. **Advance Booking Window:** Enforced at booking-create time by comparing `(booking.date - today) < window`
7. **Floor-Plan Upload:** Relies on existing storage abstraction; PDF→PNG already exists (`renderPdfFirstPageToPng`)

---

## Phase 4 Completion Criteria

- ✅ All 16 acceptance test cases pass
- ✅ Auth helpers and role guards work correctly (re-check scope on every mutation)
- ✅ No data leakage between organizations
- ✅ Restrictions + availability shifts enforced at booking time with clear error messages
- ✅ Floor-plan editor upload/publish/revert flow works
- ✅ All admin pages fully functional (no placeholders)
- ✅ Type safety: no `any`, all tRPC inputs validated with Zod
- ✅ Tests cover authorization boundaries (standard user → 403, admin out of scope → 403, etc.)
- ✅ Existing Phase 1–3 functionality (booking, check-in, floor-map) still works

---

## Estimated Scope

- **New Lines of Code:** ~4,000–5,000 (routers + components + schemas)
- **Database Migrations:** 1 large migration
- **UI Components:** ~15–20 new files
- **Time Estimate:** 60–80 hours of focused work (9 sub-phases, each ~7–10 hours)

---

## Next Steps (Awaiting Your Approval)

1. Review this plan for alignment with your vision
2. Request changes if needed
3. Once approved, start with Phase 4.1 (schema + migrations)
