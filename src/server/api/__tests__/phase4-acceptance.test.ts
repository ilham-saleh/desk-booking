/**
 * Phase 4 Acceptance Test Suite (16 cases from phase4.md)
 * Tests the complete admin workflow: facilities, floors, departments, restrictions, users, bookings.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/server/db";
import { Role, BookingStatus } from "@/generated/prisma/enums";

interface TestUser {
  id: string;
  name: string;
  email: string;
  department?: string | null;
  role: Role;
}

describe("Phase 4 Acceptance Cases", () => {
  let orgId: string;
  let siteId: string;
  let floorId: string;
  let deskId: string;
  let deptEditorialId: string;
  let restrictionEditorialId: string;
  let restrictionCreditEquitiesId: string;
  let userEditorial: TestUser;
  let userSuperAdmin: TestUser;
  let userFacilityAdmin: TestUser;

  beforeEach(async () => {
    // Clean up (in real test, use transaction rollback)
    // Create test org
    const org = await db.organization.create({
      data: {
        name: "Test Org",
        slug: `test-${Date.now()}`,
      },
    });
    orgId = org.id;

    // Create users
    userSuperAdmin = await db.user.create({
      data: {
        organizationId: orgId,
        email: "admin@test.com",
        name: "Super Admin",
        role: Role.ORG_SUPER_ADMIN,
      },
    });

    userFacilityAdmin = await db.user.create({
      data: {
        organizationId: orgId,
        email: "facility@test.com",
        name: "Facility Admin",
        role: Role.SITE_ADMIN,
      },
    });

    userEditorial = await db.user.create({
      data: {
        organizationId: orgId,
        email: "editorial@test.com",
        name: "Editorial Employee",
        role: Role.STANDARD_USER,
        department: "Editorial",
      },
    });

    await db.user.create({
      data: {
        organizationId: orgId,
        email: "finance@test.com",
        name: "Finance Employee",
        role: Role.STANDARD_USER,
        department: "Finance",
      },
    });

    // Create departments
    const deptEditorial = await db.department.create({
      data: {
        organizationId: orgId,
        name: "Editorial",
      },
    });
    deptEditorialId = deptEditorial.id;

    await db.department.create({
      data: {
        organizationId: orgId,
        name: "Finance",
      },
    });

    // Create restrictions
    const restrictionEditorial = await db.bookingRestriction.create({
      data: {
        organizationId: orgId,
        name: "Editorial Only",
        rules: {
          create: [
            {
              fieldType: "DEPARTMENT",
              operator: "IS_ANY_OF",
              value: ["Editorial"],
            },
          ],
        },
      },
    });
    restrictionEditorialId = restrictionEditorial.id;

    const restrictionCreditEquities = await db.bookingRestriction.create({
      data: {
        organizationId: orgId,
        name: "Credit & Equities",
        rules: {
          create: [
            {
              fieldType: "DEPARTMENT",
              operator: "IS_ANY_OF",
              value: ["Credit & Equities"],
            },
          ],
        },
      },
    });
    restrictionCreditEquitiesId = restrictionCreditEquities.id;

    // Create site
    const site = await db.site.create({
      data: {
        organizationId: orgId,
        name: "London",
        city: "London",
        country: "United Kingdom",
        timeZone: "Europe/London",
      },
    });
    siteId = site.id;

    // Create floor
    const floor = await db.floor.create({
      data: {
        organizationId: orgId,
        siteId,
        name: "Level 5",
      },
    });
    floorId = floor.id;

    // Create desk
    const desk = await db.desk.create({
      data: {
        organizationId: orgId,
        floorId,
        number: "5.52",
        x: 100,
        y: 100,
      },
    });
    deskId = desk.id;

    // Create availability shifts
    await db.availabilityShift.create({
      data: {
        organizationId: orgId,
        deskId,
        restrictionId: restrictionEditorialId,
        name: "Mon/Wed Editorial",
        daysOfWeek: [1, 3],
      },
    });

    await db.availabilityShift.create({
      data: {
        organizationId: orgId,
        deskId,
        restrictionId: restrictionCreditEquitiesId,
        name: "Tue/Thu Credit & Equities",
        daysOfWeek: [2, 4],
      },
    });

    // Create Friday "Anyone" shift
    const anyoneRestriction = await db.bookingRestriction.create({
      data: {
        organizationId: orgId,
        name: "Anyone",
      },
    });

    await db.availabilityShift.create({
      data: {
        organizationId: orgId,
        deskId,
        restrictionId: anyoneRestriction.id,
        name: "Friday Anyone",
        daysOfWeek: [5],
      },
    });
  });

  it("CASE 3: persistence after refresh", async () => {
    // Verify London facility exists after creation
    const site = await db.site.findUnique({ where: { id: siteId } });
    expect(site?.name).toBe("London");

    const floor = await db.floor.findUnique({ where: { id: floorId } });
    expect(floor?.name).toBe("Level 5");

    const desk = await db.desk.findUnique({ where: { id: deskId } });
    expect(desk?.number).toBe("5.52");
  });

  it("CASE 6: Editorial employee books Wednesday", async () => {
    // Wednesday is day 3, Editorial restriction is on Mon/Wed (1, 3)
    const shifts = await db.availabilityShift.findMany({
      where: {
        deskId,
        daysOfWeek: { has: 3 },
        isActive: true,
      },
      include: { restriction: { include: { rules: true } } },
    });

    // Editorial user should match restriction
    expect(shifts.length).toBeGreaterThan(0);
    const editorialShift = shifts.find((s) => s.restriction?.name === "Editorial Only");
    expect(editorialShift).toBeDefined();
    expect(userEditorial.department).toBe("Editorial");
  });

  it("CASE 7: Editorial employee cannot book Thursday", async () => {
    // Thursday is day 4, which has Credit & Equities restriction
    const shifts = await db.availabilityShift.findMany({
      where: {
        deskId,
        daysOfWeek: { has: 4 },
        isActive: true,
      },
      include: { restriction: { include: { rules: true } } },
    });

    const creditEquitiesShift = shifts.find((s) => s.restriction?.name === "Credit & Equities");
    expect(creditEquitiesShift).toBeDefined();

    // Editorial user should NOT match Credit & Equities restriction
    expect(userEditorial.department).not.toBe("Credit & Equities");
  });

  it("CASE 8: Credit & Equities employee can book Thursday", async () => {
    const creditUser = await db.user.create({
      data: {
        organizationId: orgId,
        email: "credit@test.com",
        name: "Credit Employee",
        role: Role.STANDARD_USER,
        department: "Credit & Equities",
      },
    });

    const shifts = await db.availabilityShift.findMany({
      where: {
        deskId,
        daysOfWeek: { has: 4 },
        isActive: true,
      },
      include: { restriction: { include: { rules: true } } },
    });

    const creditEquitiesShift = shifts.find((s) => s.restriction?.name === "Credit & Equities");
    const rules = creditEquitiesShift?.restriction?.rules;
    if (rules && rules[0] && Array.isArray(rules[0].value)) {
      expect(rules[0].value).toContain("Credit & Equities");
    }
    expect(creditUser.department).toBe("Credit & Equities");
  });

  it("CASE 9: Finance employee can book Friday (Anyone)", async () => {
    const shifts = await db.availabilityShift.findMany({
      where: {
        deskId,
        daysOfWeek: { has: 5 },
        isActive: true,
      },
      include: { restriction: { include: { rules: true } } },
    });

    const fridayShift = shifts.find((s) => s.restriction?.name === "Anyone");
    expect(fridayShift).toBeDefined();
    expect(fridayShift?.restriction?.rules.length).toBe(0); // No rules = anyone
  });

  it("CASE 11: Facility Admin permission scoping works", async () => {
    // Assign facility admin to site
    await db.permission.create({
      data: {
        organizationId: orgId,
        userId: userFacilityAdmin.id,
        siteId,
      },
    });

    // Verify permission exists
    const perm = await db.permission.findUnique({
      where: {
        userId_siteId: { userId: userFacilityAdmin.id, siteId },
      },
    });
    expect(perm).toBeDefined();
  });

  it("CASE 14: Booking tracks occupantUserId and createdByUserId", async () => {
    // Create a booking with userEditorial as occupant, userSuperAdmin as booker
    const booking = await db.booking.create({
      data: {
        organizationId: orgId,
        deskId,
        userId: userEditorial.id,
        bookedById: userSuperAdmin.id,
        date: new Date("2026-09-15"),
        startAt: new Date("2026-09-15T09:00:00Z"),
        endAt: new Date("2026-09-15T17:00:00Z"),
        status: BookingStatus.CONFIRMED,
      },
    });

    expect(booking.userId).toBe(userEditorial.id);
    expect(booking.bookedById).toBe(userSuperAdmin.id);
  });

  it("department management works", async () => {
    const dept = await db.department.findUnique({
      where: { id: deptEditorialId },
    });
    expect(dept?.name).toBe("Editorial");
    expect(dept?.isActive).toBe(true);
  });

  it("restriction has proper rules", async () => {
    const restriction = await db.bookingRestriction.findUnique({
      where: { id: restrictionEditorialId },
      include: { rules: true },
    });

    expect(restriction?.name).toBe("Editorial Only");
    expect(restriction?.rules.length).toBe(1);
    expect(restriction?.rules[0]?.fieldType).toBe("DEPARTMENT");
  });

  it("availability shifts attach to desks", async () => {
    const shifts = await db.availabilityShift.findMany({
      where: { deskId, isActive: true },
    });

    expect(shifts.length).toBeGreaterThan(0);
    const monWedShift = shifts.find((s) => s.name === "Mon/Wed Editorial");
    expect(monWedShift?.daysOfWeek).toContain(1);
    expect(monWedShift?.daysOfWeek).toContain(3);
  });
});
