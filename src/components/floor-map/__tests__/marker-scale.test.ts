import { describe, expect, it } from "vitest";

import {
  LABEL_MIN_MARKER_PX,
  MARKER,
  MIN_MARKER_PX,
  SPRITE_TIERS,
  autoMarkerFootprint,
  markerFootprintBounds,
  markerGroupScale,
  markerLevel,
  markerPlanScale,
  roomLabelFontSize,
} from "@/components/floor-map/marker-scale";

/** A rows × cols grid of desks `gap` plan pixels apart. */
function grid(rows: number, cols: number, gap: number, origin = 500) {
  return Array.from({ length: rows * cols }, (_, i) => ({ x: origin + (i % cols) * gap, y: origin + Math.floor(i / cols) * gap }));
}

const footprintOf = (scale: number) => scale * MARKER.footprint;

describe("markerPlanScale", () => {
  it("sizes markers from desk spacing, leaving a gap between neighbours", () => {
    const footprint = footprintOf(markerPlanScale(grid(4, 6, 50), 2000, 2600));
    expect(footprint).toBeCloseTo(50 * 0.65);
    expect(footprint).toBeLessThan(50);
  });

  it("is independent of the plan image's resolution", () => {
    const low = markerPlanScale(grid(4, 6, 50), 2000, 2600);
    const high = markerPlanScale(grid(4, 6, 100, 1000), 4000, 5200);
    expect(high).toBeCloseTo(low * 2);
  });

  it("uses the typical spacing, not one stray desk", () => {
    const desks = [...grid(4, 6, 50), { x: 1900, y: 2500 }];
    expect(footprintOf(markerPlanScale(desks, 2000, 2600))).toBeCloseTo(50 * 0.65);
  });

  it("falls back to a share of the plan with too few desks", () => {
    const span = 2600;
    expect(footprintOf(markerPlanScale([], 2000, span))).toBeCloseTo(span * 0.018);
    expect(footprintOf(markerPlanScale(grid(1, 3, 50), 2000, span))).toBeCloseTo(span * 0.018);
  });

  it("ignores stacked desks and clamps extremes to the plan", () => {
    const stacked = Array.from({ length: 6 }, () => ({ x: 100, y: 100 }));
    expect(footprintOf(markerPlanScale(stacked, 1000, 1000))).toBeCloseTo(18);
    expect(footprintOf(markerPlanScale(grid(2, 3, 2), 1000, 1000))).toBeCloseTo(6);
    expect(footprintOf(markerPlanScale(grid(2, 3, 900), 1000, 1000))).toBeCloseTo(30);
  });

  it("uses the admin-chosen size instead of desk spacing", () => {
    expect(footprintOf(markerPlanScale(grid(4, 6, 50), 2000, 2600, 20))).toBeCloseTo(20);
    expect(footprintOf(markerPlanScale([], 2000, 2600, 20))).toBeCloseTo(20);
  });

  it("falls back to auto sizing when no size is chosen", () => {
    const auto = autoMarkerFootprint(grid(4, 6, 50), 2000, 2600);
    expect(footprintOf(markerPlanScale(grid(4, 6, 50), 2000, 2600, null))).toBeCloseTo(auto);
  });

  it("keeps an admin-chosen size within the plan's bounds", () => {
    const { min, max } = markerFootprintBounds(1000, 1000);
    expect(footprintOf(markerPlanScale([], 1000, 1000, 1))).toBeCloseTo(min);
    expect(footprintOf(markerPlanScale([], 1000, 1000, 500))).toBeCloseTo(max);
  });
});

describe("markerGroupScale", () => {
  it("follows the plan while the marker is legible on screen", () => {
    expect(markerGroupScale(2, 1)).toBe(2);
    expect(markerGroupScale(2, 4)).toBe(2);
  });

  it("stops shrinking below the minimum on-screen width", () => {
    const stageScale = 0.05;
    expect(markerGroupScale(2, stageScale) * stageScale * MARKER.width).toBeCloseTo(MIN_MARKER_PX);
  });
});

describe("markerLevel", () => {
  it("draws desk numbers inside markers only once they're large enough", () => {
    expect(markerLevel(LABEL_MIN_MARKER_PX - 1, 1).labelled).toBe(false);
    expect(markerLevel(LABEL_MIN_MARKER_PX, 1).labelled).toBe(true);
  });

  it("picks the smallest sprite resolution covering the device pixels", () => {
    expect(markerLevel(MARKER.width, 1).tier).toBe(2);
    expect(markerLevel(MARKER.width * 2, 2).tier).toBe(4);
    expect(markerLevel(MARKER.width * 3, 2).tier).toBe(8);
    expect(markerLevel(MARKER.width * 100, 2).tier).toBe(SPRITE_TIERS[SPRITE_TIERS.length - 1]);
  });
});

describe("roomLabelFontSize", () => {
  it("fits long names to the room's width", () => {
    const size = roomLabelFontSize("Meeting Room 4A", 120, 200, 10);
    expect(size * ("Meeting Room 4A".length * 0.6 + 1)).toBeLessThanOrEqual(120 + 1e-9);
  });

  it("limits short names by the room's height", () => {
    expect(roomLabelFontSize("4C", 400, 100, 10)).toBeCloseTo(16);
  });

  it("never outgrows the floor's markers", () => {
    expect(roomLabelFontSize("4C", 2000, 1000, 1)).toBeCloseTo(MARKER.footprint * 0.6);
  });
});
