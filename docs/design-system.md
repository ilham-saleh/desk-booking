# Design system

The UI follows Third Bridge's brand. Brand values were taken from the live thirdbridge.com stylesheet (its `--brand__color--*` custom properties) and from computed styles. They are not guesses.

## Tokens

All tokens are defined in `src/app/globals.css`. Use the Tailwind utilities that map to them rather than raw hex values or the Tailwind palette (`gray-*`, `blue-*` and so on).

| Role | Token / utility | Value | Source |
| --- | --- | --- | --- |
| Primary / base | `navy` | `#00264C` | TB `dark-blue` |
| Accent (one per screen) | `cyan` · `cyan-ink` text | `#1DBFC2` · `#012B30` | TB `bright-teal` CTA |
| Logo light blue | `light-blue` | `#BBDDFF` | TB `light-blue` |
| App canvas | `background` | `#F2F5F8` | TB `accent1--bg` |
| Auth canvas | `off-white` | `#FFFBF3` | TB page background |
| Status | `success` / `warning` / `danger` (+ `-soft`) | derived | AA contrast on white |

- **Font:** Inter, via `next/font`, which is the site's primary typeface.
- **Type scale:** `type-page-title`, `type-section-title`, `type-card-title`, `type-body`, `type-label`, `type-helper`, `type-overline`, `type-caption`.
- **Shape rule:** buttons are pills (the site's CTA uses a 25px radius), fields are 10px, and cards, panels and dialogs are 16px.
- **Shadows:** navy-tinted, never pure black.

## Primitives

| Need | Use |
| --- | --- |
| Page title block | `ui/page-header` → `PageHeader`, `PageContainer` |
| Map-screen right panel | `ui/side-panel` → `SidePanel`, `SidePanelHeader`, `SidePanelSection`, `SidePanelFooter`, `DetailRow` |
| Empty and loading states | `ui/empty-state`, `ui/loading` (`Skeleton`, `ProgressBar`, `Spinner`, `TableSkeleton`) |
| Date and time fields | `booking/booking-fields` → `DateStepper`, `TimeRangeFields` |
| Buttons | `Button` variants: `default` (navy), `brand` (teal, for the single primary action), `outline`, `secondary`, `ghost`, `destructive` |
| Status chips | `Badge` variants: `success`, `warning`, `brand`, `muted`, `destructive`. Pass `dot` so state isn't shown by colour alone |

## Floor-plan rendering

The Floor Map, Book a Desk and the Editing Platform all share `src/components/floor-map`:

- **`map-viewport.ts`:** handles pan, zoom and fit on the Konva stage. It is applied imperatively, so pan and zoom cause no React renders. Nodes named `counter-scale` get the inverse stage scale, which keeps desk markers a constant on-screen size at any zoom. Desk coordinates remain floor-plan image pixels.
- **`desk-markers.tsx`:** desk pins built from lucide glyphs and pre-rendered once into bitmaps. Kinds are available, booked, restricted, inactive, editor states and the placement ghost.
- **`map-chrome.tsx`:** the floating zoom cluster, the legend, and the loading overlay.

Map screens fill `main` (`absolute inset-0`). The map uses the remaining viewport, and the booking and details panel docks on the right. Below `lg`/`xl` the panel floats over the map instead.
