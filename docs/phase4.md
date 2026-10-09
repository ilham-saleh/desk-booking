# Phase 4

The current UI/design should remain broadly consistent with what already exists. I am NOT asking you to visually clone OfficeSpace. I want the product architecture, permissions, management flows and desk-booking behaviour to work similarly to a mature workplace booking system.

Do not remove existing working functionality.

==================================================
1. OVERALL APPLICATION STRUCTURE
==================================================

The application should have two main levels:

A. Employee / booking experience
B. Administration / workplace management experience

Standard users should NOT have access to:

- Editing Platform
- Facilities / Sites
- Users

These navigation items must not merely be hidden in the frontend. Access must also be enforced in backend/server/API authorization so a normal user cannot manually visit an admin URL or call an admin endpoint.

The employee-facing functionality should include:

- Home
- My Bookings
- Book a Desk
- Floor Map

The admin functionality should additionally expose:

- Editing Platform
- Facilities / Sites
- Users

Booking Managers should receive additional booking capabilities without automatically receiving facility-management permissions.

==================================================
2. ROLE BASED ACCESS CONTROL
==================================================

For this application's first proper version, use these four core roles:

SYSTEM_ADMIN
FACILITY_ADMIN
BOOKING_MANAGER
STANDARD_USER

If the existing application currently calls STANDARD_USER "Guest", either migrate it to STANDARD_USER or keep Guest internally as an alias. The UI should preferably say Standard User.

SYSTEM ADMIN

A System Admin has access to the entire application.

They can:

- manage every facility/site
- create, edit and delete facilities
- create, edit and delete floors
- access every floor
- upload/edit floor plans
- create/edit/delete desks and other map objects
- create and manage booking restrictions
- manage all users
- change user roles
- assign users/admins to facilities and floors
- view bookings on any desk
- cancel any booking
- book on behalf of another user
- manage system-wide configuration

FACILITY ADMIN

A Facility Admin is an administrator, but only for their assigned facilities/floors.

They can:

- access Facilities / Sites for facilities they manage
- access Editing Platform for floors they manage
- manage desks and resources on those floors
- manage booking restrictions for those floors
- view users associated with their facilities
- view bookings on their floors
- cancel bookings within the facilities they administer
- assign team members to Booking Managers (delegates), scoped to the facilities they administer

They must NOT be able to modify facilities/floors outside their permission scope.

They must NOT be able to promote themselves to System Admin or give themselves access to additional facilities.

A System Admin assigns their permitted facilities/floors.

BOOKING MANAGER

A Booking Manager is primarily a booking/delegation role.

They can:

- book a desk for themselves
- select another user as the occupant and book on their behalf
- view relevant bookings for users they are permitted to manage
- cancel bookings they are permitted to manage on behalf of those users

They do NOT automatically get access to:

- Editing Platform
- Facilities / Sites
- user permission administration

The exact users/facilities a Booking Manager can manage should be scopeable.

STANDARD USER

A Standard User can:

- view available permitted facilities/floors
- view floor maps
- select desks
- book an eligible desk for themselves
- view their own bookings
- cancel their own future bookings

They cannot:

- book as another employee
- change the Occupant field away from themselves
- cancel someone else's booking
- edit facilities
- edit floors
- edit desks
- edit restrictions
- manage users
- access admin pages

All permissions must be checked server-side.

==================================================
3. FACILITIES / SITES
==================================================

Build Facilities / Sites as the place where admins define the physical workplace hierarchy.

Relationship:

Facility / Site
    -> Floor
        -> Floor Plan
            -> Desks / Rooms / Amenities / Map Objects

The Facilities / Sites page should show a table/list of facilities.

For each facility show useful information such as:

- facility name
- city
- country
- number of floors
- timezone
- active/inactive state

Provide:

Create Facility
Edit Facility
Delete Facility

SYSTEM_ADMIN can manage all facilities.

FACILITY_ADMIN only sees/manages their assigned facilities.

==================================================
4. CREATE / EDIT FACILITY
==================================================

When creating a new facility, provide a proper form.

Fields should include:

Required:
- Facility name
- Address
- City
- Country
- Timezone

Useful optional fields:
- Description
- State / region
- Postal code
- Facility photo/image
- Show facility to users toggle
- Units: metric / imperial

Example:

Name:
London - Steward Building

Description:
London headquarters

Address:
12 Steward Street

City:
London

State/Region:
London

Postal Code:
E1 6FQ

Country:
United Kingdom

Timezone:
Europe/London

A facility should also have workplace/booking configuration.

Add Operating Days and Hours.

For example:

Monday    07:00 - 19:00
Tuesday   07:00 - 19:00
Wednesday 07:00 - 19:00
Thursday  07:00 - 19:00
Friday    07:00 - 19:00

Allow admins to choose:

- calendar start day
- active working days
- opening/closing time for each working day

Booking validation must respect these opening hours.

Also add a facility setting:

"Allow employees to see coworkers' future desk bookings"

If enabled, normal users can see occupant information for future bookings.

If disabled, another person's future booking should appear as unavailable/booked without unnecessarily exposing their identity.

==================================================
5. FLOORS ASSOCIATED WITH A FACILITY
==================================================

Inside a facility there should be an Associated Floors section.

Admins should be able to:

- create a new floor
- open/edit an existing floor
- delete a floor
- move/transfer a floor to another facility if the user has appropriate permission

A floor must belong to exactly one facility.

Create Floor form:

Facility:
London - Steward Building

Floor Name:
Level 5

Other useful floor properties:

- active/inactive
- display order
- floor description
- floor plan image/file
- optional floor area
- whether the floor is visible/bookable

After creating the floor it should immediately become available in the Editing Platform floor selector.

==================================================
6. EDITING PLATFORM
==================================================

The Editing Platform is an administrator-only visual floor-plan editor.

The basic flow should be:

1. Admin opens Editing Platform.
2. Selects Facility.
3. Selects Floor.
4. The associated floor plan opens.
5. Admin can upload or replace the floor plan if necessary.
6. Admin visually creates and edits resources on top of the floor plan.

Support floor plan upload.

Use a practical web format such as:

- PNG
- JPG/JPEG
- optionally PDF converted/rendered appropriately

The editor should support:

- pan
- zoom
- selecting objects
- dragging/moving objects
- deleting objects
- editing selected objects
- creating objects

Do not store desk positions as arbitrary CSS only.

Persist coordinates relative to the floor-plan coordinate system so locations continue to align correctly when the browser/window size changes.

==================================================
7. FLOOR PLAN OBJECT TYPES
==================================================

Initially support at least:

DESK
ROOM
AMENITY
LABEL

Amenity examples:

- printer
- kitchen
- toilets
- lockers
- reception
- coffee point
- first aid
- stairs
- lift/elevator

Rooms can include things such as:

- meeting room
- collaboration room
- phone booth
- training room

Floor labels are simple text annotations placed on the map.

The mature system shown in the reference allows creating floor labels and placing seats visually, so implement both.

==================================================
8. DESK CREATION
==================================================

Admins should be able to create:

- a single desk
- multiple desks

Single desk:

Admin selects "Create Desk", clicks or drags a desk marker onto the map, then configures the desk.

Multiple desks:

Allow the admin to enter/paste a list of desk names, for example:

5.01
5.02
5.03
5.04
5.05

Then allow the admin to place those desks one after another on the map.

Desk names must be unique within the floor.

==================================================
9. DESK DATA / EDIT DESK
==================================================

When an admin edits a desk, provide a proper configuration panel/modal.

Important properties:

- Desk Name
- Active / Inactive status
- Current/assigned occupant if applicable
- Department
- Space Type
- Description
- Optional size
- Booking/Assignment Mode
- Require Check-in
- Restrictions
- Availability Shifts
- Advance Booking Window
- Amenities/Assets
- Attributes

Example:

Desk Name:
5.52

Desk Status:
Active

Assignment Mode:
Bookable Desk / Self Service

Require Check-in:
true/false

Space Type:
Desk

Department:
optional

Description:
optional

Attributes could include examples such as:

- standing desk
- dual monitors
- single monitor
- docking station
- near window
- accessible desk

These attributes should later be usable when users search/filter for desks.

==================================================
10. DESK AVAILABILITY SHIFTS
==================================================

This is important.

Do NOT implement restrictions as one simple department field directly on the desk.

A desk can have MULTIPLE booking availability rules/shifts.

Example desk:

Desk 5.52

Shift A:
Days: Monday + Wednesday
Restriction: Editorial

Shift B:
Days: Tuesday + Thursday
Restriction: Credit & Equities

Shift C:
Days: Friday
Restriction: Anyone

This means the same desk has different booking eligibility depending on the day.

Model this properly in the database.

Conceptually:

Desk
    -> AvailabilityShift[]
        -> daysOfWeek[]
        -> restriction
        -> advanceBookingWindow

For each shift support:

- name
- days of week
- restriction
- optional start/end time
- advance booking window

Example:

Shift Name:
Tuesday and Thursday

Days:
TUE, THU

Restriction:
Credit & Equitiesa

Advance booking:
30 days

==================================================
11. BOOKING RESTRICTIONS (Admin can set restrictions when editing a desk)
==================================================

Support these restriction modes:

1. Anyone can book

2. Only assigned occupants

3. Only people matching the desk's department

4. Custom restriction based on employee/user fields

Custom restrictions need a reusable rule builder.

A restriction should have:

- name
- optional display colour
- rules
- AND/OR relationships

Example restriction:

Name:
All Forum

Rules:

Department IS ANY OF
- Editorial - Forum
- Editorial - Community
- Editorial - Operations
- Forum - Events

OR

Email IS ANY OF
- user@example.com

Useful rule fields should include at least:

- Department
- User
- Email

Structure the implementation so additional employee fields can be added later.

Useful operators:

- is
- is not
- is any of
- is not any of

Restriction groups should be reusable across many desks.

For example one restriction called:

"Private Equities"

could be assigned to 50 desks.

Do NOT duplicate the full restriction definition on every desk.

Use relations.

==================================================
12. DESK BOOKING VALIDATION
==================================================

Booking rules must be enforced by backend logic, not just visually.

When a user attempts to book a desk:

1. Confirm the desk exists.
2. Confirm desk is active.
3. Confirm user has access to the facility/floor.
4. Confirm selected date falls on an available shift.
5. Find the restriction attached to that shift.
6. Evaluate the restriction against the user who will OCCUPY the desk.
7. Confirm booking falls inside the allowed advance booking window.
8. Confirm start/end times are within facility operating hours.
9. Confirm the desk does not already have an overlapping booking.
10. Confirm the user does not have a conflicting booking if that restriction already exists in the app.
11. Only then create the booking.

For Booking Managers, restriction validation must be evaluated against the selected occupant, not the Booking Manager.

Example:

Booking Manager Sarah books Desk 5.52 for James.

If James belongs to Editorial and Thursday is Credit & Equities only, booking must fail even if Sarah belongs to Credit & Equities.

Return understandable validation errors such as:

"This desk is restricted to Credit & Equities on Thursdays."

rather than generic failures.

==================================================
13. FLOOR MAP USER EXPERIENCE
==================================================

When users view a floor map, desks should visually show different states.

Examples:

- available
- booked
- restricted/not eligible
- inactive/unavailable
- selected

Use the existing application's visual style.

Do not rely only on colour. Include icons/borders/tooltips/accessibility states where appropriate.

==================================================
14. SELECTING A DESK
==================================================

When a desk is selected, open a side panel or details panel.

The reference behaviour displays significantly more information than the current application.

Show:

Desk name:
5.52

Resource type:
Bookable Desk

Availability:
Available / Booked / Restricted / Inactive

Booking form:
- Occupant
- Date
- Start Time
- End Time
- Repeats
- Book Desk button

For STANDARD_USER:
Occupant is automatically the logged-in user and cannot be changed.

For BOOKING_MANAGER / appropriate admins:
Occupant becomes a searchable user selector.

==================================================
15. SHOW RESTRICTIONS ON THE SELECTED DESK
==================================================

The selected-desk panel must clearly explain who is allowed to book the desk and when.

Example:

Restricted To

Credit & Equities
Tuesday, Thursday

Editorial
Monday, Wednesday

Anyone can book
Friday

If there are multiple booking restrictions, display all of them.

The user should not have to guess why a desk appears restricted.

If today's restriction prevents the current occupant from booking, show something such as:

"Not eligible today.
This desk is restricted to Editorial on Mondays and Wednesdays."

==================================================
16. SHOW BOOKINGS ON THE SELECTED DESK
==================================================

The selected desk panel should also show:

Today's Bookings

Example:

Chris Webster
08:30 - 19:00

or:

No upcoming bookings

Also provide:

"View Desk Calendar"

The desk calendar should allow viewing bookings for other dates.

Respect the facility privacy setting regarding whether standard users are allowed to see coworker names.

Admins should always be able to see the booking details required to administer the workspace.

==================================================
17. SHOW LOCATION DETAILS
==================================================

At the bottom of a selected desk panel display location.

For example:

Desk:
5.52

Floor:
Level 5

Facility:
London - Steward Building

Also show useful attributes/amenities where available.

==================================================
18. BOOK A DESK SEARCH FLOW
==================================================

The Book a Desk page should support searching by:

- Facility
- Floor
- Date
- Start Time
- End Time
- Features / attributes

Also include:

Repeats

The reference product supports repeating bookings, so structure the data model to support:

- does not repeat
- selected recurring weekdays
- recurrence end date

It is acceptable to implement non-repeating bookings first if recurrence is not already supported, but design the schema so recurrence can be added cleanly.

After the user supplies search criteria:

"Find Available Desks"

should return only desks that:

- are active
- exist on permitted floors
- have a relevant availability shift
- satisfy occupant restrictions
- do not conflict with another booking

Optionally show:

Assigned desks
Previously booked desks

to make frequent booking faster.

==================================================
19. MY BOOKINGS
==================================================

Keep the existing My Bookings page but improve it.

Include:

Upcoming
Past

Each booking should show:

- desk
- facility
- floor
- date
- start/end time
- booking status

A Standard User can cancel only THEIR OWN eligible future bookings.

They must never be able to cancel another user's booking by manipulating an API request.

==================================================
20. ADMIN BOOKING MANAGEMENT
==================================================

Admins must be able to manage bookings for their permission scope.

SYSTEM_ADMIN:
can view/cancel any booking anywhere.

FACILITY_ADMIN:
can view/cancel any booking on facilities/floors they administer.

Provide cancellation from logical places such as:

- selected desk -> Today's Bookings
- Desk Calendar
- user booking history in Users

Before cancellation show confirmation:

"Cancel booking for Chris Webster at Desk 5.52 on 10 September, 09:00–17:00?"

Store:

- cancelled_at
- cancelled_by_user_id
- cancellation reason if supplied

Do not hard delete important booking records if an audit/status based approach is practical.

Use booking statuses such as:

CONFIRMED
CANCELLED
COMPLETED

==================================================
20A. BULK TEAM BOOKING (BOOKING MANAGERS)
==================================================

Booking Managers must be able to book for several team members at once instead of one booking at a time.

In one action the manager selects:

- multiple team members (server-side typeahead, limited to the people they are delegated for)
- multiple desks (from the Floor Map or Find Available Desks results)
- multiple days (individual dates and/or a date range with chosen weekdays)
- one start/end time for the batch, in the site timezone

By default each person keeps the same desk across all selected days; the manager can change pairings before submitting.

Before writing, show a preview of every (person, day, desk) row with ✓ or the actionable restriction/conflict reason. Eligibility is evaluated for each OCCUPANT using the same central eligibility service as single bookings.

The server re-validates authorization, restrictions and conflicts for every row in one transaction and creates all rows or none. Each row is a normal booking with occupant = team member and createdBy = manager, grouped by a nullable batchId so the batch can be viewed and cancelled together. Enforce a server-side cap on rows per request.

Standard Users cannot use bulk booking.

Full detail and acceptance test: tasks/desk-management.md §32A and TEST 10.

==================================================
21. USERS PAGE
==================================================

Make Users a proper administration page instead of only a basic user list.

The list/table should include:

- Name
- Email
- Department
- Role
- Timezone
- Permission scope
- Last activity / last login
- SSO status if the app supports SSO
- Active/inactive state

Search/filter by:

- name
- email
- department
- role
- facility/floor
- active status

SYSTEM_ADMIN can see all users.

FACILITY_ADMIN should only see/manage users relevant to their allowed facilities unless there is a strong architectural reason otherwise.

==================================================
22. EDIT USER
==================================================

Clicking a user should open a full user profile/edit screen.

Include:

Basic information:
- Email
- First Name
- Last Name
- Initials if desired
- Phone
- Department
- Timezone

Account:
- Role
- Active/inactive
- Last login
- Account creation date
- SSO status where relevant

Permissions:
- Assigned Facilities
- Assigned Floors

Booking:
- Allow Delegation
- Delegate / Booking Manager assignments
- Recent/upcoming bookings
- booking history

Do not create a separate people/reporting page for this information.

Put the useful employee/workplace information directly inside Users.

==================================================
23. ASSOCIATED FLOOR PERMISSIONS
==================================================

User access to the workplace must be scopeable.

SYSTEM_ADMIN:
automatically gets all sites and floors.

FACILITY_ADMIN:
System Admin chooses which facilities/floors they administer.

BOOKING_MANAGER:
can optionally be assigned to one or more facilities/floors.

STANDARD_USER:
can be assigned to the facilities/floors they are allowed to book.

Use relational permissions rather than storing a comma-separated list.

For example:

UserFacilityPermission
UserFloorPermission

or an equivalent model appropriate to the existing stack.

==================================================
24. DEPARTMENTS
==================================================

Departments must be proper entities/data, because desk restrictions depend on them.

Example departments:

- Editorial
- Credit & Equities
- Private Equities
- Workplace Support
- Finance
- Engineering

A user can belong to a department.

A restriction can reference one or more departments.

Do not compare free-form department strings throughout the booking code.

Use IDs/relations.

==================================================
1.  SUGGESTED CORE DATA MODEL 
==================================================

Adapt this to the existing database rather than blindly replacing existing tables.

Likely entities:

User
Department
Facility
Floor
FloorPlan
MapObject
Desk
DeskAttribute
DeskAsset
AvailabilityShift
BookingRestriction
RestrictionRule
Booking
UserFacilityPermission
UserFloorPermission
DelegateAssignment

Example relationships:

Facility
  hasMany Floors

Floor
  belongsTo Facility
  hasMany Desks
  hasOne FloorPlan

Desk
  belongsTo Floor
  hasMany AvailabilityShifts
  hasMany Attributes
  hasMany Bookings

AvailabilityShift
  belongsTo Desk
  references BookingRestriction
  contains daysOfWeek

BookingRestriction
  hasMany RestrictionRules

User
  belongsTo Department
  hasMany Bookings
  hasMany Facility/Floor permissions

Booking
  belongsTo Desk
  belongsTo Occupant User
  optionally stores createdByUser separately

This is important:

booking.occupantUserId
and
booking.createdByUserId

must be separate.

Example:

Sarah is a Booking Manager.
Sarah books a desk for James.

occupantUserId = James
createdByUserId = Sarah

==================================================
26. AUTHORIZATION AND SECURITY
==================================================

Do not implement permissions only by hiding sidebar items.

Create reusable authorization checks.

Examples:

canManageFacility(user, facility)
canManageFloor(user, floor)
canEditDesk(user, desk)
canManageUser(actor, targetUser)
canBookForUser(actor, occupant)
canCancelBooking(actor, booking)

Use these checks consistently in:

- pages
- API routes
- server actions
- database mutations

Never trust a role or user ID sent from the browser without validating it server-side.

==================================================
27. AUDITABILITY
==================================================

For administrative actions, record useful metadata where practical:

createdAt
updatedAt
createdBy
updatedBy

For bookings:

occupant
createdBy
cancelledBy
cancelledAt
status

This will make future admin troubleshooting considerably easier.

==================================================
28. UI / NAVIGATION BEHAVIOUR
==================================================

The existing screenshot currently shows:

Home
My Bookings
Book a Desk
Floor Map
Editing Platform
Facilities / Sites
Users

Keep this structure.

However, calculate navigation visibility from permissions.

STANDARD_USER:

Home
My Bookings
Book a Desk
Floor Map

BOOKING_MANAGER:

Home
My Bookings
Book a Desk
Floor Map

plus booking-for-others functionality inside Book a Desk.

FACILITY_ADMIN:

Home
My Bookings
Book a Desk
Floor Map
Editing Platform
Facilities / Sites
Users

SYSTEM_ADMIN:

all of the above.

Do not duplicate separate versions of the same page unnecessarily.

Use authorization and conditional functionality.

==================================================
29. IMPORTANT PRODUCT FLOW
==================================================

The complete administration flow should work like this:

System Admin
    creates Facility
        ->
    enters facility details/address/timezone
        ->
    configures working days/hours
        ->
    creates Floor
        ->
    names Floor
        ->
    opens Editing Platform
        ->
    uploads/selects Floor Plan
        ->
    places Desks / Rooms / Amenities / Labels
        ->
    edits Desk properties
        ->
    creates reusable Booking Restrictions
        ->
    assigns restrictions to desk availability shifts
        ->
    creates/imports Users
        ->
    assigns Department
        ->
    assigns Role
        ->
    assigns Facility/Floor permissions

Then:

Employee
    ->
selects facility/floor/date
    ->
selects a desk
    ->
system checks active availability shift
    ->
system checks employee against restriction
    ->
system checks booking window
    ->
system checks booking collision
    ->
booking succeeds or displays a clear reason it cannot be booked.

This relationship between Facilities, Floors, Users, Departments, Desks, Restrictions and Bookings is the core architecture.

==================================================
30. DO NOT FAKE FUNCTIONALITY
==================================================

Do not build buttons that only visually appear to work.

All create/edit/delete/booking/restriction/permission functionality should persist to the database.

Examples:

If I create a facility and refresh, it must remain.

If I add Level 6 to London, it must remain associated with London.

If I place Desk 6.20 on Level 6, its map coordinates must persist.

If I restrict Desk 6.20 to Engineering on Monday, a Finance user must actually be blocked from booking it on Monday.

If I change the same desk to Anyone on Friday, the Finance user should be allowed to book it Friday.

If a Facility Admin attempts to modify a different facility by directly calling the API, the server must reject it.

==================================================
31. IMPLEMENTATION APPROACH
==================================================

Do not start making random UI changes immediately.

Do this in order:

PHASE 1
Audit the current project as well as schema.prisma and propose the database/data model changes and RBAC architecture if necessary

PHASE 2
Implement roles and authorization.

PHASE 3
Implement Facilities and Floors.

PHASE 4
Implement Editing Platform improvements and persistent floor objects.

PHASE 5
Implement departments, desk restrictions and availability shifts.

PHASE 6
Implement Users and permission assignment.

PHASE 7
Upgrade booking UI and selected-desk information panel.

PHASE 8
Implement admin/delegated booking management and cancellation permissions, then bulk team booking for Booking Managers (section 20A).

PHASE 9
Test the complete flow.

Do not unnecessarily replace libraries/frameworks already being used.

Prefer extending the current architecture unless there is a clear technical problem.

==================================================
1.  TESTING / ACCEPTANCE CASES
==================================================

At minimum verify these scenarios:

CASE 1
Standard User manually visits /users.
Expected:
403/redirect and no access.

CASE 2
Standard User manually visits Editing Platform.
Expected:
403/redirect.

CASE 3
System Admin creates:
London -> Level 5 -> Desk 5.52.
Expected:
all persist after refresh.

CASE 4
System Admin creates restriction:
Editorial Only.

CASE 5
Desk 5.52:
Monday/Wednesday -> Editorial Only.
Tuesday/Thursday -> Credit & Equities.
Friday -> Anyone.

CASE 6
Editorial employee books Wednesday.
Expected:
allowed.

CASE 7
Editorial employee books Thursday.
Expected:
rejected with meaningful restriction message.

CASE 8
Credit & Equities employee books Thursday.
Expected:
allowed.

CASE 9
Finance employee books Friday.
Expected:
allowed.

CASE 10
Standard User attempts to cancel someone else's booking by API.
Expected:
403.

CASE 11
Facility Admin for London cancels London booking.
Expected:
allowed.

CASE 12
Same Facility Admin attempts to cancel New York booking.
Expected:
403.

CASE 13
System Admin cancels New York booking.
Expected:
allowed.

CASE 14
Booking Manager books Desk 5.52 for another eligible user.
Expected:
occupant is the selected user, createdBy is Booking Manager.

CASE 15
Booking Manager attempts to book a restricted desk for an ineligible user.
Expected:
booking fails based on occupant's department, not Booking Manager's department.

CASE 17
Booking Manager books 3 team members onto 3 desks for 2 days in one action.
Expected:
preview lists 6 rows; any ineligible row shows the occupant-based reason; confirming creates all valid rows in one transaction with occupant = team member, createdBy = Booking Manager.

CASE 18
Booking Manager includes a person they are not delegated for in a bulk booking.
Expected:
server rejects the request.

CASE 16
Select a desk on Floor Map.
Expected:
panel displays:
- desk name
- status
- booking inputs
- restriction groups and applicable days
- today's bookings
- desk calendar option
- floor
- facility
- attributes/amenities

==================================================
33. FINAL REQUIREMENT
==================================================

The goal is not simply to add three admin pages.

The goal is to turn the existing prototype into a properly connected workplace desk-booking system where:

FACILITIES define WHERE people can work.

FLOORS belong to facilities.

FLOOR PLANS define the physical layout.

DESKS exist at positions on those plans.

USERS have roles, departments and workplace permissions.

RESTRICTIONS determine WHO can use a desk.

AVAILABILITY SHIFTS determine WHEN those restrictions apply.

BOOKINGS connect an occupant to a desk and time.

ADMINS configure and control the system.

BOOKING MANAGERS can make bookings on behalf of people, including several people, desks and days in one action.

STANDARD USERS can only manage their own bookings.

Before coding, inspect the existing implementation and present a concise implementation plan showing which existing files/models/components you will modify or reuse. Then begin implementation systematically rather than recreating the project.
