import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, Role } from "@/generated/prisma/client";
import { appRouter } from "@/server/api/root";

/**
 * Desk Management acceptance tests (tasks/desk-management.md §35) run through
 * the real tRPC routers against DATABASE_URL_TEST:
 *  - authorization: standard user / other-site facility admin are refused
 *  - desk position persists (create at a point, move, reload)
 *  - edit modal save persists details + four restriction/shift blocks
 *  - overlapping shifts rejected
 *  - eligibility + booking validation pick the right block and use the occupant
 *  - safe delete: future bookings block, history archives, otherwise hard delete
 *  - restriction delete blocked while assigned unless forced
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

type SessionUser = { id: string; name: string; email: string; role: Role; organizationId: string | null };
const callerFor = (user: SessionUser) => appRouter.createCaller({ db, headers: new Headers(), session: { user } });

/** Next occurrence (strictly after today, at least 2 days out to dodge "in the past") of a weekday, YYYY-MM-DD. */
function nextDateFor(dayOfWeek: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2);
  while (date.getUTCDay() !== dayOfWeek) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const SLUGS = ["desk-mgmt-test-a", "desk-mgmt-test-b"];

let orgA: { id: string };
let orgB: { id: string };
let siteA: { id: string };
let siteB: { id: string };
let floorA: { id: string };
let floorB: { id: string };
let deskB: { id: string };
let superAdmin: SessionUser;
let facilityAdminA: SessionUser;
let engineer: SessionUser;
let salesperson: SessionUser;
let shifts: Record<string, string>;
let technologyId: string;

async function cleanup() {
  const orgs = await db.organization.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length === 0) return;
  await db.auditLog.deleteMany({ where: { organizationId: { in: ids } } });
  await db.booking.deleteMany({ where: { organizationId: { in: ids } } });
  await db.deskRestrictionAssignment.deleteMany({ where: { organizationId: { in: ids } } });
  await db.deskAttribute.deleteMany({ where: { organizationId: { in: ids } } });
  await db.desk.deleteMany({ where: { organizationId: { in: ids } } });
  await db.availabilityShift.deleteMany({ where: { organizationId: { in: ids } } });
  await db.bookingRestriction.deleteMany({ where: { organizationId: { in: ids } } });
  await db.department.deleteMany({ where: { organizationId: { in: ids } } });
  await db.permission.deleteMany({ where: { organizationId: { in: ids } } });
  await db.floor.deleteMany({ where: { organizationId: { in: ids } } });
  await db.site.deleteMany({ where: { organizationId: { in: ids } } });
  await db.user.deleteMany({ where: { organizationId: { in: ids } } });
  await db.organization.deleteMany({ where: { id: { in: ids } } });
}

describe("desk management", () => {
  beforeAll(async () => {
    await cleanup();

    orgA = await db.organization.create({ data: { name: "Desk Mgmt A", slug: SLUGS[0]!, ssoGoogleDomains: [] } });
    orgB = await db.organization.create({ data: { name: "Desk Mgmt B", slug: SLUGS[1]!, ssoGoogleDomains: [] } });

    siteA = await db.site.create({
      data: { organizationId: orgA.id, name: "London", timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1140 },
    });
    siteB = await db.site.create({
      data: { organizationId: orgA.id, name: "New York", timeZone: "America/New_York", operatingHoursStart: 420, operatingHoursEnd: 1140 },
    });
    floorA = await db.floor.create({ data: { organizationId: orgA.id, siteId: siteA.id, name: "Level 2" } });
    floorB = await db.floor.create({ data: { organizationId: orgA.id, siteId: siteB.id, name: "NY 1" } });
    deskB = await db.desk.create({ data: { organizationId: orgA.id, floorId: floorB.id, number: "NY.01", x: 10, y: 10 } });

    const mk = async (email: string, name: string, role: Role, department: string | null) => {
      const row = await db.user.create({ data: { organizationId: orgA.id, email, name, role, department } });
      return { id: row.id, name: row.name, email: row.email, role: row.role, organizationId: orgA.id } satisfies SessionUser;
    };
    superAdmin = await mk("super@dm.test", "Super Admin", Role.ORG_SUPER_ADMIN, null);
    facilityAdminA = await mk("facility@dm.test", "London Facility Admin", Role.SITE_ADMIN, "Facilities");
    engineer = await mk("eng@dm.test", "Eng Employee", Role.STANDARD_USER, "Engineering");
    salesperson = await mk("sales@dm.test", "Sales Employee", Role.STANDARD_USER, "Sales");
    await db.permission.create({ data: { organizationId: orgA.id, userId: facilityAdminA.id, siteId: siteA.id, type: "FACILITY_ADMIN" } });

    // Other org, to prove restriction lookups are tenant-scoped.
    await db.bookingRestriction.create({ data: { organizationId: orgB.id, name: "Other Org Only" } });

    const admin = callerFor(superAdmin);
    shifts = {};
    for (const [name, daysOfWeek] of [
      ["Mon + Fri", [1, 5]],
      ["Tuesday Only", [2]],
      ["Wednesday Only", [3]],
      ["Thursday Only", [4]],
      ["Mon & Wed", [1, 3]],
    ] as Array<[string, number[]]>) {
      shifts[name] = (await admin.shift.create({ name, daysOfWeek })).id;
    }

    technologyId = (
      await admin.restriction.createRestriction({
        name: "Technology",
        color: "#2563eb",
        rules: [{ fieldType: "DEPARTMENT", operator: "IS_ANY_OF", value: ["Engineering", "Product", "Technology"], connector: "OR" }],
      })
    ).id;
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  // ----- Authorization -----

  it("refuses desk mutations from a standard user", async () => {
    await expect(callerFor(engineer).desk.createDesk({ floorId: floorA.id, x: 100, y: 100 })).rejects.toThrow(/FORBIDDEN/);
  });

  it("refuses a Facility Admin editing a desk on a site they don't manage", async () => {
    await expect(callerFor(facilityAdminA).desk.moveDesk({ deskId: deskB.id, x: 1, y: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(facilityAdminA).desk.createDesk({ floorId: floorB.id, x: 1, y: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ----- Create / position / persist -----

  let deskId: string;

  it("creates a desk at a map position with an auto name, then persists a move", async () => {
    const admin = callerFor(facilityAdminA);
    const created = await admin.desk.createDesk({ floorId: floorA.id, x: 320.5, y: 180 });
    deskId = created.id;
    expect(created.number).toBe("Desk 1");
    expect(created.x).toBe(320.5);

    await admin.desk.moveDesk({ deskId, x: 640, y: 360 });
    const reloaded = await admin.desk.get({ deskId });
    expect(reloaded.x).toBe(640);
    expect(reloaded.y).toBe(360);

    const listed = await admin.desk.listForFloor({ floorId: floorA.id });
    expect(listed.map((d) => d.id)).toEqual([deskId]);
    expect((await admin.desk.listForFloor({ floorId: floorB.id })).map((d) => d.id)).toEqual([deskB.id]);
  });

  it("rejects a duplicate desk name on the same floor with a clear message", async () => {
    await expect(callerFor(facilityAdminA).desk.createDesk({ floorId: floorA.id, number: "Desk 1", x: 1, y: 1 })).rejects.toThrow(
      /already exists on Level 2/,
    );
  });

  // ----- Edit modal save -----

  it("saves details plus four restriction/shift blocks and returns them on reload", async () => {
    const admin = callerFor(facilityAdminA);
    const saved = await admin.desk.save({
      deskId,
      number: "2.21",
      description: "Quiet desk beside the window.",
      isActive: true,
      requiresCheckIn: true,
      assignmentMode: "BOOKABLE",
      attributes: ["STANDING_DESK", "near_window"],
      assignments: [
        { restrictionMode: "ANYONE", shiftId: shifts["Mon + Fri"]! },
        { restrictionMode: "CUSTOM", restrictionId: technologyId, shiftId: shifts["Wednesday Only"]! },
        { restrictionMode: "ANYONE", shiftId: shifts["Thursday Only"]!, advanceBookingWindowDays: 14 },
        { restrictionMode: "ANYONE", shiftId: shifts["Tuesday Only"]! },
      ],
    });
    expect(saved.number).toBe("2.21");
    expect(saved.requiresCheckIn).toBe(true);

    const reloaded = await callerFor(engineer).desk.get({ deskId });
    expect(reloaded.description).toBe("Quiet desk beside the window.");
    expect(reloaded.attributes.map((a) => a.type).sort()).toEqual(["NEAR_WINDOW", "STANDING_DESK"]);
    expect(reloaded.restrictionAssignments).toHaveLength(4);
    expect(reloaded.restrictionAssignments.map((a) => [a.restrictionMode, a.shift.name, a.restriction?.name ?? null])).toEqual([
      ["ANYONE", "Mon + Fri", null],
      ["CUSTOM", "Wednesday Only", "Technology"],
      ["ANYONE", "Thursday Only", null],
      ["ANYONE", "Tuesday Only", null],
    ]);
    expect(reloaded.restrictionAssignments[2]!.advanceBookingWindowDays).toBe(14);
    expect(reloaded.restrictionAssignments[1]!.restriction?.color).toBe("#2563eb");
  });

  it("saves occupant and department blocks and evaluates them", async () => {
    const admin = callerFor(facilityAdminA);
    const saved = await admin.desk.save({
      deskId,
      number: "2.21",
      isActive: true,
      requiresCheckIn: false,
      assignmentMode: "BOOKABLE",
      attributes: [],
      assignments: [
        { restrictionMode: "ASSIGNED_OCCUPANTS", occupantUserIds: [engineer.id], shiftId: shifts["Mon & Wed"]! },
        { restrictionMode: "DEPARTMENT", departmentNames: ["Sales"], shiftId: shifts["Thursday Only"]! },
      ],
    });
    expect(saved.restrictionAssignments[0]!.occupants.map((o) => o.user.email)).toEqual([engineer.email]);
    expect(saved.restrictionAssignments[1]!.departmentNames).toEqual(["Sales"]);

    const monday = nextDateFor(1);
    const thursday = nextDateFor(4);
    expect((await callerFor(engineer).desk.checkEligibility({ deskId, date: monday })).eligible).toBe(true);
    const salesMonday = await callerFor(salesperson).desk.checkEligibility({ deskId, date: monday });
    expect(salesMonday.status).toBe("NOT_ASSIGNED_OCCUPANT");
    expect((await callerFor(salesperson).desk.checkEligibility({ deskId, date: thursday })).eligible).toBe(true);
    const engThursday = await callerFor(engineer).desk.checkEligibility({ deskId, date: thursday });
    expect(engThursday.reason).toBe("Desk 2.21 is restricted to the Sales department on Thursdays.");

    await expect(
      admin.desk.save({
        deskId,
        number: "2.21",
        isActive: true,
        requiresCheckIn: false,
        assignmentMode: "BOOKABLE",
        attributes: [],
        assignments: [{ restrictionMode: "ASSIGNED_OCCUPANTS", occupantUserIds: [], shiftId: shifts["Mon & Wed"]! }],
      }),
    ).rejects.toThrow(/at least one occupant/);

    // Restore the four-block configuration the following tests rely on.
    await admin.desk.save({
      deskId,
      number: "2.21",
      description: "Quiet desk beside the window.",
      isActive: true,
      requiresCheckIn: true,
      assignmentMode: "BOOKABLE",
      attributes: ["STANDING_DESK", "NEAR_WINDOW"],
      assignments: [
        { restrictionMode: "ANYONE", shiftId: shifts["Mon + Fri"]! },
        { restrictionMode: "CUSTOM", restrictionId: technologyId, shiftId: shifts["Wednesday Only"]! },
        { restrictionMode: "ANYONE", shiftId: shifts["Thursday Only"]!, advanceBookingWindowDays: 14 },
        { restrictionMode: "ANYONE", shiftId: shifts["Tuesday Only"]! },
      ],
    });
  });

  it("rejects overlapping shifts on one desk", async () => {
    await expect(
      callerFor(facilityAdminA).desk.save({
        deskId,
        number: "2.21",
        isActive: true,
        requiresCheckIn: false,
        assignmentMode: "BOOKABLE",
        attributes: [],
        assignments: [
          { restrictionMode: "ANYONE", shiftId: shifts["Mon + Fri"]! },
          { restrictionMode: "CUSTOM", restrictionId: technologyId, shiftId: shifts["Mon & Wed"]! },
        ],
      }),
    ).rejects.toThrow(/Mon is covered by more than one restriction block/);
  });

  it("rejects a restriction id from another organization", async () => {
    const foreign = await db.bookingRestriction.findFirstOrThrow({ where: { organizationId: orgB.id } });
    await expect(
      callerFor(superAdmin).desk.save({
        deskId,
        number: "2.21",
        isActive: true,
        requiresCheckIn: false,
        assignmentMode: "BOOKABLE",
        attributes: [],
        assignments: [{ restrictionMode: "CUSTOM", restrictionId: foreign.id, shiftId: shifts["Wednesday Only"]! }],
      }),
    ).rejects.toThrow(/no longer exists/);
  });

  // ----- Eligibility + booking -----

  it("selects the right block per weekday and evaluates the occupant, not the booker", async () => {
    const wednesday = nextDateFor(3);
    const friday = nextDateFor(5);

    const engOnWed = await callerFor(engineer).desk.checkEligibility({ deskId, date: wednesday });
    expect(engOnWed.eligible).toBe(true);

    const salesOnWed = await callerFor(salesperson).desk.checkEligibility({ deskId, date: wednesday });
    expect(salesOnWed.eligible).toBe(false);
    expect(salesOnWed.reason).toBe("Desk 2.21 is restricted to Technology on Wednesdays.");

    expect((await callerFor(salesperson).desk.checkEligibility({ deskId, date: friday })).eligible).toBe(true);

    // Booking manager-style: admin books on behalf → checked against the occupant.
    await expect(
      callerFor(superAdmin).booking.create({ deskId, date: wednesday, startMinutes: 540, endMinutes: 600, forUserId: salesperson.id }),
    ).rejects.toThrow(/restricted to Technology on Wednesdays/);

    const booking = await callerFor(superAdmin).booking.create({
      deskId,
      date: wednesday,
      startMinutes: 540,
      endMinutes: 600,
      forUserId: engineer.id,
    });
    expect(booking.userId).toBe(engineer.id);
    expect(booking.bookedById).toBe(superAdmin.id);

    // A standard user asking about someone else is refused.
    await expect(callerFor(salesperson).desk.checkEligibility({ deskId, date: wednesday, occupantUserId: engineer.id })).rejects.toThrow(
      /only check eligibility for yourself/,
    );
  });

  it("marks restricted desks per viewer in the floor availability payload", async () => {
    const availability = await callerFor(salesperson).booking.getFloorAvailability({ floorId: floorA.id, date: nextDateFor(3) });
    const desk = availability.desks.find((d) => d.deskId === deskId)!;
    expect(desk.eligibleForViewer).toBe(false);
    expect(desk.eligibilityReason).toContain("Technology");
  });

  it("evaluates availability for the chosen occupant when booking on behalf, and refuses that for standard users", async () => {
    const wednesday = nextDateFor(3);
    // Desk 2.21 is Technology-only on Wednesdays: eligible for the engineer, not for the salesperson.
    const forEngineer = await callerFor(superAdmin).booking.getFloorAvailability({ floorId: floorA.id, date: wednesday, occupantUserId: engineer.id });
    expect(forEngineer.desks.find((d) => d.deskId === deskId)?.eligibleForViewer).toBe(true);
    const forSales = await callerFor(superAdmin).booking.getFloorAvailability({ floorId: floorA.id, date: wednesday, occupantUserId: salesperson.id });
    expect(forSales.desks.find((d) => d.deskId === deskId)?.eligibleForViewer).toBe(false);

    await expect(
      callerFor(salesperson).booking.getFloorAvailability({ floorId: floorA.id, date: wednesday, occupantUserId: engineer.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps guests off desks that carry people-based restrictions, on any day", async () => {
    const admin = callerFor(superAdmin);
    // Monday is an "Anyone"-free day here (assigned-occupants block) — but the rule is desk-wide:
    // a desk with any department/occupant/custom block is never available to a guest.
    const monday = nextDateFor(1);
    const check = await admin.desk.checkEligibility({ deskId, date: monday, forGuest: true });
    expect(check.eligible).toBe(false);
    expect(check.status).toBe("GUEST_NOT_ALLOWED");
    expect(check.reason).toMatch(/can't be booked for a guest/);

    await expect(admin.booking.create({ deskId, date: monday, startMinutes: 540, endMinutes: 600, guestName: "Visitor" })).rejects.toThrow(
      /can't be booked for a guest/,
    );

    const availability = await admin.booking.getFloorAvailability({ floorId: floorA.id, date: monday, forGuest: true });
    expect(availability.desks.find((d) => d.deskId === deskId)?.eligibleForViewer).toBe(false);

    // An unrestricted desk on another floor is fine for a guest.
    const unrestricted = await admin.booking.getFloorAvailability({ floorId: floorB.id, date: monday, forGuest: true });
    expect(unrestricted.desks.find((d) => d.deskId === deskB.id)?.eligibleForViewer).toBe(true);

    // Standard users can't ask on behalf of a guest at all.
    await expect(callerFor(salesperson).desk.checkEligibility({ deskId, date: monday, forGuest: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ----- Restriction lifecycle -----

  it("counts usage and refuses to delete an assigned restriction unless forced", async () => {
    const admin = callerFor(superAdmin);
    const listed = await admin.restriction.listRestrictions();
    const tech = listed.find((r) => r.id === technologyId)!;
    expect(tech.deskCount).toBe(1);
    expect(listed.some((r) => r.name === "Other Org Only")).toBe(false);

    await expect(admin.restriction.deleteRestriction({ restrictionId: technologyId })).rejects.toThrow(/assigned to 1 desk/);

    const preview = await admin.restriction.previewMatchCount({
      rules: [{ fieldType: "DEPARTMENT", operator: "IS_ANY_OF", value: ["Engineering"], connector: "OR" }],
    });
    expect(preview.matching).toBe(1);
  });

  it("refuses deleting a shift that desks still use", async () => {
    await expect(callerFor(superAdmin).shift.delete({ shiftId: shifts["Wednesday Only"]! })).rejects.toThrow(/used by 1 desk/);
  });

  // ----- Safe delete -----

  it("blocks deleting a desk with upcoming bookings, archives one with history, hard-deletes an unused one", async () => {
    const admin = callerFor(facilityAdminA);

    await expect(admin.desk.deleteDesk({ deskId })).rejects.toThrow(/1 upcoming booking/);

    // Turn that booking into history, then delete → archived (hidden, bookings kept).
    await db.booking.updateMany({ where: { deskId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    const archived = await admin.desk.deleteDesk({ deskId });
    expect(archived.mode).toBe("archived");
    expect((await admin.desk.listForFloor({ floorId: floorA.id })).some((d) => d.id === deskId)).toBe(false);
    expect(await db.booking.count({ where: { deskId } })).toBe(1);
    await expect(admin.desk.get({ deskId })).rejects.toThrow(/NOT_FOUND|not found/i);
    // The archived desk no longer blocks its name: a new "2.21" can be created on the same floor.
    const replacement = await admin.desk.createDesk({ floorId: floorA.id, number: "2.21", x: 1, y: 1 });
    expect(replacement.number).toBe("2.21");
    await admin.desk.deleteDesk({ deskId: replacement.id });

    const fresh = await admin.desk.createDesk({ floorId: floorA.id, x: 5, y: 5 });
    const deleted = await admin.desk.deleteDesk({ deskId: fresh.id });
    expect(deleted.mode).toBe("deleted");
    expect(await db.desk.findUnique({ where: { id: fresh.id } })).toBeNull();
  });

  it("re-creating a deleted restriction or shift name revives it instead of failing on the unique index", async () => {
    const admin = callerFor(superAdmin);
    const temp = await admin.restriction.createRestriction({ name: "Temporary", rules: [] });
    await admin.restriction.deleteRestriction({ restrictionId: temp.id });
    const revived = await admin.restriction.createRestriction({ name: "temporary", color: "#059669", rules: [] });
    expect(revived.id).toBe(temp.id);
    expect(revived.isActive).toBe(true);
    expect(revived.color).toBe("#059669");

    const shift = await admin.shift.create({ name: "Saturday Only", daysOfWeek: [6] });
    await admin.shift.delete({ shiftId: shift.id });
    const revivedShift = await admin.shift.create({ name: "Saturday Only", daysOfWeek: [6, 0] });
    expect(revivedShift.id).toBe(shift.id);
    expect(revivedShift.daysOfWeek).toEqual([0, 6]);
  });

  it("force-deleting a restriction removes it from desks", async () => {
    const admin = callerFor(superAdmin);
    const desk = await admin.desk.createDesk({ floorId: floorA.id, x: 50, y: 50 });
    await admin.desk.save({
      deskId: desk.id,
      number: desk.number,
      isActive: true,
      requiresCheckIn: false,
      assignmentMode: "BOOKABLE",
      attributes: [],
      assignments: [{ restrictionMode: "CUSTOM", restrictionId: technologyId, shiftId: shifts["Wednesday Only"]! }],
    });
    const result = await admin.restriction.deleteRestriction({ restrictionId: technologyId, force: true });
    expect(result.removedFromDesks).toBe(1);
    expect((await admin.desk.get({ deskId: desk.id })).restrictionAssignments).toHaveLength(0);
  });
});
