# TASK: Rework Admin Users Management

Read these files before changing code:

1. `CLAUDE.md`
2. `PROJECT_SPECS.md`
3. This task file
4. Review the screenshots in the project screenshots folder that show:
   - Manage Users table
   - Select Columns / Report Actions controls
   - Edit User page
   - Associated Floor Permissions
   - Available Permissions
   - Add / Remove site permission flow

This task is ONLY about the Users administration experience.

Do NOT implement HRIS synchronization yet.

HRIS/user-data import will be handled in the next phase.

For now, build the Users management architecture and UI using the existing User data/model so that it is ready for HRIS-synced employees later.

Do not rebuild unrelated functionality.

---

# 1. GOAL

Rework the existing Users page into the main employee administration area.

This should replace the need for separate:

- People Manager
- Admin Users
- user permission pages

The final flow should be:

Users
→ searchable employee list
→ Select Columns
→ Edit Users mode
→ select/delete users if required
→ click employee
→ User Details
→ edit basic information
→ assign role
→ assign site permissions according to role
→ save

The Users page should eventually display employees synchronized from HRIS, but HRIS sync is NOT part of this task.

---

# 2. USERS PAGE ACCESS

Only administrators should have access to user management.

## SYSTEM_ADMIN

Can:

- view all users
- edit all users
- change roles
- assign site permissions
- remove site permissions
- delete/deactivate users
- manage Facility Admins
- manage Booking Managers
- manage Standard Users

## FACILITY_ADMIN

Can manage users relevant to their assigned facility/site.

They must NOT:

- manage users outside their assigned site
- promote themselves
- create another System Admin
- grant permissions outside their own authorized site scope

If the current permissions architecture does not yet support this safely, implement the reusable authorization layer required for it.

Booking Managers and Standard Users must NOT access the Users administration page.

All access must be enforced server-side.

---

# 3. USERS LIST

The Users page should display employees in a table/list similar in functionality to the supplied screenshots.

Default columns:

- Name
- Email
- Title
- Department
- Role
- Permissions

Example:

| Name        | Email             | Title     | Department | Role            | Permissions      |
| ----------- | ----------------- | --------- | ---------- | --------------- | ---------------- |
| Alex Hudson | alex@company.com  | Associate | Consulting | Booking Manager | London           |
| Sarah Smith | sarah@company.com | Manager   | Technology | Facility Admin  | London           |
| John Brown  | john@company.com  | Analyst   | Finance    | Standard User   | London, New York |

Do not hardcode sample users.

Use database data.

---

# 4. HRIS-OWNED FIELDS

The following fields will eventually come from HRIS:

- First Name
- Last Name
- Email
- Title
- Department
- Location
- Employee ID
- other employee attributes

Do not implement the HRIS import now.

However, structure the Users page and User model usage so these fields can later be updated by HRIS without changing the permissions system.

Application-owned data must remain separate:

- Role
- Site permissions
- Booking Manager permissions
- application active/inactive state
- authentication links
- booking delegation

This distinction is important.

---

# 5. SELECT COLUMNS BUTTON

At the top-left of the Users page add:

`SELECT COLUMNS`

similar to the reference screenshots.

Clicking it should open a dropdown/popover where the admin chooses which columns are visible.

Available columns should include at least:

- Name
- Email
- Title
- Department
- Role
- Permissions
- Location
- Last activity if data exists
- SSO/authentication status if data exists

Required core columns such as Name may remain locked/always visible if appropriate.

Example:

Select Columns

☑ Name
☑ Email
☑ Title
☑ Department
☑ Role
☑ Permissions
☐ Location
☐ Last Activity

Changing this affects TABLE VISIBILITY only.

It does NOT change the employee data itself.

It does NOT mean filtering employees.

---

# 6. REPLACE "REPORT ACTIONS"

The reference application has:

SELECT COLUMNS
REPORT ACTIONS

I do NOT want Report Actions.

Replace it with:

`EDIT USERS`

So the top controls should look approximately like:

[ SELECT COLUMNS ] [ EDIT USERS ]

---

# 7. EDIT USERS MODE

Clicking `EDIT USERS` should enable bulk user-management mode.

In Edit Users mode:

- checkboxes appear for each row
- select-all checkbox appears
- admin can select one or many users
- bulk actions become available

At minimum support:

`DELETE SELECTED`

or preferably:

`REMOVE USERS`

depending on existing terminology.

Before deleting/removing users, always show confirmation.

Example:

Remove 4 users?

These users will no longer be able to access the desk-booking system.

Cancel | Remove Users

Do not immediately delete when checkbox is selected.

---

# 8. USER DELETION / REMOVAL

Be careful with historical booking data.

If a user already has:

- previous bookings
- cancelled bookings
- audit activity

do NOT blindly hard-delete them and break relations.

Prefer:

- soft delete
- deactivate
- archive
- `active = false`

depending on the current schema.

Historical booking records should remain.

The user should no longer be able to authenticate or create bookings once removed/deactivated.

If the existing architecture already has a safe deletion strategy, reuse it.

---

# 9. SEARCH USERS

Add a search field to the Users page.

Search should support:

- First Name
- Last Name
- Full Name
- Email

Example:

Search users...

Typing:

`alex`

could return:

Alex Hudson
alex.hudson@company.com

Do not load/filter only on the client if the employee directory becomes large.

Structure this for server-side search/pagination where appropriate.

---

# 10. ROLE FILTER / SORT

Admins should be able to filter or sort users by Role.

At minimum:

Role
[ All Roles ▼ ]

Options:

- All Roles
- System Admin
- Facility Admin
- Booking Manager
- Standard User

Optionally support ascending/descending role sorting if the current table system already supports sorting.

Do not overload the Select Columns control with record filtering.

---

# 11. PAGINATION

The Users page should support pagination because the final HRIS employee list may contain hundreds or thousands of users.

Similar to the reference screenshot:

Rows per page:
25

1–25 of 1881

< 1 2 3 ... 76 >

Use the project's existing pagination patterns if available.

Avoid loading every employee into the browser unnecessarily.

---

# 12. CLICK USER → USER DETAILS

Clicking the user's name or row should open their User Details page.

Use the reference screenshots as a functional guide.

The page should contain:

## Basic Information

- First Name
- Last Name
- Email
- Title
- Department
- Location
- Role

Fields coming from HRIS may eventually become read-only when HRIS sync is implemented.

For this phase, basic fields can remain editable as requested.

At minimum admin should be able to edit:

- First Name
- Last Name
- Email
- Location
- Role

Title and Department should also be displayed even if they are not yet editable.

Later HRIS sync will become authoritative for those fields.

---

# 13. ROLE SELECTOR

User Details must contain a Role dropdown.

Available application roles:

- System Admin
- Facility Admin
- Booking Manager
- Standard User

Do not reproduce unnecessary OfficeSpace roles such as:

- Move Manager
- Guest Directory roles
- Request Manager
- etc.

This product uses the four roles above.

---

# 14. SYSTEM ADMIN

SYSTEM_ADMIN is the super administrator.

A System Admin has authority across:

- all sites
- all floors
- all desks
- all users

They can:

- manage sites
- manage floors
- manage desks
- manage restrictions
- manage users
- book desks for themselves
- book desks on behalf of others
- cancel bookings for themselves
- cancel bookings on behalf of others

Their permissions section should show something like:

Associated Site / Floor Permissions

System Administrators have access to all sites and floors.

There is no need to manually select each site.

Do not store hundreds of redundant site permission records for a System Admin if role-level access already grants all sites.

---

# 15. FACILITY ADMIN

FACILITY_ADMIN manages a specific site or permitted site scope.

A Facility Admin can:

- manage their assigned site
- manage floors belonging to that site
- access Editing Platform for that site
- create/edit/delete desks in that site
- manage restrictions for that site
- manage relevant users
- book desks for themselves
- book desks on behalf of other employees within their permitted site
- cancel relevant bookings within their permitted site

They cannot:

- access/manage another site's administration
- grant themselves additional sites
- create/promote System Admins unless explicitly authorized by policy
- manage desks outside assigned sites

Facility Admin permissions should be site-based.

Example:

Facility Admin

Associated Sites:

London - Steward Building

[ Remove ]

Available Sites:

New York
Hong Kong
Mumbai

[ Add ]

Only System Admin should be able to freely assign Facility Admin site scope.

---

# 16. BOOKING MANAGER

BOOKING_MANAGER is NOT an administrator.

A Booking Manager can:

- book a desk for themselves
- book desks on behalf of other employees
- only do so within the site(s) assigned to them

They cannot:

- manage users
- edit desks
- access Editing Platform
- manage Facilities/Sites
- manage restrictions
- delete users
- modify roles

Their additional permission is specifically:

"Can book for others in selected sites."

---

# 17. BOOKING MANAGER INITIAL STATE

When an admin changes a user to:

Booking Manager

the user should initially have NO site booking permissions unless they already have valid permissions.

Show something similar to:

Associated Booking Permissions

This user has not been granted permission to book desks for others at any site.

[ ADD PERMISSION ]

This is similar to the warning/permission flow shown in the supplied screenshots.

Do not automatically grant all sites.

---

# 18. ADD BOOKING MANAGER PERMISSIONS

Click:

ADD PERMISSION

or scroll to:

Available Permissions

Show available Sites.

Example:

Available Permissions

☐ London - Steward Building
☐ New York
☐ Hong Kong
☐ Mumbai

[ Add Selected ]

Admin can:

- tick one site
- tick multiple sites
- click Add Selected

The selected sites become Booking Manager permissions.

Example:

Associated Booking Permissions

London - Steward Building
[ Remove ]

New York
[ Remove ]

The Booking Manager can now book desks for other users at those sites.

---

# 19. BOOKING MANAGER PERMISSION DATA

Do not represent this as free text.

Use relational data.

Conceptually something like:

UserSitePermission

or:

BookingManagerSitePermission

depending on the current schema.

Example:

bookingManagerUserId
siteId

The same Booking Manager may have multiple sites.

The same site may have many Booking Managers.

Use the existing permission model if it already fits.

---

# 20. BOOKING MANAGER AUTHORIZATION

Server-side booking logic must enforce site permission.

Example:

Booking Manager Sarah has:

London permission

Sarah attempts to book for James in London.

Expected:
Allowed if James and desk otherwise qualify.

Sarah attempts to book for James in New York.

Expected:
Denied.

Do NOT rely only on hiding New York in the UI.

Backend should validate:

canBookForUser(actor, occupant, desk/site)

---

# 21. FACILITY ADMIN VS BOOKING MANAGER

Do not confuse these roles.

## Facility Admin

Administrative workplace role.

Can:

- manage assigned site
- manage desks
- manage relevant users
- manage restrictions
- book for others
- cancel relevant bookings

## Booking Manager

Booking delegation role only.

Can:

- book self
- book others in assigned sites

Cannot:

- manage site
- edit desks
- manage users
- manage restrictions

This distinction is essential.

---

# 22. STANDARD USER

STANDARD_USER is the normal employee role.

Can:

- browse permitted sites/floors
- book themselves
- view own bookings
- cancel own eligible bookings

Cannot:

- book for others
- manage users
- manage sites
- edit desks
- access Editing Platform

---

# 23. USER LOCATION

User Details should include:

Location

For now this may be a text/select field depending on current data.

Example:

Location:
London

Later HRIS sync may control this value.

Do not confuse Location with application site permission.

Example:

Employee HRIS location:
London

does not automatically mean:

Facility Admin permission for London

Site permissions remain explicit application permissions.

---

# 24. USER DETAILS UI

Use a modern version of the reference layout.

Example:

USER DETAILS

Basic Information

First Name
[ Alex ]

Last Name
[ Hudson ]

Email
[ alex.hudson@company.com ]

Title
[ Associate ]

Department
[ Consulting ]

Location
[ London ]

Role
[ Booking Manager ▼ ]

[ SAVE USER ]

---

Booking / Site Permissions

Current permissions...

Available permissions...

Do not need to copy OfficeSpace's visual styling exactly.

Use the application's existing design system.

---

# 25. PERMISSION SECTION CHANGES BY ROLE

The permissions area should adapt based on role.

## SYSTEM_ADMIN

Show:

System Administrators have access to all sites and floors.

No manual site selection required.

---

## FACILITY_ADMIN

Show:

Managed Sites

London - Steward Building
[Remove]

Available Sites

New York
Hong Kong
Mumbai

[Add Selected]

---

## BOOKING_MANAGER

Show:

Sites where this user can book on behalf of others

London - Steward Building
[Remove]

Available Sites

New York
Hong Kong
Mumbai

[Add Selected]

---

## STANDARD_USER

For now, display their normal floor/site booking access if already implemente
d.

Do not give them "book for others" permission.

---

# 26. ROLE CHANGE BEHAVIOUR

Changing roles must safely update permission behaviour.

Example:

STANDARD_USER
→ BOOKING_MANAGER

Do not automatically grant sites.

Show no delegated booking sites until admin adds them.

---

BOOKING_MANAGER
→ FACILITY_ADMIN

Existing Booking Manager site permissions should NOT automatically become administrative permissions without explicit confirmation/assignment.

---

FACILITY_ADMIN
→ STANDARD_USER

Administrative site permissions should stop granting admin abilities.

Do not leave hidden admin access behind.

---

SYSTEM_ADMIN
→ lower role

Require confirmation because this removes global admin access.

---

# 27. PERMISSION REMOVAL

Admin must be able to remove site permissions.

Example:

Associated Permissions

London - Steward Building
[ REMOVE ]

Click Remove:

Remove London permission from Alex?

Cancel | Remove

Update immediately after success.

Do not silently remove permissions without confirmation if the consequence is significant.

---

# 28. DELETE USER SAFETY

Bulk user removal must respect:

- existing bookings
- booking history
- audit history
- permission relations
- authentication records

Prefer deactivation over destructive cascade deletion.

If actual permanent delete is supported, restrict it to users with no meaningful historical references.

Otherwise use:

active = false

and hide inactive users by default with optional filter:

Active
Inactive
All

---

# 29. USERS TABLE PERMISSIONS COLUMN

The Permissions column should give a readable summary.

Examples:

System Admin:
`All sites and floors`

Facility Admin:
`London - Steward Building`

Booking Manager:
`Book for others: London, New York`

Standard User:
`Standard booking access`

If the user has multiple permissions, abbreviate gracefully and show full details through tooltip/popover if needed.

---

# 30. CURRENT PHASE VS NEXT HRIS PHASE

Do NOT implement HRIS synchronization in this task.

However, design this page with the expectation that next phase will sync:

- Employee ID
- First Name
- Last Name
- Email
- Title
- Department
- Location

from HRIS.

Therefore:

Do not tie role/permission data directly to imported spreadsheet values.

Keep:

Employee identity/profile data

separate from:

Application role/permission data.

This is important because HRIS updates must never accidentally reset:

- System Admin role
- Facility Admin permissions
- Booking Manager permissions

---

# 31. AUTHORIZATION HELPERS

Use reusable authorization logic.

Conceptually:

canManageUsers(actor)

canManageUser(actor, target)

canAssignRole(actor, role)

canAssignSitePermission(actor, target, site)

canBookForUser(actor, occupant, site)

canCancelBooking(actor, booking)

Avoid scattered checks such as:

if role === "ADMIN"

throughout the application.

---

# 32. DATA MODEL

Inspect the existing Prisma schema first.

Do NOT blindly duplicate models.

Conceptually we need:

User

- id
- firstName
- lastName
- email
- title
- departmentId
- location
- role
- active
- lastLoginAt
- etc.

Department

- id
- name

Site

- id
- name

and suitable permission relations.

Could be:

UserSitePermission

with permission type:

FACILITY_ADMIN
BOOK_FOR_OTHERS
STANDARD_ACCESS

or separate relational models.

Choose the cleanest architecture based on the current schema.

Do not store:

"London, New York"

as comma-separated text.

---

# 33. SELECT COLUMNS VS FILTERING

Important UI distinction:

`SELECT COLUMNS`

controls TABLE COLUMN VISIBILITY.

Search and role controls filter RECORDS.

Example top area:

Search users...
[________________]

Role
[ All Roles ▼ ]

[ SELECT COLUMNS ] [ EDIT USERS ]

Keep this understandable.

---

# 34. TABLE ROW INTERACTION

Normal mode:

- clicking Name opens User Details
- row checkbox is not necessary unless there are useful bulk actions

Edit Users mode:

- checkboxes appear
- bulk remove/deactivate controls appear
- clicking user name can still open details if practical

Do not make normal browsing look permanently like destructive edit mode.

---

# 35. EMPTY / NO PERMISSIONS STATES

Use clean messages.

Booking Manager with no permissions:

"This user has not been granted permission to book for others at any site."

Facility Admin with no managed sites:

"This Facility Admin has not been assigned a site."

Do not use informal reference-product messages such as:

"Oh no!"

Use professional language consistent with our application.

---

# 36. ACCEPTANCE TESTS

Before declaring complete, test these.

## Test 1 — Users list

Open Users.

Expected:

columns include:

Name
Email
Title
Department
Role
Permissions

---

## Test 2 — Select Columns

Hide Department.

Expected:

Department column disappears.

Refresh if settings are persisted.

No user data is altered.

---

## Test 3 — Search

Search email.

Expected:

correct employee appears.

Search name.

Expected:

correct employee appears.

---

## Test 4 — Role filter

Select Booking Manager.

Expected:

only Booking Managers appear.

---

## Test 5 — Edit user

Open employee.

Change:

First Name
Last Name
Email
Location

Save.

Refresh.

Expected:

changes persist.

---

## Test 6 — System Admin

Assign:

SYSTEM_ADMIN

Expected:

permission display:

All sites and floors

Admin functionality works globally.

---

## Test 7 — Facility Admin

Assign:

FACILITY_ADMIN

Add:

London

Expected:

can manage London.

Attempt to manage New York.

Expected:

server denies.

---

## Test 8 — Booking Manager without permissions

Assign:

BOOKING_MANAGER

Expected:

message says user has no "book for others" site permissions.

---

## Test 9 — Add Booking Manager permissions

Select:

London
New York

Add Selected.

Expected:

both appear under Associated Permissions.

---

## Test 10 — Booking Manager delegated booking

Booking Manager with London permission books for another employee in London.

Expected:

allowed if other booking rules pass.

Try New York without permission.

Expected:

server rejects.

---

## Test 11 — Remove permission

Remove London.

Expected:

permission disappears.

Delegated booking in London now rejected.

---

## Test 12 — Booking Manager admin access

Booking Manager manually navigates to:

/users
/editing-platform

Expected:

403/redirect.

---

## Test 13 — Edit Users mode

Click:

EDIT USERS

Select several users.

Expected:

bulk remove/deactivate action becomes available.

---

## Test 14 — User removal

Remove test user.

Expected:

user cannot log in/use system.

Historical bookings remain intact.

---

# 37. DEFINITION OF DONE

Do not call this task complete merely because the table looks like the screenshots.

This task is complete when:

Users
→ searchable list
→ Name / Email / Title / Department / Role / Permissions
→ Select Columns works
→ Edit Users mode works
→ bulk user removal is safe
→ clicking employee opens details
→ First Name / Last Name / Email / Location editable
→ Role editable
→ SYSTEM_ADMIN has global access
→ FACILITY_ADMIN can be assigned site scope
→ BOOKING_MANAGER can be assigned one or more "book for others" sites
→ permission add/remove persists
→ BOOKING_MANAGER cannot manage users/desks
→ STANDARD_USER has no admin access
→ all role/permission enforcement exists server-side
→ page is ready for HRIS-synced employee data next phase

Start by reading CLAUDE.md, PROJECT_SPECS.md and this task file.

Then inspect the current User model, current Users page, permission models and booking authorization.

Give me a concise summary of what already exists and what needs to change.

Then begin implementation.

Do not stop after giving me a plan.
