import { describe, expect, it } from "vitest";

import { currentMinutesInTimeZone, defaultTimeWindow } from "@/lib/time-slots";

const london = { timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1080 };

describe("currentMinutesInTimeZone", () => {
  it("returns the site-local wall clock, not UTC", () => {
    // 2026-07-01T13:07Z is 14:07 in London (BST)
    expect(currentMinutesInTimeZone("Europe/London", new Date("2026-07-01T13:07:00Z"))).toBe(
      14 * 60 + 7,
    );
    expect(currentMinutesInTimeZone("Asia/Tokyo", new Date("2026-07-01T13:07:00Z"))).toBe(
      22 * 60 + 7,
    );
  });

  it("treats midnight as 0, never 24*60", () => {
    expect(currentMinutesInTimeZone("UTC", new Date("2026-07-01T00:00:00Z"))).toBe(0);
  });
});

describe("defaultTimeWindow", () => {
  it("uses the current slot plus an hour when viewing today", () => {
    const now = new Date("2026-07-01T13:07:00Z"); // 14:07 London → slot 14:00
    expect(defaultTimeWindow("2026-07-01", london, now)).toEqual({
      startMinutes: 840,
      endMinutes: 900,
    });
  });

  it("clamps into operating hours before opening and after closing", () => {
    expect(defaultTimeWindow("2026-07-01", london, new Date("2026-07-01T04:00:00Z"))).toEqual({
      startMinutes: 420,
      endMinutes: 480,
    });
    expect(defaultTimeWindow("2026-07-01", london, new Date("2026-07-01T21:00:00Z"))).toEqual({
      startMinutes: 1050,
      endMinutes: 1080,
    });
  });

  it("uses the whole operating day for any other date", () => {
    expect(defaultTimeWindow("2026-07-02", london, new Date("2026-07-01T13:07:00Z"))).toEqual({
      startMinutes: 420,
      endMinutes: 1080,
    });
  });
});
