# Desk Booking Platform — Project Specifications

## 1. Product Overview

This project is an internal workplace desk-booking platform for a company with multiple sites and floors.

The product should provide two connected experiences:

1. **Employee booking experience**
   - Find and book a desk
   - View a floor map
   - View desk restrictions before booking
   - View and cancel own bookings
   - See relevant upcoming booking information

2. **Workplace administration experience**
   - Manage sites and floors
   - Upload and maintain floor plans
   - Create, move, edit and delete desks
   - Configure reusable booking restrictions and day-based availability shifts
   - Manage workplace users, permissions and booking delegation
   - Place useful map objects such as rooms, utilities and labels

The reference recording is a behavioural and workflow reference. The application should provide similar functionality and information hierarchy, but it should remain its own product and use the design system already present in the codebase.

---

# 2. Product Principles

The application must follow these principles:

- Existing working functionality should be extended, not unnecessarily rebuilt.
- Permissions must be enforced on the server, not only by hiding UI.
- All important changes must persist to the database.
- Booking eligibility must be determined from actual workplace rules.
- Floor-plan object positions must persist and remain aligned when the viewport changes.
- Users should understand why a desk is available, unavailable or restricted.
- Admin workflows should be practical for managing many desks and employees.
- Employee data coming from HRIS should not be manually duplicated across the product.
- Authentication should be company-isolated.
- The UI should be clean, professional and consistent with the existing application.

---

# 3. Main Navigation

## Standard employee navigation

A standard employee should see:

- Home
- Floor Map
- Book a Desk
- My Bookings


A standard employee must **not** see or access:

- Editing Platform
- Facilities / Sites
- Users

## Admin navigation

Users with the correct administrative permissions can additionally see:

- Editing Platform
- Facilities / Sites
- Users

## Booking Manager

A Booking Manager receives delegated booking functionality inside the employee booking experience but does not automatically gain workplace configuration permissions.

---

# 4. Home Page

The Home page should be deliberately simple.

It should contain relevant workplace information only, such as:

- Greeting / employee name
- Today's booking, if one exists
- Next upcoming booking
- Basic booking summary if useful
- Primary **Book a Desk** button
- Optional shortcut to My Bookings

Do **not** build:

- workplace announcements
- a second full floor map
- a floor-map preview duplicating the Floor Map page
- analytics dashboards on Home

The dedicated Floor Map page is the only place where the full interactive floor map is required.

---

# 5. Authentication

## 5.1 Microsoft Entra ID

Microsoft Entra ID should be the primary company sign-in method.

Requirements:

- Company-isolated Entra tenant
- Only users from the configured company tenant should authenticate
- Match the authenticated user to an existing employee record using work email and/or Entra object identifier
- No unrestricted public Microsoft account login
- No automatic public account creation

A valid Entra login does not automatically grant admin permissions. Application roles remain controlled by the application's user/permission records.

## 5.2 Company email + password

Also support email/password authentication for approved company employees.

Requirements:

- No public self-registration
- User must already exist in the employee/user directory
- Email must be an approved company email
- Passwords must be securely hashed
- Password reset should use a secure token flow
- Rate-limit login attempts
- Sessions must be secure
- Disabled/inactive employees cannot authenticate

## 5.3 Identity matching

Employee identity should be based on stable identifiers where available:

1. HRIS employee ID
2. Entra object ID
3. Verified company work email

Email changes must not accidentally create duplicate employees when a stable HRIS identifier exists.

---

# 6. Employee Directory / HRIS Sync

Employees are primarily sourced from an HRIS data sheet.

The application should support importing/syncing employee information from CSV/XLSX or an equivalent HRIS export.

## 6.1 HRIS-owned fields

Typical fields include:

- Employee ID
- First name
- Last name
- Display name
- Work email
- Department
- Job title
- Phone
- Manager
- Office/location
- Employment status
- Start date if available
- End date if available
- Other company employee fields present in the data source

The model should be extensible so additional HRIS fields can be added later.

## 6.2 App-owned fields

Do not overwrite app-owned values during HRIS sync:

- Application role
- Site permissions
- Floor permissions
- Booking delegation settings
- Local application preferences
- Authentication configuration
- Admin flags
- Audit history

## 6.3 Sync behaviour

A sync should:

1. Parse the uploaded data.
2. Validate required fields.
3. Match existing employees primarily by employee ID, then email if necessary.
4. Create missing employees.
5. Update HRIS-owned employee data.
6. Avoid duplicate users.
7. Report rows that failed validation.
8. Preserve application permissions.
9. Optionally mark employees inactive if they no longer appear in an authoritative full export.

Prefer an import preview showing:

- employees to create
- employees to update
- employees unchanged
- invalid records
- employees potentially to deactivate

Do not silently destroy employee records.

---

# 7. Roles and Access Control

For this product, use a simpler role model than the reference application.

Core roles:

- `SYSTEM_ADMIN`
- `FACILITY_ADMIN`
- `BOOKING_MANAGER`
- `STANDARD_USER`

An inactive/no-access state should be handled separately rather than creating unnecessary role complexity.

---

## 7.1 System Admin

A System Admin can manage the entire system.

Capabilities:

- Manage all sites
- Manage all floors
- Manage all floor plans
- Access the Editing Platform for every floor
- Create, move, edit and delete desks
- Manage utilities, rooms/spaces, labels and other supported map objects
- Create reusable booking restrictions
- Create availability shifts
- Manage every user
- Change roles
- Assign site/floor permissions
- Configure Booking Managers/delegates
- View bookings across all sites
- Cancel any eligible booking
- Book on behalf of another user
- Manage system-wide configuration

---

## 7.2 Facility Admin

A Facility Admin only manages their assigned workplace scope.

Capabilities within assigned sites/floors:

- Open Facilities / Sites
- Open Editing Platform
- Edit floor plans
- Create/move/edit/delete desks
- Manage restrictions
- Manage supported floor objects
- View relevant employees
- Manage permitted employee floor access if allowed by policy
- View bookings in their scope
- Cancel bookings in their scope

A Facility Admin must not:

- Manage sites/floors outside their permission scope
- Grant themselves new facilities
- Promote themselves to System Admin
- Edit users outside their permitted scope without explicit authorization

---

## 7.3 Booking Manager

A Booking Manager is a delegated booking role.

Capabilities:

- Book a desk for themselves
- Search/select another employee as occupant
- Book on behalf of employees they are authorized to manage
- View/cancel delegated bookings where permitted

A Booking Manager does **not** automatically receive:

- Editing Platform
- Facilities / Sites
- User administration
- Floor-plan editing

Restriction evaluation must use the **occupant**, not the person making the booking.

---

## 7.4 Standard User

A Standard User can:

- View permitted sites/floors
- View floor maps
- View desk availability/restrictions
- Book an eligible desk for themselves
- View their bookings
- Cancel their own eligible future bookings

A Standard User cannot:

- Book as another employee
- Cancel another employee's booking
- Edit desks
- Edit floor plans
- Manage restrictions
- Manage facilities
- Manage users
- Access admin routes

---

# 8. Facilities / Sites

Facilities / Sites define the physical workplace hierarchy.

Relationship:

```text
Site
└── Floor
    └── Floor Plan
        ├── Desks
        ├── Utilities
        ├── Rooms / Spaces
        ├── Neighborhoods / Areas
        └── Labels
```

---

## 8.1 Sites list

The Facilities / Sites page should show a searchable list/table.

Useful columns:

- Site name
- Address / city
- Country
- Timezone
- Number of floors
- Active/inactive state

System Admin sees all sites.

Facility Admin sees only sites they manage.

---

## 8.2 Create / edit site

Required or useful fields:

- Site name
- Address line
- City
- State/region
- Postal code
- Country
- Timezone
- Units: metric / imperial
- Description
- Active/inactive
- Optional image

Example:

```text
Name: London - Steward Building
Address: 12 Steward Street
City: London
Postal code: E1 6FQ
Country: United Kingdom
Timezone: Europe/London
Units: Metric
```

---

## 8.3 Operating days and hours

Each site should have workplace operating hours.

Example:

```text
Monday       07:00 - 19:00
Tuesday      07:00 - 19:00
Wednesday    07:00 - 19:00
Thursday     07:00 - 19:00
Friday       07:00 - 19:00
```

Support:

- Working/non-working days
- Opening time
- Closing time
- Calendar start day if required
- Site timezone

Bookings must respect site timezone and operating hours.

---

## 8.4 Coworker booking visibility

Site-level option:

**Allow employees to see coworkers' future desk bookings**

If enabled:
- employee names may be displayed on future bookings

If disabled:
- standard users see the desk as unavailable/booked without unnecessary identity disclosure

Admins may still see booking details required for administration.

---

# 9. Floors

A floor belongs to exactly one site.

Admin can:

- Create floor
- Edit floor
- Delete floor
- Activate/deactivate floor
- Change display order
- Transfer a floor to another site where authorized

Useful fields:

- Site
- Floor name
- Description
- Active/inactive
- Display order
- Optional floor area
- Directory/bookable visibility

Example:

```text
Site: London - Steward Building
Floor name: SB - Level 5
```

After creation, a floor should immediately appear in the Editing Platform floor selector.

---

# 10. Floor Plan Management

Each floor can have a floor plan.

Supported formats should include:

- PNG
- JPG/JPEG
- SVG where supported safely
- PDF if the existing stack can render/convert it reliably

Admins should be able to:

- Upload floor plan
- Replace floor plan
- View current floor plan
- Adjust scale/offset only if the current map implementation requires it

Replacing a floor plan must not silently destroy desk/resource data.

Floor-plan coordinates should remain based on a stable coordinate system.

---

# 11. Editing Platform

The Editing Platform is the administrative visual editor for a floor.

Flow:

1. Admin opens Editing Platform.
2. Selects Site.
3. Selects Floor.
4. Floor plan loads.
5. Existing objects load in saved positions.
6. Admin enters Edit mode.
7. Admin creates, selects, repositions, edits or deletes workplace objects.
8. Changes persist.

The existing Editor Tools sidebar should be retained and expanded rather than replaced unnecessarily.

---

# 12. Editor Tools

Core categories:

- Seats / Desks
- Utilities
- Rooms & Spaces
- Neighborhoods / Areas
- Floor Labels
- Floor Plan

A simplified first implementation can prioritize Seats while preserving an architecture that supports all categories.

---

# 13. Desk Creation

From:

```text
Editing Platform
→ Editor Tools
→ Editors/Edit
→ Seats
→ Create
```

Preferred flow:

1. Admin clicks Create.
2. A small desk marker follows the pointer.
3. Admin clicks the floor plan.
4. Desk is created at that position.
5. Desk becomes selected.
6. Edit Desk modal opens.

Acceptable fallback:

1. Click Create.
2. New desk appears near the centre of the visible map.
3. Desk is selected.
4. Admin drags it into position.
5. Edit Desk modal opens.

Do not require manual X/Y entry.

Desk names should be unique within a floor.

Support future bulk creation by pasting multiple desk names.

---

# 14. Desk Positioning

Desk positions must persist.

Prefer normalized floor-plan coordinates:

```text
x = 0.0 .. 1.0
y = 0.0 .. 1.0
```

or another stable coordinate model tied to the floor plan.

Do not persist only browser pixel/CSS positions.

The desk must remain aligned after:

- Refresh
- Browser resize
- Returning to the floor later
- Changing map zoom

---

# 15. Desk Repositioning

In Editing Platform Edit mode:

1. Admin selects/holds desk.
2. Drag to new location.
3. Drop.
4. Persist new coordinates.

Save automatically on drop if safe, or maintain an explicit Save Changes state.

Normal Floor Map users must never be able to reposition desks.

---

# 16. Desk Deletion

Flow:

```text
Editing Platform
→ select desk
→ Seats
→ Delete
→ confirmation
```

Example confirmation:

```text
Delete Desk 4.45?

This will remove the desk from this floor.

Cancel | Delete Desk
```

If future bookings exist, do not silently destroy them.

Prefer one of:

- block deletion until future bookings are handled
- deactivate/archive desk
- explicitly cancel bookings through an administrator-confirmed flow

Booking records should remain auditable.

---

# 17. Edit Desk Modal

Selecting a desk in Editing Platform should open a large modal similar in information hierarchy to the reference recording.

Header example:

```text
Editing Desk: 4.45
```

Core sections:

- Details
- Booking configuration
- Restrictions
- Availability shifts
- Assets
- Attributes

Footer:

- Cancel
- Save

---

## 17.1 Desk details

Support:

- Desk name
- Active/inactive
- Current occupant if applicable
- Department if applicable
- Space type
- Description
- Optional size
- Assignment mode
- Require check-in
- Assets
- Attributes/features

Example attributes:

- Standing desk
- Dual monitors
- Single monitor
- Docking station
- Accessible desk
- Near window

These attributes can later be used as Book a Desk filters.

---

# 18. Desk Assignment Mode

At minimum support:

- Bookable Desk / Self-service

The data model may support future assignment modes, but do not add unnecessary workflows now.

Optional:

- Require check-in

If enabled, the booking lifecycle may later include check-in/auto-release behaviour.

---

# 19. Booking Restrictions

Desk booking restrictions are reusable rule sets.

Do **not** store one free-text department restriction directly on each desk.

A desk can have multiple restriction + shift assignments.

Restriction modes:

1. Anyone can book
2. Only assigned occupants
3. Only people matching desk department
4. Custom restriction by employee field

---

# 20. Reusable Custom Restrictions

Examples:

- All Forum
- Consulting
- Credit & Equities
- Private Equities
- Technology, Product & R&D

Each restriction should contain:

- Name
- Display colour
- One or more rule rows
- Logical connectors
- Audit metadata

A reusable restriction may be assigned to many desks.

---

# 21. Restriction Rule Builder

A custom restriction editor should support a UI similar to:

```text
Name: All Forum
Color: [picker]

Rules:

[ Department ▼ ] [ is any of ▼ ] [ Editorial - Forum, Editorial - Community ... ]

OR

[ Email ▼ ] [ is any of ▼ ] [ employee@company.com ]

+ Add Rule
```

Minimum rule fields:

- Department
- Email
- User
- Job title if available from HRIS

The implementation should be extensible to additional HRIS fields later.

Minimum operators:

- is
- is not
- is any of
- is not any of
- is empty
- is not empty

Logical connectors:

- AND
- OR

Values should use searchable selects populated from real HRIS/user data.

Do not require admins to type internal database IDs.

---

# 22. Restriction Match Count

Where practical, display a live matching employee count, for example:

```text
124 employee records match these rules
```

Do not display fake counts.

This is useful but secondary to having a correct restriction engine.

---

# 23. Availability Shifts

A restriction applies on selected days through an availability shift.

Example reusable shifts:

```text
Always
Mon-Fri

Monday Only
Mon

Wednesday Only
Wed

Mon & Wed
Mon, Wed

Mon + Fri
Mon, Fri

Mon through Thurs
Mon, Tue, Wed, Thu
```

Underlying model:

```text
AvailabilityShift
- id
- name
- daysOfWeek[]
- optional startTime
- optional endTime
```

Do not hardcode every possible combination if a reusable shift model is cleaner.

---

# 24. Multiple Restriction/Shift Assignments Per Desk

This is a core product rule.

One desk can behave differently on different days.

Example:

```text
Desk 2.21

Anyone can book
Shift: Monday + Friday

Technology, Product & R&D
Shift: Wednesday Only

Global Client Services - Galaxy
Shift: Thursday Only

Anyone can book
Shift: Tuesday Only
```

Conceptually:

```text
Desk
└── DeskRestrictionAssignment[]
    ├── restriction
    ├── shift
    └── advanceBookingWindow
```

A desk must support multiple assignments.

---

# 25. Advance Booking Window

Each desk restriction/shift assignment may optionally define how far in advance it can be booked.

Example:

```text
Users can book this desk up to 30 days in advance.
```

Store this as structured data.

If not configured, fall back to site/system default.

---

# 26. Utilities

The Editing Platform should support map utilities.

Examples:

- Reception
- Printer
- Kitchen/pantry
- Phone room
- First aid
- Eye wash station
- Restroom/WC
- Recycling
- Lift/elevator
- Stairs
- Lockers

Flow:

```text
Editor Tools
→ Utilities
→ Create
→ choose utility icon/type
→ place on floor
→ save
```

Utilities are informational map objects and are not desk bookings.

---

# 27. Rooms & Spaces

Admins should be able to draw/create room/space areas.

Useful fields:

- Name
- Department
- Space type
- Room category
- Description
- Public/visible state
- Optional image
- Assets/attributes

Examples:

- Meeting room
- Phone room
- Collaboration room
- Training room

For v1, room placement/editing is in scope. Full meeting-room reservation functionality is not required unless already implemented.

---

# 28. Neighborhoods / Areas

The reference flow includes grouped areas/neighborhoods.

A neighborhood can represent a collection of desks associated with a team or workplace group.

Useful data:

- Name
- Colour
- Optional image
- Description
- Included desks
- Members

Members can be:

- manually selected employees
- matched by employee rules, such as Department or Title

This feature can follow desk management in implementation priority, but the map/object model should not prevent it.

---

# 29. Floor Labels

Admins can place text labels on the floor plan.

Examples:

- Reception
- Finance
- Quiet Zone
- Level 4

Labels should have:

- Text
- Position
- Optional style/size
- Visibility

Positions must persist like other map objects.

---

# 30. Normal Floor Map

The normal Floor Map is for employees and booking.

Flow:

```text
Floor Map
→ Select Site (dropdown)
→ Select Floor (dropdown, floors of the selected site)
→ Select date/time where applicable
→ floor plan loads
→ click desk
→ desk detail sidebar opens
```

The Floor Map also accepts a deep link (`/floor-map?site=&floor=&desk=&date=&start=&end=`), used by "locate on map" in My Bookings: the map opens on that site/floor/date/time, selects the desk, opens its detail panel and marks it with a pulsing ring until the viewer picks another desk. `?person=` opens a colleague's card instead. Malformed parameters fall back to the defaults.

## 30.1 Search

The top bar carries a search box available to every user on every page:

- Typing a desk number (or desk name) lists matching desks across all sites, with their site and floor. Picking one opens the Floor Map on that site/floor, selects the desk, opens its detail panel and highlights it.
- Typing a name (or email) lists matching active employees from the directory. Picking one opens a right-side person card: name, email, department, title, the booking in progress right now and the next upcoming booking, each with a "Locate" action that jumps to the desk. Someone without bookings shows details only.
- Results are bounded server-side searches (at most a handful per group); the directory is never sent whole. Booking details on the person card respect the site's coworker-visibility setting (§8.4) unless the viewer is that person or an admin of the site.

The map should display desk states such as:

- Available
- Booked
- Restricted / not eligible
- Selected
- Inactive

Desk states are relative to the **selected date and time window** (From/To on the Floor Map). A booking only makes a desk "Booked" while it overlaps that window: a desk booked 09:00–18:00 tomorrow is still available today, and a desk booked 16:00–18:00 today is still available before 16:00, so other employees can book the remaining times. Defaults: today → the current slot plus the next hour; any other date → the whole operating day. A desk is never marked as taken for a whole day merely because it has a booking later that day.

Do not rely on colour alone; use border/icon/tooltips/accessibility states where appropriate.

---

# 31. Desk Detail Sidebar on Floor Map

Clicking a desk opens a right-side panel.

Show:

- Desk name
- Resource type
- Date
- Start time
- End time
- Repeats
- Require check-in state if relevant
- Book Desk button
- Restrictions
- Today's bookings
- See Desk Calendar
- Location
- Desk attributes/features

Example:

```text
2.21

Date: Fri, Sep 18
Start: 9:00 AM
End: 6:00 PM
Repeats: Does not repeat

BOOK DESK

Restricted to

Anyone can book
Shift: Mon + Fri

Technology, Product & R&D
Shift: Wednesday Only

Global Client Services - Galaxy
Shift: Thursday Only

Anyone can book
Shift: Tuesday Only

Today's Bookings

No upcoming bookings

SEE DESK CALENDAR

Location
2.21
SB - Level 2
London - Steward Building
```

This data must come from the database.

---

# 32. Desk Calendar

Each desk should provide a desk calendar from the Floor Map sidebar.

Users can inspect availability/bookings across dates.

Admin visibility may include occupant details.

Standard employee visibility must respect the site's coworker booking privacy setting.

---

# 33. Book a Desk

The dedicated Book a Desk flow should support:

- Occupant
- Site/location
- Floor if useful
- Date
- Start time
- End time
- Features
- Repeats
- Find Available Desks

For Standard User:

- Occupant = current user
- Occupant cannot be changed

For Booking Manager/System Admin as permitted:

- Occupant is searchable: a server-side typeahead over the employee directory (name, email, department). Only employees that exist in the system can be selected; the full directory is never sent to the client.
- Restriction checks use the selected occupant
- Guests are free text (they need not exist in the system) and may only be booked into desks that carry no people-based restriction at all — no department, assigned-occupant or custom block on any day, and not an assigned desk. Day-based "Anyone" shifts still apply. The server rejects a guest booking on any other desk with an explanatory message, and Find Available Desks / eligibility checks evaluate for the guest when that mode is selected.

---

# 34. Find Available Desks

The result set should only include desks that are:

- Active
- On a floor the occupant can access
- Available on the requested date/time
- Within site operating hours
- Within advance-booking window
- Eligible under the applicable restriction/shift
- Not already booked for an overlapping time

Useful optional ranking:

- Previously booked desks
- Assigned/preferred area
- Matching requested features

---

# 35. Recurring Bookings

Structure booking data to support:

- Does not repeat
- Selected recurring weekdays
- Recurrence end date

If recurring booking is not yet implemented, the schema should not make it difficult to add.

Each generated occurrence still needs conflict/restriction validation.

---

# 36. Booking Validation

The server must validate bookings in this order or equivalent:

1. User is authenticated.
2. Occupant exists and is active.
3. Actor is permitted to book for occupant.
4. Desk exists.
5. Desk is active.
6. Occupant can access the desk's site/floor.
7. Requested time is valid in the site's timezone.
8. Requested time is within site operating hours.
9. Determine day of week.
10. Find applicable desk restriction/shift assignment.
11. Evaluate restriction against the occupant.
12. Validate advance-booking window.
13. Check overlapping desk booking.
14. Check occupant booking conflicts if required by product policy.
15. Create booking transactionally.

Return clear errors.

Example:

```text
This desk is restricted to Technology, Product & R&D on Wednesdays.
```

Do not return only generic "booking failed" errors.

---

# 37. My Bookings

My Bookings should support:

- Upcoming
- Past / History

Useful display:

- Desk
- Site
- Floor
- Date
- Start/end time
- Status
- Check-in status if implemented
- Locate on map: an upcoming booking's desk links to the Floor Map, which opens on that site/floor/date/time with the desk highlighted and its details shown

Standard User can cancel only their own eligible future bookings.

Booking Manager can cancel delegated bookings only within permitted scope.

Admins can cancel bookings within their administrative scope.

---

# 38. Booking Cancellation

Store booking history instead of hard-deleting important records.

Recommended statuses:

- CONFIRMED
- CANCELLED
- COMPLETED
- NO_SHOW if check-in is later implemented

Cancellation metadata:

- cancelledAt
- cancelledByUserId
- cancellationReason optional

System Admin:
- can cancel any booking

Facility Admin:
- can cancel bookings within assigned sites/floors

Standard User:
- can cancel own eligible bookings only

**End Booking** releases a desk whose booking is already in progress (confirmed or checked in) before its scheduled end; the booking becomes COMPLETED and the action is audited with the actor. The same scope applies: the occupant/creator, a System Admin, or a Facility Admin of the desk's site. A booking that has not started is cancelled, not ended.

On the Floor Map desk panel every employee can see who holds a desk for the selected time (name, email, department, title, and who booked on their behalf), subject to the site's coworker-visibility setting (§8.4). Cancel / End Booking buttons are only offered to actors the server says may manage that booking, and the mutations re-check on the server regardless.

All checks must be server-side.

---

# 39. Users Page — Combined Employee + Permission Management

Do not create separate "People Manager", "Insights People" and "Admin Users" pages.

Use one **Users** area.

The Users page combines:

- employee directory
- HRIS-synced employee details
- application roles
- workplace permissions
- booking delegation
- booking history/context

---

# 40. Users List

Useful columns:

- Name
- Work email
- Employee ID
- Department
- Job title
- Role
- Timezone
- Permission scope
- Activity / last login
- Authentication/SSO state
- Active/inactive

Filters:

- Name
- Email
- Department
- Title
- Role
- Site
- Floor
- Active/inactive

System Admin sees all employees.

Facility Admin sees employees relevant to their authorized workplace scope according to policy.

---

# 41. User Details

Selecting a user opens a user details/edit view.

## HRIS details

Read-mostly fields sourced from HRIS:

- Employee ID
- First name
- Last name
- Email
- Department
- Job title
- Phone
- Manager
- Workplace/location
- Employment state

These fields should normally be changed through the HRIS sync rather than manually in the desk-booking app.

## App-managed details

Editable by authorized admins:

- Application role
- Timezone override if needed
- Active/no-access state
- Associated sites
- Associated floors
- Delegate / Booking Manager settings
- Booking permissions
- Recent/upcoming bookings
- Booking history
- Authentication linkage if needed

Show last login/activity where available.

---

# 42. Associated Floor Permissions

User access must be relational, not stored as comma-separated text.

Examples:

```text
UserSitePermission
UserFloorPermission
```

Rules:

- System Admin automatically has all sites/floors
- Facility Admin receives assigned workplace scope
- Booking Manager can be scoped
- Standard User can receive one or more bookable sites/floors

A user must not be able to book a desk on a floor they are not authorized to use.

Implementation note (Users management, Sept 2026): site scope is the `Permission` table
(`userId`, `siteId`, `type`). `type` is `FACILITY_ADMIN` (Facility Admin manages the site) or
`BOOK_FOR_OTHERS` (Booking Manager may book on behalf of others there). System Admins hold no rows —
the role grants every site. Changing a user's role removes rows the new role can't use. The stored
role enum keeps its original values: `ORG_SUPER_ADMIN` is shown as System Admin and `SITE_ADMIN` as
Facility Admin (see `src/lib/roles.ts`). Standard Users currently book at any site; per-site bookable
access for Standard Users is not yet implemented.

---

# 43. Delegate / Booking Manager Assignments

The Users page should support booking delegation.

Example:

```text
Alice may book on behalf of:
- Bob
- Charlie
```

or the inverse, depending on UI design.

Store a relation such as:

```text
DelegateAssignment
- delegateUserId
- occupantUserId
- optional site/floor scope
```

When a delegated booking is created:

```text
occupantUserId = person using the desk
createdByUserId = person making the booking
```

These fields must remain separate.

---

# 44. Department Data

Departments are structured entities because booking rules depend on them.

Do not repeatedly compare uncontrolled free-text strings in booking logic.

Recommended:

```text
Department
- id
- externalHrisId optional
- name
- active
```

Users link to Department.

Restriction rules reference Department IDs.

---

# 45. Suggested Core Data Model

Adapt this to the existing schema. Do not blindly duplicate models that already exist.

Likely entities:

```text
User
Department
Site
Floor
FloorPlan
Desk
DeskAttribute
DeskAsset
Utility
RoomSpace
Neighborhood
FloorLabel
AvailabilityShift
BookingRestriction
RestrictionRule
DeskRestrictionAssignment
Booking
UserSitePermission
UserFloorPermission
DelegateAssignment
HrisImport
AuditEvent
```

Core relationships:

```text
Site
└── Floor[]
    ├── FloorPlan
    ├── Desk[]
    ├── Utility[]
    ├── RoomSpace[]
    ├── Neighborhood[]
    └── FloorLabel[]

Desk
├── DeskRestrictionAssignment[]
├── DeskAttribute[]
└── Booking[]

DeskRestrictionAssignment
├── BookingRestriction / unrestricted mode
├── AvailabilityShift
└── Advance booking configuration

BookingRestriction
└── RestrictionRule[]

User
├── Department
├── Booking[] as occupant
├── Booking[] as creator
├── Site permissions
├── Floor permissions
└── Delegate assignments
```

---

# 46. Booking Data Requirements

Important distinction:

```text
booking.occupantUserId
booking.createdByUserId
```

Example:

Sarah is Booking Manager.

Sarah books a desk for James.

```text
occupantUserId = James
createdByUserId = Sarah
```

Restriction rules must be evaluated against James.

---

# 47. Timezone Rules

Workplace booking is timezone-sensitive.

Rules:

- Site has authoritative IANA timezone, e.g. `Europe/London`
- Operating hours are interpreted in site timezone
- Booking date/day-of-week restrictions use site timezone
- Persist timestamps in a consistent canonical form
- Convert for display using the site/user timezone as appropriate
- Avoid using browser-local timezone as the only source of truth

Day-based restrictions must not shift incorrectly because of UTC conversion.

---

# 48. Conflict Handling

Prevent overlapping bookings for the same desk.

Use transaction-safe database logic.

Do not rely only on frontend availability.

Where database technology allows it, add constraints/transaction logic to prevent two users from simultaneously booking the same desk and time.

---

# 49. Authorization Helpers

Use reusable authorization functions rather than scattered role strings.

Examples:

```text
canManageSite(actor, site)
canManageFloor(actor, floor)
canEditDesk(actor, desk)
canManageUser(actor, targetUser)
canBookForUser(actor, occupant)
canCancelBooking(actor, booking)
canViewOccupantIdentity(actor, booking)
```

Use them in:

- page loaders
- API routes
- server actions
- mutations
- background jobs

Navigation visibility is only a UX layer, not the security boundary.

---

# 50. Auditability

Important admin changes should be traceable.

Recommended metadata:

- createdAt
- updatedAt
- createdBy
- updatedBy

Booking metadata:

- occupantUserId
- createdByUserId
- status
- cancelledByUserId
- cancelledAt

Useful audit events:

- User role changed
- Floor permission changed
- Desk created/deleted
- Restriction changed
- Booking cancelled by admin
- HRIS sync executed

---

# 51. UI Behaviour

The UI should be functionally similar to the reference recording where useful:

- Large desk-edit modal
- Dropdown-based restriction type selection
- Searchable reusable restriction list
- Nested restriction management modal
- Rule builder with field/operator/value
- Searchable multi-select employee/department values
- Availability shift dropdown
- Right-side desk details panel on Floor Map
- Map markers with clear states
- Admin editor sidebar

Do not create a pixel-for-pixel clone.

Preserve the existing product's typography, spacing and component style unless there is a strong usability reason to change them.

---

# 52. Out of Scope

Unless specifically requested later, do not build:

- Workplace announcements
- Home-page floor map preview
- Separate Insights/People Manager product area
- Visitor management
- General request management / request subscriptions
- Move-management workflows
- Large analytics/reporting suite
- Mobile app
- Social features
- Full meeting-room reservation platform

Rooms/spaces may exist as floor-map objects without implementing a full room-booking system.

---

# 53. Implementation Priority

Build in vertical, testable slices.

## Phase 1 — Foundation

- Inspect existing code/schema
- Stabilize authentication/session handling
- Define roles and server-side authorization
- Confirm core entities and migrations

## Phase 2 — Site and floor administration

- Sites
- Floors
- Operating hours
- Floor plan upload

## Phase 3 — Desk editing

- Floor selection
- Load desks
- Create desk
- Reposition desk
- Edit desk
- Delete/deactivate desk
- Persist map coordinates

## Phase 4 — Restrictions

- Reusable restrictions
- Rule builder
- Shifts
- Multiple assignments per desk
- Advance booking window

## Phase 5 — Employee booking

- Floor Map sidebar
- Restriction display
- Booking validation
- Book a Desk search
- Desk calendar
- My Bookings

## Phase 6 — Users

- HRIS import/sync
- Combined Users page
- Roles
- Site/floor permissions
- Booking delegation

## Phase 7 — Additional map objects

- Utilities
- Rooms/spaces
- Neighborhoods
- Floor labels

---

# 54. Key Acceptance Scenarios

## Desk persistence

1. Admin creates desk on Floor 2.
2. Admin positions it.
3. Refresh.
4. Desk remains in same location.

## Desk restriction

Desk 2.21:

```text
Mon + Fri       Anyone can book
Tue             Anyone can book
Wed             Technology
Thu             Global Client Services
```

Expected:
- Floor Map displays all four rule/shift combinations.
- Booking validation selects the correct one for the requested day.

## Restriction engine

Technology restriction:

```text
Department is any of:
- Engineering
- Product
- Technology
```

Expected:
- matching employee can book on applicable day
- non-matching employee receives clear reason

## Booking manager

Sarah books for James.

Expected:

```text
occupant = James
createdBy = Sarah
```

Eligibility is evaluated against James.

## Permissions

Standard user requests admin route directly.

Expected:
- server denies access

Facility Admin assigned only London attempts to mutate New York floor through API.

Expected:
- server denies access

## HRIS sync

Existing employee's title changes in HRIS export.

Expected:
- title updates
- role/floor permissions remain unchanged

## User access

Employee has access to London Level 4 only.

Expected:
- employee cannot book London Level 5 or another site

---

# 55. Definition of Done

A feature is not done because the UI is visible.

It is done when:

- data persists
- permissions are enforced server-side
- expected database relationships exist
- relevant validation exists
- refresh does not lose changes
- error states are understandable
- the feature is integrated into the real workflow
- tests cover the critical behaviour
- no unrelated working functionality is broken
