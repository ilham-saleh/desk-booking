import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Prisma, PrismaClient, Role } from "@/generated/prisma/client";

/**
 * Proves the GiST exclusion constraints from
 * prisma/migrations/*_booking_overlap_constraints are enforced by Postgres
 * itself (CLAUDE.md rule 2: no double-booking; rule 4: one active booking per
 * user) — inserting directly via Prisma, bypassing all application code, so
 * this can't pass just because the app happens to pre-check first.
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

let org: { id: string };
let userA: { id: string };
let userB: { id: string };
let deskX: { id: string };
let deskY: { id: string };

function booking(overrides: Partial<Prisma.BookingUncheckedCreateInput>): Prisma.BookingUncheckedCreateInput {
  return {
    organizationId: org.id,
    deskId: deskX.id,
    bookedById: userA.id,
    date: new Date("2027-03-01T00:00:00Z"),
    startAt: new Date("2027-03-01T09:00:00Z"),
    endAt: new Date("2027-03-01T10:00:00Z"),
    status: "CONFIRMED",
    ...overrides,
  };
}

describe("booking overlap exclusion constraints", () => {
  beforeAll(async () => {
    await db.booking.deleteMany();
    await db.desk.deleteMany();
    await db.floor.deleteMany();
    await db.site.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany({ where: { slug: "overlap-constraint-test" } });

    org = await db.organization.create({ data: { name: "Overlap Test", slug: "overlap-constraint-test" } });
    const site = await db.site.create({ data: { organizationId: org.id, name: "Site", timeZone: "UTC" } });
    const floor = await db.floor.create({ data: { organizationId: org.id, siteId: site.id, name: "Floor", sortOrder: 0 } });
    deskX = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "X", x: 0, y: 0 } });
    deskY = await db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: "Y", x: 1, y: 1 } });
    userA = await db.user.create({ data: { organizationId: org.id, email: "a@overlap.test", name: "A", role: Role.STANDARD_USER } });
    userB = await db.user.create({ data: { organizationId: org.id, email: "b@overlap.test", name: "B", role: Role.STANDARD_USER } });
  });

  afterAll(async () => {
    await db.booking.deleteMany({ where: { organizationId: org.id } });
    await db.desk.deleteMany({ where: { organizationId: org.id } });
    await db.floor.deleteMany({ where: { organizationId: org.id } });
    await db.site.deleteMany({ where: { organizationId: org.id } });
    await db.user.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
    await db.$disconnect();
  });

  it("rejects two overlapping CONFIRMED bookings on the same desk", async () => {
    await db.booking.create({ data: booking({ userId: userA.id }) });
    await expect(
      db.booking.create({
        data: booking({ userId: userB.id, startAt: new Date("2027-03-01T09:30:00Z"), endAt: new Date("2027-03-01T10:30:00Z") }),
      }),
    ).rejects.toThrow(/bookings_desk_no_overlap/);
  });

  it("allows a back-to-back booking on the same desk (half-open range)", async () => {
    const created = await db.booking.create({
      data: booking({ userId: userB.id, startAt: new Date("2027-03-01T10:00:00Z"), endAt: new Date("2027-03-01T11:00:00Z") }),
    });
    expect(created.id).toBeTruthy();
  });

  it("rejects two overlapping CONFIRMED bookings for the same user on different desks", async () => {
    await db.booking.create({
      data: booking({ userId: userA.id, deskId: deskY.id, startAt: new Date("2027-03-02T09:00:00Z"), endAt: new Date("2027-03-02T10:00:00Z") }),
    });
    await expect(
      db.booking.create({
        data: booking({
          userId: userA.id,
          deskId: deskX.id,
          startAt: new Date("2027-03-02T09:30:00Z"),
          endAt: new Date("2027-03-02T10:30:00Z"),
        }),
      }),
    ).rejects.toThrow(/bookings_user_no_overlap/);
  });

  it("allows two overlapping guest bookings (userId NULL) for the same admin's bookedById", async () => {
    await db.booking.create({
      data: booking({ userId: null, guestName: "Guest 1", deskId: deskX.id, startAt: new Date("2027-03-03T09:00:00Z"), endAt: new Date("2027-03-03T10:00:00Z") }),
    });
    const second = await db.booking.create({
      data: booking({ userId: null, guestName: "Guest 2", deskId: deskY.id, startAt: new Date("2027-03-03T09:00:00Z"), endAt: new Date("2027-03-03T10:00:00Z") }),
    });
    expect(second.id).toBeTruthy();
  });

  it("allows overlapping bookings once the earlier one is CANCELLED", async () => {
    const original = await db.booking.create({
      data: booking({ userId: userA.id, deskId: deskY.id, startAt: new Date("2027-03-04T09:00:00Z"), endAt: new Date("2027-03-04T10:00:00Z") }),
    });
    await db.booking.update({ where: { id: original.id }, data: { status: "CANCELLED" } });
    const replacement = await db.booking.create({
      data: booking({ userId: userB.id, deskId: deskY.id, startAt: new Date("2027-03-04T09:00:00Z"), endAt: new Date("2027-03-04T10:00:00Z") }),
    });
    expect(replacement.id).toBeTruthy();
  });
});
