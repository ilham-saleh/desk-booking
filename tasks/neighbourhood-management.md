# TASK: Complete Neighbourhood Management

Before changing code, read:

1. `CLAUDE.md`
2. `PROJECT_SPECS.md`
3. This task file

Also review the OfficeSpace reference screenshots/recording in the screenshots folder showing how Neighbourhoods are created and edited.

Extend the existing Editor Tools and floor-map architecture.

The goal of this task is to allow admins to create, edit, reposition/resize where applicable, and delete Neighbourhoods on a floor.

---

# 1. WHAT A NEIGHBOURHOOD IS

A Neighbourhood is a logical area/group of desks on a floor.

Examples:

- Technology
- Finance
- Consulting
- Editorial
- Product
- Client Services

A Neighbourhood can:

- have a name
- have a colour
- contain multiple desks
- optionally have a description
- optionally have an image if the existing design supports it
- have employees/members associated with it
- have custoom restrictions that includes departments and employees

Neighbourhood membership and desk booking restrictions are separate concepts.

Do NOT automatically restrict desks just because they belong to a Neighbourhood.

---

# 2. ADMIN FLOW

The intended flow is:

Editing Platform

→ Select Site

→ Select Floor

→ Floor plan loads

→ Editor Tools

→ Editors / Edit mode

→ Neighbourhoods

→ Create 

→ "Choose a drawing tool" -> Points or Rectangle or (the screenshot shows to draw neighbourhooh and it highlights the area. If it is feasible do so otherwise prefer desk multi selection and highlight the area of selected desks to create neighbourhood)

→ select desks that belong to the Neighbourhood 

→ configure Neighbourhood details

→ give it a colour (refer to colour-selection.png)

→ configure members, rules and shifts if required 

→ Save

After saving:

- Neighbourhood remains visible on the floor plan
- associated desks remain linked
- refresh does not lose it
- switching floors and returning does not lose it
- Users can click neighbourhood area and the area border is highlighted and see the members and departments that can book desks in this neighbourhood on certain days 

---

# 3. EDITOR TOOLS

Add/use a section similar to:

Editor Tools

Editors

Seats
- Create
- Edit
- Delete

Neighbourhoods
- Create
- Edit
- Delete

Reuse the existing Editor Tools architecture.

Do not create a completely separate editor.

---

# 4. CREATE NEIGHBOURHOOD

Click:

Neighbourhoods
→ Create

The admin should then be able to define the Neighbourhood on the floor plan.

Preferred behaviour:

- enter Neighbourhood creation mode
- admin draws/selects an area on the map
- or selects the desks that should belong to it
- Neighbourhood configuration modal opens

Use the interaction that works best with the current floor-map library.

Do not require admins to enter coordinates manually.

If polygon/area drawing is already supported or reasonably achievable, use it.

Otherwise an acceptable first version is:

Create Neighbourhood
→ select multiple desks
→ save those desks as members of the Neighbourhood
→ display a visual outline/background around the grouped desks.

---

# 5. NEIGHBOURHOOD DETAILS

Open a modal/panel similar to other Editing Platform objects.

Fields:

Neighbourhood Name *

Example:

Technology

Colour *

Use a colour picker/select.

Description

Captian

Optional image (optional to upload) only if existing upload architecture makes this straightforward.

Display something similar to:

Neighbourhood Name
[ Technology ]

Captian
 [Ilham Saleh] optional to fill

Colour
[ blue ]

Description
[ Technology team seating area ] optional to fill

---

# 6. ASSIGNED DESKS

The Neighbourhood must contain one or more desks.

Show:

Assigned Desks

Example:

4.21
4.22
4.23
4.24
4.25

Admin should be able to:

- add desks
- remove desks
- visually select desks from the floor map where practical

Do not store desk names as comma-separated text.

Use relations.

Conceptually:

Neighbourhood
→ many Desks

A desk should preferably belong to zero or one Neighbourhood unless the current product architecture explicitly requires multiple.

Prevent accidental duplicate membership.

---

# 7. MEMBERS

The Neighbourhood should support employee membership.

Provide two useful ways of adding members.

## A. Select employees manually

Search:

- employee name
- email

Select one or more employees.

Example:

Members

Alex Smith
Sarah Jones
John Brown

---

## B. Match employees using employee fields

Allow rules based on employee/user data.

At minimum support:

- Department
- Title

Example:

Members matching:

Department
is
Technology

or:

Department
is any of
Technology
Engineering
Product

The employee data should come from the existing Users/Department data.

Do not hardcode employees or departments.

This will work more fully once Entra SSO is implemented.

---

# 8. IMPORTANT DISTINCTION

Only Neighbourhood membership must be able to book desks in the neighbourhood on days permitted 

Example:

Neighbourhood:
Technology

Members:
Department = Technology

Monday-Wednesday

This means Technology employees are associated with that Neighbourhood.

Others cannot book these desks on those days

when desk is selected to edit it should say "restircted to neighbourhood users" refer to reception-neighbourhood.desk.png

---

# 9. VISUAL APPEARANCE

After creation, show the Neighbourhood visually on the floor plan.

Use:

- Neighbourhood colour
- subtle transparent background and/or border
- Neighbourhood name/label

Do not cover desk markers or make them difficult to click.

Desk markers must remain interactive.

The Neighbourhood should sit visually behind desks.

---

# 10. SELECTING A NEIGHBOURHOOD

In Editing Platform Edit mode:

click/select Neighbourhood

→ show selected state

→ allow Edit / Delete

Editing opens the Neighbourhood configuration modal again.

Admin can change:

- name
- colour
- description
- assigned desks
- members/member rules

Save changes.

Everything must persist.

---

# 11. DELETE NEIGHBOURHOOD

Flow:

Neighbourhoods
→ select Neighbourhood
→ Delete

Show confirmation:

Delete Neighbourhood "Technology"?

Deleting the Neighbourhood will not delete its desks.

Cancel | Delete Neighbourhood

Important:

Deleting a Neighbourhood must NEVER delete desks.

It should only remove:

- Neighbourhood record
- desk associations
- employee/member associations
- visual Neighbourhood area

---

# 12. DATA MODEL

Inspect `schema.prisma` before adding new models.

Reuse existing models if they already support this.

Conceptually:

Neighbourhood

- id
- floorId
- name
- description?
- color
- imageUrl?
- geometry/position data if drawing an area
- createdAt
- updatedAt

NeighbourhoodDesk

- neighbourhoodId
- deskId

NeighbourhoodMember

- neighbourhoodId
- userId

NeighbourhoodRule

- neighbourhoodId
- field
- operator
- values

If the existing restriction rule infrastructure is reusable safely for employee matching, reuse shared rule-building utilities rather than duplicating logic.

Do NOT reuse booking restrictions themselves as Neighbourhood membership rules.

They are different domain concepts.

---

# 13. FLOOR SCOPE

A Neighbourhood belongs to one Floor.

Example:

London
→ Level 4
→ Technology Neighbourhood

It must not appear on another floor.

When the admin changes floor:

- load that floor's Neighbourhoods
- hide Neighbourhoods belonging to other floors

---

# 14. POSITION / GEOMETRY

If Neighbourhoods are represented as map areas, persist their geometry relative to the floor plan.

Do not save arbitrary browser pixel coordinates.

Use the same coordinate system used by desks/map objects.

Geometry should survive:

- refresh
- browser resize
- zoom
- switching floors

---

# 15. NORMAL FLOOR MAP

Once Neighbourhood creation works in Editing Platform, show the Neighbourhood on the normal Floor Map as a visual area/label only when the area is clicked

Do NOT allow normal users to edit it.

Users should still be able to click desks normally.

If useful, clicking/hovering the Neighbourhood name may show:

Technology

or:

Technology Neighbourhood

Do not build complex Neighbourhood booking behaviour in this task.

---

# 16. ACCEPTANCE TESTS

## Test 1 — Create

Editing Platform
→ Site
→ Floor
→ Neighbourhoods
→ Create

Create:

Technology

Colour:
Blue

Assign desks:
4.21
4.22
4.23

Save.

Refresh.

Expected:

Neighbourhood remains and contains the same desks.

---

## Test 2 — Floor isolation

Switch to another floor.

Expected:

Technology Neighbourhood does not appear.

Return to original floor.

Expected:

it appears again.

---

## Test 3 — Edit

Change:

Technology

to:

Technology & Product

Change colour.

Save.

Refresh.

Expected:

changes persist.

---

## Test 4 — Members

Add employees manually.

Save.

Refresh.

Expected:

members remain associated.

---

## Test 5 — Member rule

Add:

Department is Technology

Save.

Expected:

rule persists and matching employee data can be resolved.

---

## Test 6 — Desk booking independence

Desk belongs to Technology Neighbourhood.

Desk restriction = Anyone can book.

Expected:

employee outside Technology can still book the desk.

Neighbourhood membership must not override desk booking restrictions.

---

## Test 7 — Delete

Delete Technology Neighbourhood.

Expected:

Neighbourhood disappears.

Expected:

desks 4.21, 4.22 and 4.23 still exist.

No bookings are deleted.

---

# DEFINITION OF DONE

This task is complete when an admin can:

Editing Platform
→ choose Site
→ choose Floor
→ create Neighbourhood
→ name it
→ choose colour
→ visually define/associate its desks
→ add employees or employee matching rules
→ save
→ refresh without losing it
→ edit it
→ remove desks/members
→ delete it without deleting desks
→ see the Neighbourhood visually on the normal Floor Map

Start by inspecting the existing floor-map/editor architecture and Prisma schema.