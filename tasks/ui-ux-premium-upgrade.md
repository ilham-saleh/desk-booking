# TASK: Premium Enterprise UI/UX Upgrade

Before changing code, read:

1. `CLAUDE.md`
2. `PROJECT_SPECS.md`
3. This task file
4. Review the UI reference videos in the project/docs/
5. Review the Third Bridge corporate website:
   https://www.thirdbridge.com/en-us
6. Review the company logo/assets I have placed in `/docs`.
7. Only work on UI/UX. Do not change any functionality or data models

If a frontend design/taste skill is installed in this repository, inspect and use it where useful.

Do not blindly run the skill and accept everything it generates.

Use it as a design-quality aid while keeping this product's actual workflows and architecture intact.

---

# PRIMARY GOAL

The application currently works functionally but visually feels:

- basic
- bland
- prototype-like
- cheap
- inconsistent
- slower than expected
- visually heavy in the wrong places

The objective is to transform it into a product that feels:

**premium**
**enterprise**
**expensive**
**polished**
**fast**
**calm**
**intentional**
**professional**
**high-trust**

It should feel like a serious internal workplace platform built for a large global company, not a side project or CRUD dashboard.

This is not merely a colour/theme change.

The task includes:

- visual design system
- layout hierarchy
- interaction quality
- floor-map rendering
- zoom behaviour
- desk marker behaviour
- dropdown/select design
- side panels
- modal design
- spacing
- responsiveness
- loading states
- micro-interactions
- visual consistency
- perceived performance

The Third Bridge website should be used for brand direction.

---

# 1. FIRST INSPECT THE CURRENT APP

Before changing code, inspect:

- global CSS
- Tailwind configuration
- design tokens
- existing component library
- shadcn components if present
- layout shell
- header
- sidebar
- buttons
- inputs
- select/dropdown components
- modals/dialogs
- cards
- page containers
- Floor Map page
- Editing Platform
- desk markers
- floor rendering component
- zoom/pan implementation
- booking panel
- desk detail panel
- Facilities page
- Users page
- My Bookings
- Home
- And anything else

Also inspect installed design/taste skills.

Do not start changing individual colours randomly.

First understand the system.

---

# 2. ANALYSE THE REFERENCE VIDEOS

Compare my current application recording with the OfficeSpace reference videos.

Pay particular attention to and work better on:

## These strengths

- smooth floor-plan rendering
- smooth zooming
- smooth panning
- desk markers remain visually consistent while zooming
- desk icons feel polished and intentional
- desk status is easy to understand
- controls do not fight with the map
- map occupies the correct amount of viewport
- booking controls live in a dedicated side panel
- users do not need to scroll down to access the whole booking experience
- dropdowns feel like proper product components
- panels have clear hierarchy
- information density is controlled
- selected desks are obvious without being visually noisy
- layout feels stable when opening panels
- UI does not jump around
- modals feel contained and professional
- important actions are always reachable

---

# 3. BRAND DIRECTION — THIRD BRIDGE

Use Third Bridge's current visual identity as the brand reference.

The website's current design direction is:

- premium
- minimal
- clear
- high contrast
- large use of white/off-white space
- deep navy/dark blue typography
- cyan/turquoise brand accents
- restrained use of colour
- rounded shapes used deliberately
- strong whitespace
- modern enterprise feel
- simple navigation
- clean hierarchy

The company specifically describes its current rebrand as focused on clarity, simplicity and making its premium offering clearer and more accessible.

Reflect that philosophy in this application.

---

# 4. DO NOT GUESS BRAND VALUES

Inspect the live Third Bridge website and extract the actual brand values where technically possible.

Use browser/Playwright/devtools or the installed playwright CLI skill or design skill to inspect:

- primary colours
- secondary colours
- background colours
- text colours
- border colours
- accent colours
- font-family
- font weights
- border radius patterns
- button treatment
- navigation styling
- spacing feel

Do not invent an exact hexadecimal palette if the live values can be inspected.

Create reusable application design tokens from the findings.

For example:

```css
--brand-navy
--brand-navy-hover
--brand-cyan
--brand-cyan-soft
--brand-background
--surface
--surface-muted
--border-subtle
--text-primary
--text-secondary
--text-muted
--danger
--success


# 5. LOGO
I will place the official company logo inside /docs.

# 6. TYPOGRAPHY

The typography should feel:
- modern
- clean
- understated
- enterprise
- highly readable

Create consistent type styles for:
- page title
- section title
- card title
- body
- labels
- helper text
- table headers
- buttons
- captions


# 7. Upgrade the entire shell.

Sidebar
Current sidebar should feel less like a prototype menu.

Improve:
- width
- spacing
- selected state
- icons
- typography
- hover state
- grouping
- visual separation

Use subtle colour treatment.

Header
Improve:
- logo placement
- global search
- user avatar/profile
- notifications if retained
- spacing
- borders
- background

The header should feel integrated into the shell rather than a separate white strip with random controls.

Selected navigation item should feel premium, not like a heavy bordered rectangle.
Consider:
- soft cyan/navy active state
- subtle left indicator
- clean icon alignment

Keep navigation compact.


# 8. OVERALL PAGE WIDTH / SPACING

The application currently feels too large and empty in some places and cramped in others.
Create consistent layout rules.

Example:
sidebar
header
page content
page toolbar
main content


# 9. MAP-FIRST LAYOUT

This is extremely important.
The Floor Map and Booking experience should be designed around the viewport.
Users should NOT have to scroll down the webpage to use the full map.
The map area should fit inside the available browser height.


Conceptually:
┌────────────────────────────────────────────────────────────┐
│ Header                                                     │
├──────────────┬───────────────────────────────┬──────────────┤
│ Sidebar      │                               │ Booking /    │
│              │        FLOOR MAP              │ Desk Panel   │
│              │                               │              │
│              │                               │              │
│              │                               │              │
└──────────────┴───────────────────────────────┴──────────────┘

The map should use the remaining viewport height.
For example conceptually:
height: calc(100vh - headerHeight)

Do not make the floor-plan image itself determine page height.

# 10. BOOK A DESK LAYOUT

The current app places booking controls above the map.
This wastes vertical space and makes users scroll.
Change this.
Use a dedicated right-side booking panel similar in interaction to the OfficeSpace reference.
Flow:
Book a Desk
→ right panel opens
→ choose site/floor, enter name, date, time...
→ click find availabkle desk
→ floor map loads
→ click available desk
→ click book

The right panel should contain:
- Occupant
- Date
- Start time
- End time
- Repeats
- Filters/features if appropriate
- Find Available Desks / Book Desk action


# 11. FLOOR MAP LAYOUT

Map should:
- fill available space
- stay centred
- fit floor plan intelligently
- not require vertical document scrolling
- allow smooth pan
- allow smooth zoom
- have contained controls

Add subtle map controls:
- zoom in
- zoom out
- reset / fit to floor
- optional fullscreen if useful
Place them in a compact floating control cluster.
Avoid large toolbar bars covering the floor plan.


# 12. PERFORMANCE / RENDERING
The current Floor Map should render and be moved around smoothly. Currently when it is moved, zoomed in and out it is too slow. Fix it.

# 13. PERCEIVED MAP PERFORMANCE
Even after technical optimization, make the loading experience polished.
When changing floor:
- do not blank the entire page abruptly
- show a subtle map loading state
- preserve layout dimensions
- fade in floor plan when ready
- then reveal markers
- avoid content jumping
Use a lightweight progress/skeleton overlay.
The product should feel fast even when network data takes a moment.


# 14. ZOOM BEHAVIOUR

Keep desk icons visually consistent while zooming.
The current app allows desk icons to become visually huge/small relative to the interface.
Fix this.

Desk markers should maintain a consistent screen-space size while their geographical/floor position moves with the map.
The icon should NOT visually scale at the same rate as the underlying floor-plan image.

Depending on the map implementation:
- counter-scale markers against zoom
- render markers in a separate overlay layer
- use map-library markers that remain constant pixel size
- apply inverse CSS scale

Choose the correct solution for the existing architecture.
Do not hack this with arbitrary zoom-specific width values.

Use proper desk icons not just a coloured circle shape. See desk-icons-example.png in the /docs/screenshots folder for reference. Use different cooloured icons for diffent desk status for example for unavailable/occupied desk use user desk icon and for available desk different one. Icons should be proper desk icons in the editing platform, desk creation pages too.

# 15. DESK DETAIL PANEL

The current desk information panel looks too basic.
Redesign it as a premium product panel.
Use a fixed/right-side panel or drawer that does NOT make the whole page reflow awkwardly.

Example hierarchy:
Desk 4.45                         X
Level 4 · London

AVAILABLE
────────────────────

Booking

Occupant
Ilham Nabijonov

Date
Mon, 28 Sep

09:00        17:00

Repeats
Does not repeat

[ BOOK DESK ]

────────────────────

Restricted to

Technology
Wed

Anyone can book
Mon, Tue, Thu, Fri

────────────────────

Today's bookings

No upcoming bookings

[ View desk calendar ]

────────────────────

Desk features

Dual monitor
Dock
Standing desk

# EDITING PLATFORM
The Editing Platform should feel like a proper visual editor.
Use a layout similar to:

┌───────────────┬──────────────────────────────────────────────┐
│ Editor Tools  │                                              │
│               │                                              │
│ Select/Edit   │              FLOOR PLAN                      │
│               │                                              │
│ Seats         │                                              │
│ Neighbourhoods│                                              │
│ Utilities     │                                              │
│ Labels        │                                              │
| Upload map    |                                              |
└───────────────┴──────────────────────────────────────────────┘

# MICRO-INTERACTIONS
Add subtle polish.
Examples:
- 120–200ms hover transitions
- panel slide/fade
- marker selection animation
- dropdown fade/scale
- button pressed states
- loading transitions
- toast feedback
Do NOT make animations flashy.
Enterprise apps should feel responsive, not playful.


# RESPONSIVE BEHAVIOUR
Primary target is desktop/laptop.
However ensure the app behaves reasonably at:
- 1366×768
- 1440×900
- 1920×1080

The Floor Map should remain usable at laptop height.
This is especially important.
Do not optimize only for a tall developer monitor.

# 1366×768 ACCEPTANCE TARGET
At 1366×768:
A normal user should be able to see:
- header
- sidebar
- site/floor controls
- most/all floor map
- booking/detail right panel
without vertically scrolling the entire page.
Individual panels may scroll internally where necessary.


# DESIGN SYSTEM
Before redesigning many pages, create or consolidate reusable primitives.
Potentially:
- Button
- Input
- Select
- SearchableSelect
- DatePicker
- TimePicker
- Panel
- Modal
- Drawer
- Card
- DataTable
- StatusBadge
- IconButton
- PageHeader
- Toolbar
- EmptyState
- LoadingState

Reuse these rather than styling every screen separately.

# USE THE INSTALLED TASTE/DESIGN SKILL
Inspect the installed frontend design/taste skill.
Use it to help with:
- spacing
- hierarchy
- component polish
- layout quality
- typography
- interaction quality
- visual critique
Do NOT let it:
- rewrite domain logic
- replace working booking functionality
- change database models unnecessarily
- introduce excessive dependencies
- redesign the product away from the Third Bridge brand
Use it deliberately, not blindly.

# BRAND CONSISTENCY
The finished product should clearly look like it belongs to Third Bridge.
The user should see:
- Third Bridge logo
- Third Bridge colour palette
- Third Bridge typography direction
- restrained premium visual language
But it should still feel like an internal enterprise software product rather than a marketing website.
Do not copy large marketing-site hero sections into the application.
Translate the brand into an enterprise application design system.

# PREMIUM / EXPENSIVE FEEL
This is a core acceptance requirement.
When evaluating a component, ask:
Does this look like software a global company would pay significantly for?
The application should NOT feel like:
- a tutorial project
- default Tailwind
- default shadcn with no design layer
- a student CRUD dashboard
- a generic AI-generated SaaS template
It SHOULD feel like:
- mature B2B SaaS
- enterprise workplace software
- professionally product-designed
- visually expensive
- stable
- deliberate
- polished
Achieve this through:
- consistency
- typography
- spacing
- behaviour
- performance
- restraint


# ZOOM ACCEPTANCE TEST
Zoom:
50%
100%
150%
200%
Expected:
floor-plan geometry changes scale.
Desk marker visual size remains approximately constant in screen pixels.
Marker should not become huge when zooming out or tiny when zoomin

# UI CONSISTENCY TEST
Inspect:
- Home
- My Bookings
- Book a Desk
- Floor Map
- Editing Platform
- Facilities / Sites
- Users
Expected:
same:
- buttons
- font hierarchy
- inputs
- selects
- panels
- colours
- spacing
- border radii
- shadows
- status indicators
It should feel like one product.

# DO NOT BREAK FUNCTIONALITY
Do not break:
- booking
- cancellation
- restrictions
- site/floor loading
- editing platform
- desk coordinates
- user management
- facility management
This task is primarily UI/UX and performance.
Avoid schema changes unless required for a real performance issue.

DEFINITION OF DONE
This task is complete when the app:
- feels premium
- feels enterprise
- feels expensive
- matches Third Bridge brand direction
- uses the supplied logo
- has consistent typography
- has a coherent design system
- has professional dropdowns
- has professional side panels
- has a professional Editing Platform
- has a professional Floor Map
- has smooth zoom/pan
- keeps desk markers visually constant in size
- renders floor plans faster
- keeps booking controls in a right-side panel
- avoids unnecessary page scrolling
- works well at laptop viewport height
- preserves all existing functionality
Do not tell me this is complete merely because colours changed.
This is a full product-quality UI/UX refinement.
```
