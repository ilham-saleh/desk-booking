import { describe, expect, it } from "vitest";

import { parseFloorLocation, pickValidId } from "@/lib/use-floor-location";

describe("parseFloorLocation", () => {
  it("reads a stored site/floor pair", () => {
    expect(parseFloorLocation('{"siteId":"s1","floorId":"f4"}')).toEqual({
      siteId: "s1",
      floorId: "f4",
    });
  });

  it("ignores missing, corrupt or incomplete entries", () => {
    expect(parseFloorLocation(null)).toBeNull();
    expect(parseFloorLocation("not json")).toBeNull();
    expect(parseFloorLocation('{"siteId":"s1"}')).toBeNull();
    expect(parseFloorLocation('{"siteId":"s1","floorId":""}')).toBeNull();
    expect(parseFloorLocation('{"siteId":1,"floorId":"f4"}')).toBeNull();
  });
});

describe("pickValidId", () => {
  const floors = ["f2", "f4"];

  it("prefers the first candidate the viewer can actually see", () => {
    expect(pickValidId(["f4", "f2"], floors)).toBe("f4");
  });

  it("skips ids that were deleted or belong elsewhere", () => {
    expect(pickValidId(["gone", null, "f2"], floors)).toBe("f2");
    expect(pickValidId(["gone", undefined], floors)).toBeUndefined();
  });
});
