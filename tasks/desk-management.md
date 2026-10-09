# TASK: Complete Desk Management in Editing Platform

I want you to work ONLY on the desk-management functionality in the existing application during this session.

Do not work on Users, Facilities configuration, analytics, booking managers, reporting, or unrelated functionality.

The end result of this task should be:

1. Admin opens Editing Platform.
2. Admin selects a Site.
3. Admin selects a Floor.
4. The floor plan/map for that floor loads.
5. Existing desks are displayed in their saved positions.
6. Admin can create a new desk.
7. Admin can reposition desks.
8. Admin can delete desks.
9. Admin can click any desk and open a large Edit Desk modal.
10. Inside that modal, admin can edit desk information.
11. Admin can create and assign booking restrictions.
12. Admin can assign different restrictions to different day/shift combinations.
13. All changes persist to the database.
14. When a user later opens the normal Floor Map and clicks the same desk, its sidebar shows the restrictions and shifts configured by the admin.

The screenshots I provided are the visual/functionality reference.

Do not rebuild the Editing Platform from scratch if components already exist. Inspect the existing code and extend what is already implemented.

---

# 1. FIRST INSPECT THE CURRENT IMPLEMENTATION

Before changing code, inspect:

- Editing Platform page
- Editor Tools sidebar
- Site selector
- Floor selector
- current floor-plan/map component
- current desk component
- current desk coordinates implementation
- current desk database model
- current booking restriction models if any
- normal Floor Map page
- normal Floor Map desk-details sidebar

Tell me briefly what already exists and what files/models you need to change.

Then start implementing.

Do not give me only a plan. After the short inspection summary, implement the feature.

---

# 2. EDITING PLATFORM PAGE

The existing Editing Platform already has an Editor Tools sidebar similar to the screenshot.

Keep that UI.

The admin flow should be:

Editing Platform
→ Select Site
→ Select Floor
→ Floor plan loads
→ Editor Tools
→ Editors tab
→ Seats
→ Create / Edit / Delete

The Site and Floor selectors should remain visible at the top.

When the admin changes floor:

- load that floor's floor plan
- load desks belonging to that floor
- display every desk at its saved map position

Do not display desks from another floor.

---

# 3. EDITOR TOOLS SIDEBAR

Use the existing sidebar Claude already created.

It currently contains something similar to:

Editor Tools

[Select] [Edit]

Editors

Seats

+ Create
✎ Edit
🗑 Delete

Keep this basic structure.

The interaction should work as follows.

## Select mode

Used mainly for navigating/selecting desks without accidentally repositioning them.

Clicking a desk should select it.

The selected desk should have a visible selected state.

## Edit mode

Allows editing/map manipulation.

In Edit mode the admin should be able to:

- create desks
- select desks
- reposition desks
- edit desk details
- delete desks

---

# 4. CREATE A NEW DESK

Inside:

Editor Tools
→ Editors
→ Seats
→ Create

Clicking **Create** should enter desk placement mode.

Preferred behaviour:

1. Admin clicks Create.
2. A small desk/seat marker appears attached to the mouse cursor.
3. Admin clicks anywhere on the floor plan.
4. A new desk is created at that location.
5. The new desk becomes selected.
6. The Edit Desk modal opens automatically.

This is similar to the reference application.

If attaching the seat icon to the mouse cursor is significantly difficult with the existing map implementation, use this acceptable fallback:

1. Admin clicks Create.
2. A new desk marker appears around the centre of the visible floor plan.
3. It immediately becomes selected.
4. Admin can drag it to the correct position.
5. Edit Desk modal opens.

Do not make the admin manually type X/Y coordinates.

The desk position must be saved.

---

# 5. DESK POSITION / COORDINATES

Desk coordinates must persist to the database.

Do NOT only manipulate temporary CSS values.

Use coordinates relative to the floor-plan coordinate system.

For example conceptually:

desk.x
desk.y

or:

desk.positionX
desk.positionY

Prefer normalized coordinates if appropriate:

0–1 relative to map width/height

rather than browser pixel positions.

The desk should remain aligned correctly when:

- browser window is resized
- map container changes size
- user refreshes the page

After refresh, the desk must appear in the same location.

---

# 6. REPOSITIONING A DESK

While Editing Platform is in Edit mode:

Admin should be able to drag an existing desk.

Flow:

1. Admin selects/holds desk.
2. Drag desk to another map position.
3. Drop desk.
4. Save its new coordinates.

Either:

- save automatically on drop

or

- mark the layout as changed and provide Save Changes

Automatic save on drop is preferred if it fits the current architecture.

Show visual feedback while dragging.

Do not allow the normal Floor Map page to reposition desks.

Repositioning is admin Editing Platform functionality only.

---

# 7. DELETE A DESK

Admin can delete a desk using:

Editor Tools
→ Seats
→ Delete

Possible interaction:

1. Admin selects a desk.
2. Clicks Delete.
3. Confirmation modal appears.

Example:

Delete Desk 4.45?

This will remove the desk from this floor.

[Cancel] [Delete Desk]

Do not immediately delete without confirmation.

If the desk has future bookings, do not silently destroy booking data.

At minimum detect this condition.

Prefer showing:

"This desk currently has future bookings. These bookings must be cancelled or handled before the desk can be deleted."

Use whatever behaviour fits the existing booking architecture safely.

After deletion:

- remove desk from database
- remove marker from floor plan
- update UI immediately

---

# 8. CLICKING A DESK IN EDITING PLATFORM

When admin clicks a desk while editing, open a large modal similar to the supplied screenshots.

The modal should be visually close in structure to the screenshots.

Example header:

Editing Desk: 4.45

or:

Editing Seat: 4.45

Use Desk terminology consistently with the rest of our application if possible.

The modal should be large and centred.

Structure:

---------------------------------------------------
| Editing Desk: 4.45                         X    |
---------------------------------------------------
| DETAILS AREA                  | ASSETS/ATTRIBUTES |
|                               |                   |
| Basic desk info               | tabs if supported |
|                               |                   |
| Booking configuration         |                   |
| Restrictions                  |                   |
| Availability shifts           |                   |
---------------------------------------------------
|                         CANCEL | SAVE             |
---------------------------------------------------

The modal must be a real functional editing interface, not just a read-only display.

---

# 9. BASIC DESK INFORMATION

The left/details area should contain:

### Desk Name

Example:

4.45

Editable text field.

Desk names should preferably be unique within a floor.

### Current Occupant

If this concept already exists, display it.

Example:

Vacant Desk

For this task it can remain read-only if assigning permanent occupants is not currently supported.

### Department

Optional desk department.

Use an existing department relationship if already available.

Do not build the entire Department management system during this task.

### Space Type

Example:

Desk

Optional if already supported.

### Description

Text field / textarea.

Example:

Quiet desk beside the window.

### Show description on Floor Map

Optional checkbox if easy to support.

### Size

Optional field if already supported.

Do not spend significant time implementing nonessential size functionality.

---

# 10. DESK STATUS

The middle configuration area should contain:

Desk Status:

Active / Inactive

Use a toggle similar to the reference screenshot.

If inactive:

- desk remains in Editing Platform
- normal users cannot book it
- normal Floor Map should display it as unavailable/inactive

---

# 11. ASSIGN MODE

Add an Assign Mode dropdown.

For this implementation, at minimum support:

Bookable Desk (Self-service)

If other modes already exist, keep them.

Do not invent complex assignment functionality during this task.

Also support:

Require check-in

checkbox if this already exists or is straightforward.

The main focus of this task is booking restrictions.

---

# 12. BOOKINGS RESTRICTED TO

This is one of the most important parts.

Under the desk configuration show:

BOOKINGS RESTRICTED TO

Use a dropdown similar to the screenshot.

Options:

- None (Any occupant)
- Only assigned occupants
- Only people matching department
- Custom restriction by employee field

The most important option for this task is:

Custom restriction by employee field

When selected, the admin should choose a reusable restriction.

Example:

Custom restriction by employee field
[ Consulting ▼ ]

The restriction should NOT simply be hardcoded into the desk.

Restrictions should be reusable records that can be attached to many desks.

---

# 13. CUSTOM RESTRICTION DROPDOWN

When the restriction selector is opened, show a searchable dropdown similar to the screenshot.

Example:

Search...

All Forum
Benz
CEO
Consulting
Credit & Equities
Private Equities
Technology

-----------------------
See Rules for All Restrictions
Create / Manage Restrictions

The exact test names do not matter.

The important functionality is:

- searchable restriction list
- selecting a restriction
- opening restriction management
- creating a new restriction
- editing an existing restriction

---

# 14. MANAGE CUSTOM RESTRICTIONS

Clicking:

Create / Manage Restrictions

should open another modal on top of the Edit Desk modal, similar to the screenshots.

Title:

Manage Custom Restrictions

Include:

Search by restriction name or employee field

[ CREATE NEW ]

Then list restrictions.

Example:

● All Forum
Department is any of Editorial - Forum, Editorial - Community...
[EDIT] [DELETE]

● Consulting
Department is any of Consulting, European Consulting...
[EDIT] [DELETE]

● Technology
Department is any of Engineering, Product, Technology...
[EDIT] [DELETE]

Each restriction should contain:

- name
- colour
- rule summary
- edit action
- delete action

If a restriction is used by desks, deleting it should require confirmation.

Prefer warning:

"This restriction is currently assigned to 12 desks."

Do not silently delete a restriction that is actively used.

---

# 15. CREATE / EDIT CUSTOM RESTRICTION

Clicking Create New or Edit opens a restriction editor similar to the supplied screenshot.

Example:

Edit "All Forum"

Name:
[ All Forum ]

Color:
[ colour picker ]

Rules:

[ Department ▼ ] [ is any of ▼ ] [ Editorial - Forum, Editorial - Community... ]

OR

[ Email ▼ ] [ is any of ▼ ] [ user@example.com ]

+ ADD RULE

The rule builder should support at minimum:

FIELDS

- Department
- Email
- User

OPERATORS

- is
- is not
- is any of
- is not any of

LOGICAL CONNECTORS

- AND
- OR

For Department:

value field should be a searchable multi-select.

For Email/User:

value field should be a searchable multi-select populated from users if the existing user data exists.

Do not require admins to manually type IDs.

Example rule:

Department
is any of
Editorial - Forum
Editorial - Community
Editorial - Operations

OR

Email
is any of
chris@example.com

This means a user matching either rule is allowed.

---

# 16. RULE MATCH COUNT

If reasonably possible using the existing Users data, display:

124 employee records match these rules

or equivalent.

This is useful but secondary.

If implementing dynamic matching counts would significantly delay the core functionality, make the restriction engine functional first.

Do NOT fake a number.

---

# 17. RESTRICTION COLOUR

Each reusable restriction can have a colour.

Example:

All Forum = blue
Consulting = red
Private Equities = teal

Store this value.

Use it as a small visual indicator next to the restriction.

Do not rely on colour as the only way to communicate restrictions.

---

# 18. AVAILABILITY / SHIFTS

Each desk restriction must have an associated Availability Shift.

This is essential.

A desk can have different restrictions on different days.

Example:

Desk 2.21

Restriction 1:
Anyone can book
Shift:
Monday + Friday

Restriction 2:
Technology, Product & R&D
Shift:
Wednesday Only

Restriction 3:
Global Client Services - Galaxy
Shift:
Thursday Only

Restriction 4:
Anyone can book
Shift:
Tuesday Only

This is shown in the reference screenshots.

Do NOT implement one restriction permanently attached to a desk with no days.

---

# 19. SHIFT DROPDOWN

Under each restriction show:

Availability (Shifts)

with a dropdown.

The dropdown should look/function similarly to the screenshot.

Example options:

Always
No restrictions

Monday Only
Mon

Tuesday Only
Tue

Wednesday Only
Wed

Thursday Only
Thu

Friday Only
Fri

Mon & Wed
Mon, Wed

Mon & Thurs
Mon, Thu

Mon + Fri
Mon, Fri

Mon through Thurs
Mon, Tue, Wed, Thu

Mon-Fri
Mon, Tue, Wed, Thu, Fri

etc.

However, do NOT hardcode every possible combination manually if there is a cleaner model.

The shift record should conceptually contain:

name
daysOfWeek[]

Example:

{
  name: "Mon & Wed",
  daysOfWeek: ["MON", "WED"]
}

It should be possible to reuse shifts.

If the application already has a shift model, use it.

---

# 20. MULTIPLE RESTRICTIONS ON ONE DESK

The Edit Desk modal must allow multiple restriction blocks.

Example:

----------------------------------

Bookings Restricted To:
Custom restriction by employee field

Restriction:
Consulting

Availability:
Mon / Tues

Set Advance Booking Window

----------------------------------

Bookings Restricted To:
Custom restriction by employee field

Restriction:
Private Equities

Availability:
Wed / Thurs

----------------------------------

Bookings Restricted To:
None (Any occupant)

Availability:
Friday

----------------------------------

Each restriction block should have a remove/trash button.

Admin should be able to add another restriction block.

Something like:

+ ADD BOOKING RESTRICTION

if needed.

This is critical because one desk may behave differently depending on the day.

---

# 21. ADVANCE BOOKING WINDOW

Under each restriction/shift combination, include:

SET ADVANCE BOOKING WINDOW

similar to the screenshot.

It can open a simple dialog.

Example:

Advance Booking Window

Users can book this desk up to:

[ 30 ] days in advance

Save

If this adds too much complexity for this session, build the data model and UI but prioritise:

- desk editing
- restrictions
- shifts
- restriction enforcement/display

before advanced booking window behaviour.

---

# 22. SAVING THE DESK

At the bottom of the Edit Desk modal show:

CANCEL
SAVE

SAVE should persist:

- desk name
- status
- description
- department if used
- space type if used
- assignment mode
- check-in setting
- coordinates
- restriction assignments
- associated shifts
- advance booking window if implemented

Do not keep this only in React/local state.

Refresh the page after saving and verify everything remains.

---

# 23. EXPECTED DATABASE RELATIONSHIP

Adapt to the existing database rather than blindly creating duplicate models.

Conceptually we need something similar to:

Desk
  id
  floorId
  name
  positionX
  positionY
  active
  description
  departmentId?
  spaceType?
  requireCheckIn
  assignmentMode

BookingRestriction
  id
  name
  color

RestrictionRule
  id
  restrictionId
  field
  operator
  values
  logicalOperator

AvailabilityShift
  id
  name
  daysOfWeek[]

DeskRestrictionAssignment
  id
  deskId
  restrictionId OR restrictionType
  shiftId
  advanceBookingDays?

Important:

The same BookingRestriction can be used by multiple desks.

The same desk can have multiple DeskRestrictionAssignments.

Do not copy the full restriction rules directly onto every desk.

---

# 24. NORMAL FLOOR MAP

After desk management works, connect this information to the existing normal Floor Map page.

This is NOT the Editing Platform.

A normal user goes:

Floor Map
→ Select Site
→ Select Floor
→ floor map loads
→ click Desk

When the user clicks a desk, open the existing right-side desk-details panel.

Update this panel to show the restriction information saved in Editing Platform.

The reference screenshot shows a layout similar to:

Desk 2.21
X

[booking controls]

BOOK DESK

---------------------

Restricted to

Anyone can book
Shift (Mon + Fri: Mon, Fri)

Technology, Product & R&D
Shift (Wednesdays Only: Wed)

Global Client Services - Galaxy
Shift (Thursday Only: Thu)

Anyone can book
Shift (Tuesday Only: Tue)

---------------------

Today's Bookings

No upcoming bookings

SEE DESK CALENDAR

---------------------

Location

2.21
SB - Level 2
London - Steward Building

The UI does not need to be a pixel-perfect clone, but the information hierarchy and functionality should be very similar.

---

# 25. RESTRICTION DISPLAY IN FLOOR MAP

The "Restricted to" section must come from actual desk restriction data.

Do NOT hardcode example values.

For each desk restriction assignment show:

Restriction Name
Shift Name / Days

Example:

Restricted to

Consulting
Mon, Tue

Private Equities
Wed, Thu

Anyone can book
Fri

If there are no restrictions:

Restricted to

Anyone can book

Do not hide this information.

The user should understand why the desk can or cannot be booked.

---

# 26. DESK ELIGIBILITY

If booking validation already exists, integrate these restrictions.

When selecting a date for the desk:

1. Determine day of week.
2. Find the desk restriction assignment whose shift includes that day.
3. Evaluate that restriction against the occupant.
4. Show whether they are eligible.

For now the most important requirement is that the correct restriction data exists and is shown.

However, do not design this in a way that prevents backend enforcement later.

If the current booking endpoint can reasonably be updated during this task, enforce the restriction there as well.

Never rely only on frontend disabling.

---

# 27. USER EXPERIENCE FOR RESTRICTED DESKS

If user is not eligible for a selected date, show a clear message.

Example:

You cannot book this desk on Thursday.

Restricted to:
Private Equities

Available shift:
Thursday

Do not simply disable the button without explaining why.

---

# 28. DESK MAP STATES

On the normal Floor Map, preserve existing desk states.

Examples:

available
booked
selected
restricted
inactive

If possible:

Available:
normal available marker

Selected:
highlighted ring

Booked:
occupied style

Restricted:
different border/icon/state

Inactive:
greyed/unavailable

Do not redesign the entire floor map during this task.

---

# 29. EDITING PLATFORM UI FLOW — EXACT EXPECTATION

The complete flow should be:

### Existing desk

Editing Platform
→ select Site
→ select Floor
→ map appears
→ click Edit mode
→ click existing desk
→ Edit Desk modal opens
→ change desk details
→ choose Bookings Restricted To
→ choose/create reusable restriction
→ choose Availability Shift
→ optionally add second restriction
→ Save
→ close modal
→ desk remains on map
→ refresh
→ information still exists

Then:

Floor Map
→ same Site
→ same Floor
→ click same Desk
→ right sidebar shows those restrictions and shifts

---

# 30. NEW DESK UI FLOW — EXACT EXPECTATION

Editing Platform
→ select Site
→ select Floor
→ Editor Tools
→ Editors
→ Seats
→ Create

Then either:

Preferred:

cursor becomes desk placement marker
→ admin clicks map
→ new desk appears there

or acceptable fallback:

new desk appears in map centre
→ admin drags it into position

Then:

new desk selected
→ Edit Desk modal opens

Admin enters:

Desk Name
Status
Description
etc.

Then creates restrictions:

Bookings Restricted To:
Custom restriction by employee field

Restriction:
Technology

Availability:
Mon & Wed

Then:

+ Add another restriction

Restriction:
Anyone can book

Availability:
Friday

Save

After save:

- desk exists on selected floor
- map coordinates persist
- desk information persists
- restrictions persist
- shifts persist
- normal Floor Map can see the desk
- normal Floor Map sidebar shows the restriction information

---

# 31. REPOSITION FLOW

Editing Platform
→ Edit mode
→ drag desk
→ release desk
→ new coordinates save

Refresh page.

Expected:

desk stays in the new location.

Switch floor and return.

Expected:

desk stays in the new location.

---

# 32. DELETE FLOW

Editing Platform
→ Edit mode
→ select desk
→ Editor Tools
→ Seats
→ Delete

Confirmation:

Delete Desk 4.45?

Cancel | Delete Desk

After confirmation:

- delete/deactivate according to safe booking rules
- marker disappears
- database updates
- normal Floor Map no longer displays it as an available desk

---

# 32A. BULK TEAM BOOKING (BOOKING MANAGERS)

A Booking Manager must be able to book desks for several team members, on several desks and several days, in one action. Today this has to be done one booking at a time.

This builds on the restriction engine (Steps 9–14). Do not start it until those steps work.

### Who can use it

- Booking Manager: only for occupants they are delegated for (`canBookForUser` per occupant).
- System Admin: any active employee.
- Facility Admin: occupants on sites they administer, if they already have delegated booking rights there.
- Standard User: never. The server rejects the request even if the UI is bypassed.

### Inputs

Inside Book a Desk (and from the Floor Map when in bulk mode):

- **Team members**: multi-select server-side typeahead over the directory (name, email, department), limited to the actor's delegation scope. Chips show who is selected. Never send the whole directory to the client.
- **Desks**: multi-select, either by clicking several desks on the Floor Map or by ticking them in the Find Available Desks results. Desks may span one floor; spanning floors in the same site is acceptable if simple.
- **Days**: multiple dates, picked individually on a calendar and/or as a date range with chosen weekdays (e.g. "Mon–Thu, 12–23 Oct").
- **Time**: one start/end time for the whole batch, within site operating hours, in the site timezone.

### Pairing people with desks

- The number of desks must be at least the number of team members.
- Default pairing: each person keeps the same desk on every selected day, auto-paired in the order selected.
- The manager can change any pairing in a review grid (person × day → desk) before submitting.

### Preview before booking

Before anything is written, show a preview grid with one row per (team member, day, desk):

- ✓ bookable
- ✗ not bookable, with the domain reason from `evaluateDeskEligibility`, e.g. "Desk 4.45 is restricted to Technology on Wednesdays." or "Priya already has a booking on 14 Oct 09:00–17:00."

The preview uses the same eligibility service as single bookings, evaluated for each **occupant**, not the manager. The manager can remove failing rows or change their desk, then confirm.

### Server behaviour

- One mutation, e.g. `booking.createBatch`, taking occupant IDs, desk IDs, dates, time and the pairing.
- Resolve the actor from the session. Re-check authorization for every occupant and eligibility, desk conflicts and occupant double-booking for every row inside one transaction, immediately before writing.
- All-or-nothing: if any row fails at write time (e.g. someone else just took the desk), write nothing and return the failing rows with reasons so the manager can fix them and resubmit.
- Each row is a normal `Booking` (`occupantUserId` = team member, `createdByUserId` = manager). Add a nullable `batchId` to group them, as an additive migration, so the batch can be shown and cancelled together.
- Enforce a server-side cap on rows per request (a named constant, e.g. 200) and return a clear message when it's exceeded.

### After booking

- Show a summary: "12 bookings created for 4 team members across 3 days."
- Each team member sees their bookings in My Bookings as usual.
- The manager can cancel a single booking or the whole batch, with confirmation, subject to `canCancelBooking`.

---

# 33. IMPORTANT IMPLEMENTATION RULES

Do not create fake functionality.

Do not create buttons without database behaviour.

Do not use hardcoded restrictions.

Do not use hardcoded shift names on desks.

Do not use only localStorage unless the existing application intentionally uses it as part of its architecture.

Use the application's existing backend/database.

Do not rebuild the floor-map library unless absolutely necessary.

Do not rewrite unrelated pages.

Do not change the design system unnecessarily.

Do not spend this session implementing unrelated features.

---

# 34. IMPLEMENT IN THIS ORDER

Please implement this feature in this exact order.

## STEP 1
Make site → floor → floor map selection reliable.

## STEP 2
Load desks for selected floor from database.

## STEP 3
Make existing desks selectable.

## STEP 4
Make desk coordinates persistent.

## STEP 5
Implement desk repositioning.

## STEP 6
Implement Create Desk.

## STEP 7
Implement Delete Desk with confirmation.

## STEP 8
Implement large Edit Desk modal.

## STEP 9
Implement reusable custom restrictions.

## STEP 10
Implement rule builder.

## STEP 11
Implement availability shifts.

## STEP 12
Allow multiple restriction/shift combinations per desk.

## STEP 13
Persist everything.

## STEP 14
Connect restriction information to the normal Floor Map desk sidebar.

## STEP 15
Test the complete flow.

## STEP 16
Implement bulk team booking for Booking Managers (§32A): multi-occupant, multi-desk, multi-day preview and transactional batch create.

Do not jump ahead if the previous step is not functional.

---

# 35. ACCEPTANCE TESTS

Before saying the task is complete, manually or programmatically verify these scenarios.

### TEST 1 — Existing floor

Select:

Site A
Floor 2

Expected:

correct floor plan appears and only Floor 2 desks appear.

---

### TEST 2 — Create desk

Click:

Editor Tools
→ Editors
→ Seats
→ Create

Place desk on map.

Name:

2.21

Save.

Refresh.

Expected:

Desk 2.21 still exists in same location.

---

### TEST 3 — Reposition

Drag Desk 2.21 to another location.

Refresh.

Expected:

Desk remains at new location.

---

### TEST 4 — Edit desk

Click Desk 2.21.

Expected:

large Edit Desk modal opens.

Change description.

Save.

Reopen.

Expected:

description persists.

---

### TEST 5 — Create restriction

Create:

Technology

Rule:

Department
is any of
Engineering
Product
Technology

Save.

Expected:

Technology appears in reusable restriction list.

---

### TEST 6 — Assign shift

Desk 2.21:

Technology
Wednesday Only

Save.

Reopen.

Expected:

Technology / Wednesday Only still exists.

---

### TEST 7 — Multiple restrictions

Desk 2.21:

Anyone can book
Mon + Fri

Technology
Wednesday

Global Client Services
Thursday

Anyone can book
Tuesday

Save.

Refresh.

Expected:

all four assignments remain.

---

### TEST 8 — Floor Map

Open normal Floor Map.

Select same Site/Floor.

Click 2.21.

Expected sidebar:

Restricted to:

Anyone can book
Mon + Fri

Technology
Wednesday

Global Client Services
Thursday

Anyone can book
Tuesday

Data must come from database.

---

### TEST 9 — Delete

Delete a test desk.

Refresh.

Expected:

desk no longer appears.

### TEST 10 — Bulk team booking

Booking Manager Sarah is delegated for Bob, Chen and Priya.

Sarah selects Bob, Chen and Priya, desks 4.10, 4.11 and 4.12, and Tue + Wed next week, 09:00–17:00.

Desk 4.12 is restricted to Technology on Wednesdays and Priya is not in Technology.

Expected:

- preview shows 6 rows; Priya / Wed / 4.12 fails with the restriction message
- Sarah moves Priya's Wednesday to another eligible desk, or removes the row
- confirm creates the bookings in one transaction
- every booking has occupant = team member, createdBy = Sarah, same batchId
- refresh: bookings persist and appear in each person's My Bookings
- Sarah tries to include Dan, whom she is not delegated for: server rejects it
- a Standard User calling the batch mutation directly gets 403

---

# 36. DEFINITION OF DONE

Do not tell me the feature is complete simply because the UI exists.

This task is complete only when I can actually do this:

Editing Platform
→ choose site
→ choose floor
→ see floor map
→ create desk
→ move desk
→ save desk
→ refresh without losing desk
→ click desk
→ edit desk
→ create restriction
→ configure restriction rules
→ assign shift
→ add multiple restrictions
→ save
→ reopen and see persisted values
→ go to Floor Map
→ click same desk
→ see restriction and shift information
→ return to Editing Platform
→ delete/reposition desk successfully

Step 16 (bulk team booking) is done when TEST 10 passes end-to-end.

That is the scope of this task.

Focus on making this complete before moving on to any other feature.