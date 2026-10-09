/**
 * Marker sizing for the floor-plan stage — pure geometry, shared by the
 * employee Floor Map and the admin Editing Platform.
 *
 * Markers are sized ON THE FLOOR PLAN, like the furniture: zooming the map
 * zooms them too, so they never crowd each other at "fit" or shrink against
 * the plan when zooming in. Their plan size is either set by an admin per
 * floor plan (`FloorPlanVersion.markerSize`) or, by default, derived from the
 * floor's own desk spacing, so it works for any floor-plan image resolution.
 */

/** Sprite artwork is drawn in these design units, then displayed at MARKER size. */
export const DESIGN = { width: 36, height: 36, anchorX: 18, anchorY: 18, radius: 13, ring: 3.25, tail: 3, glowRadius: 17.5 } as const;
const DISPLAY_SCALE = 24 / DESIGN.width;

/**
 * Marker geometry in marker units — the local coordinate space of a marker
 * group. The group's scale (see `markerGroupScale`) maps it onto the plan.
 * The disc centre sits exactly on the desk's coordinate.
 */
export const MARKER = {
  width: DESIGN.width * DISPLAY_SCALE,
  height: DESIGN.height * DISPLAY_SCALE,
  anchorX: DESIGN.anchorX * DISPLAY_SCALE,
  anchorY: DESIGN.anchorY * DISPLAY_SCALE,
  radius: DESIGN.radius * DISPLAY_SCALE,
  /** Radius of the light inner disc that holds the glyph or desk number. */
  innerRadius: (DESIGN.radius - DESIGN.ring) * DISPLAY_SCALE,
  /** Outer glow diameter — the marker's footprint. */
  footprint: DESIGN.glowRadius * 2 * DISPLAY_SCALE,
  /** Centre offset (x right, y up) and radius of the small status badges at the pin's top corners. */
  badgeOffset: 7,
  badgeRadius: 3.25,
} as const;

/**
 * Marker footprint (outer glow) as a share of the typical gap between
 * neighbouring desks, leaving clear plan between neighbours. Spacing only
 * approximates the furniture's drawn size (sparsely placed desks read as big
 * desks), which is why admins can override it per floor plan.
 */
const SPACING_SHARE = 0.65;
/** Footprint bounds (auto and admin-chosen) and fallback, as a share of the plan's longer side. */
const FOOTPRINT_MIN = 0.006;
const FOOTPRINT_MAX = 0.03;
const FOOTPRINT_FALLBACK = 0.018;
/** Desk spacing is only trusted once a floor has a few desks. */
const MIN_DESKS_FOR_SPACING = 4;

/** Below this on-screen width markers stop shrinking, so a zoomed-out floor never loses its desks. */
export const MIN_MARKER_PX = 12;
/** From this on-screen width the desk number is drawn inside the disc. */
export const LABEL_MIN_MARKER_PX = 44;
/** Minimum on-screen diameter of a marker's click/tap target. */
export const MIN_HIT_PX = 24;
/** Plan text (room names) is hidden while it would render smaller than this. */
export const MIN_PLAN_TEXT_PX = 8;
/** Sprite bitmap resolutions, as multiples of the marker's unit width. */
export const SPRITE_TIERS = [2, 4, 8, 12] as const;
export type SpriteTier = (typeof SPRITE_TIERS)[number];

/** Allowed marker footprint range (plan pixels) for a plan image — also validates admin-chosen sizes. */
export function markerFootprintBounds(planWidth: number, planHeight: number): { min: number; max: number } {
  const span = Math.max(planWidth, planHeight, 1);
  return { min: span * FOOTPRINT_MIN, max: span * FOOTPRINT_MAX };
}

/** Marker footprint (plan pixels) chosen automatically from desk spacing. */
export function autoMarkerFootprint(points: ReadonlyArray<{ x: number; y: number }>, planWidth: number, planHeight: number): number {
  const span = Math.max(planWidth, planHeight, 1);
  let footprint = span * FOOTPRINT_FALLBACK;

  if (points.length >= MIN_DESKS_FOR_SPACING) {
    const nearest: number[] = [];
    for (let i = 0; i < points.length; i++) {
      let best = Infinity;
      for (let j = 0; j < points.length; j++) {
        if (i === j) continue;
        const d2 = (points[i]!.x - points[j]!.x) ** 2 + (points[i]!.y - points[j]!.y) ** 2;
        // Stacked desks (same coordinate) say nothing about spacing.
        if (d2 > 0 && d2 < best) best = d2;
      }
      if (Number.isFinite(best)) nearest.push(Math.sqrt(best));
    }
    if (nearest.length >= MIN_DESKS_FOR_SPACING) {
      nearest.sort((a, b) => a - b);
      const mid = nearest.length >> 1;
      const median = nearest.length % 2 ? nearest[mid]! : (nearest[mid - 1]! + nearest[mid]!) / 2;
      footprint = median * SPACING_SHARE;
    }
  }

  const { min, max } = markerFootprintBounds(planWidth, planHeight);
  return Math.min(max, Math.max(min, footprint));
}

/**
 * Marker-group scale (plan pixels per marker unit) for a floor: the
 * admin-chosen footprint when set, otherwise a share of the median
 * nearest-neighbour desk distance, clamped to a sane share of the plan so one
 * stray desk can't blow it up.
 */
export function markerPlanScale(
  points: ReadonlyArray<{ x: number; y: number }>,
  planWidth: number,
  planHeight: number,
  markerSize?: number | null,
): number {
  const { min, max } = markerFootprintBounds(planWidth, planHeight);
  const footprint = markerSize != null && markerSize > 0 ? Math.min(max, Math.max(min, markerSize)) : autoMarkerFootprint(points, planWidth, planHeight);
  return footprint / MARKER.footprint;
}

/** Marker-group scale at a given stage scale: the plan size, but never below MIN_MARKER_PX on screen. */
export function markerGroupScale(planScale: number, stageScale: number): number {
  return Math.max(planScale, MIN_MARKER_PX / (MARKER.width * stageScale));
}

export interface MarkerLevel {
  /** Sprite resolution to draw markers with. */
  tier: SpriteTier;
  /** Markers are large enough on screen to carry their desk number. */
  labelled: boolean;
}

export function markerLevel(screenWidth: number, pixelRatio: number): MarkerLevel {
  const needed = screenWidth * pixelRatio;
  const tier = SPRITE_TIERS.find((t) => t * MARKER.width >= needed) ?? SPRITE_TIERS[SPRITE_TIERS.length - 1]!;
  return { tier, labelled: screenWidth >= LABEL_MIN_MARKER_PX };
}

/**
 * Plan-space font size that fits a room's name inside the room, capped
 * relative to the floor's markers so a large room doesn't get a headline.
 */
export function roomLabelFontSize(name: string, width: number, height: number, planScale: number): number {
  const byHeight = height * 0.16;
  // ~0.6em per character for a semibold sans; padding is 0.5em per side.
  const byWidth = width / (Math.max(name.length, 4) * 0.6 + 1);
  const byMarkers = planScale * MARKER.footprint * 0.6;
  return Math.max(1, Math.min(byHeight, byWidth, byMarkers));
}
