import { describe, expect, it } from "vitest";

import { zonedDateTimeToUtc } from "@/server/booking/time";

/**
 * Regression coverage for zonedDateTimeToUtc's end-of-day handling.
 * minutesFromMidnight=24*60 ("24:00:00") used to silently collapse to the
 * same instant as 00:00 on the same date instead of rolling to the next
 * day — which meant every "day window" query built from it (dayStart..dayEnd
 * in booking.ts / create-booking.ts) had dayEnd === dayStart, excluding
 * every real same-day booking from the day-window filter.
 */
describe("zonedDateTimeToUtc", () => {
  it("rolls 24:00 (end of day) over to 00:00 on the next date", () => {
    const dayStart = zonedDateTimeToUtc("2026-09-03", 0, "Europe/London");
    const dayEnd = zonedDateTimeToUtc("2026-09-03", 24 * 60, "Europe/London");

    expect(dayEnd.getTime()).toBeGreaterThan(dayStart.getTime());
    expect(dayEnd.getTime() - dayStart.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(dayEnd.toISOString()).toBe(zonedDateTimeToUtc("2026-09-04", 0, "Europe/London").toISOString());
  });

  it("converts an ordinary time of day correctly (regression)", () => {
    // 09:00 BST (UTC+1 in September) is 08:00 UTC.
    const startAt = zonedDateTimeToUtc("2026-09-03", 540, "Europe/London");
    expect(startAt.toISOString()).toBe("2026-09-03T08:00:00.000Z");
  });

  it("still rolls over correctly across a year boundary", () => {
    const dayEnd = zonedDateTimeToUtc("2026-12-31", 24 * 60, "Europe/London");
    expect(dayEnd.toISOString()).toBe(zonedDateTimeToUtc("2027-01-01", 0, "Europe/London").toISOString());
  });
});
