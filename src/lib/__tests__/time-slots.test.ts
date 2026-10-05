import { describe, expect, it } from "vitest";

import {
  currentMinutesInTimeZone,
  defaultTimeWindow,
  firstMapDate,
  isMapDateSelectable,
  mapStartOptions,
  mapTimeWindow,
} from "@/lib/time-slots";

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

describe("Floor Map date/time helpers", () => {
  // 2026-07-01 is a Wednesday; 13:07Z is 14:07 in London (BST). Site open 07:00–18:00.
  const wed1407 = new Date("2026-07-01T13:07:00Z");

  it("today offers 'Now' (the current slot) and only later start times", () => {
    const { nowSlot, options } = mapStartOptions("2026-07-01", london, wed1407);
    expect(nowSlot).toBe(14 * 60);
    expect(options[0]).toBe(14 * 60 + 30);
    expect(options.at(-1)).toBe(17 * 60 + 30); // last start leaves one slot before 18:00
    expect(options.every((minutes) => minutes > 14 * 60 + 7)).toBe(true);
  });

  it("past dates offer nothing; future dates offer the whole operating day", () => {
    expect(mapStartOptions("2026-06-30", london, wed1407)).toEqual({ nowSlot: null, options: [] });
    const future = mapStartOptions("2026-07-02", london, wed1407);
    expect(future.nowSlot).toBeNull();
    expect(future.options[0]).toBe(420);
  });

  it("before opening there is no 'Now', only today's slots from opening", () => {
    const { nowSlot, options } = mapStartOptions("2026-07-01", london, new Date("2026-07-01T04:00:00Z"));
    expect(nowSlot).toBeNull();
    expect(options[0]).toBe(420);
  });

  it("weekends, past dates and today after closing can't be selected", () => {
    expect(isMapDateSelectable("2026-07-04", london, wed1407)).toBe(false); // Saturday
    expect(isMapDateSelectable("2026-06-30", london, wed1407)).toBe(false);
    expect(isMapDateSelectable("2026-07-01", london, new Date("2026-07-01T17:45:00Z"))).toBe(false); // 18:45 London
    expect(isMapDateSelectable("2026-07-01", london, wed1407)).toBe(true);
  });

  it("defaults to today, or the next weekday once today is over", () => {
    expect(firstMapDate(london, wed1407)).toBe("2026-07-01");
    expect(firstMapDate(london, new Date("2026-07-03T18:00:00Z"))).toBe("2026-07-06"); // Friday evening → Monday
  });

  it("evaluates from the chosen start until closing, falling back to Now for past or unset starts", () => {
    expect(mapTimeWindow("2026-07-01", null, london, wed1407)).toEqual({ startMinutes: 840, endMinutes: 1080, isNow: true });
    expect(mapTimeWindow("2026-07-01", 960, london, wed1407)).toEqual({ startMinutes: 960, endMinutes: 1080, isNow: false });
    expect(mapTimeWindow("2026-07-01", 600, london, wed1407)?.startMinutes).toBe(840); // 10:00 is past
    expect(mapTimeWindow("2026-07-02", null, london, wed1407)).toEqual({ startMinutes: 420, endMinutes: 1080, isNow: false });
    expect(mapTimeWindow("2026-06-30", null, london, wed1407)).toBeNull();
  });
});
