import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, Role } from "@/generated/prisma/client";
import { appRouter } from "@/server/api/root";
import { runCheckInAutoCancelSweep } from "@/server/booking/auto-cancel";
import { zonedDateTimeToUtc } from "@/server/booking/time";

/**
 * Desk watch + in-app notifications, through the real tRPC routers against
 * DATABASE_URL_TEST: watch validation, one-shot alerts on cancel / end early /
 * auto-cancel, and per-user notification access.
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) throw new Error("DATABASE_URL_TEST is not set — see .env.example");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

type SessionUser = { id: string; name: string; email: string; role: Role; organizationId: string | null };
const callerFor = (user: SessionUser) => appRouter.createCaller({ db, headers: new Headers(), session: { user } });

const SLUGS = ["desk-watch-test-a", "desk-watch-test-b"];
const TZ = "Europe/London";

/** A weekday at least two days out, YYYY-MM-DD. */
function nextDateFor(dayOfWeek: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2);
  while (date.getUTCDay() !== dayOfWeek) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

let org: { id: string };
let otherOrg: { id: string };
let floor: { id: string };
let admin: SessionUser;
let userCounter = 0;

async function makeUser(department: string | null = null, organizationId = org.id): Promise<SessionUser> {
  userCounter++;
  const row = await db.user.create({
    data: { organizationId, email: `watch-${userCounter}@dw.test`, name: `Watch User ${userCounter}`, role: Role.STANDARD_USER, department },
  });
  return { id: row.id, name: row.name, email: row.email, role: row.role, organizationId };
}

async function makeDesk(number: string, requiresCheckIn = false) {
  return db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number, x: 1, y: 1, requiresCheckIn } });
}

async function book(deskId: string, user: SessionUser, date: string, startMinutes = 540, endMinutes = 1020) {
  return db.booking.create({
    data: {
      organizationId: org.id,
      deskId,
      userId: user.id,
      bookedById: user.id,
      date: new Date(`${date}T00:00:00Z`),
      startAt: zonedDateTimeToUtc(date, startMinutes, TZ),
      endAt: zonedDateTimeToUtc(date, endMinutes, TZ),
    },
  });
}

const notificationsFor = (userId: string) => db.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

async function cleanup() {
  const orgs = await db.organization.findMany({ where: { slug: { in: SLUGS } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length === 0) return;
  await db.notification.deleteMany({ where: { organizationId: { in: ids } } });
  await db.deskWatch.deleteMany({ where: { organizationId: { in: ids } } });
  await db.auditLog.deleteMany({ where: { organizationId: { in: ids } } });
  await db.booking.deleteMany({ where: { organizationId: { in: ids } } });
  await db.deskRestrictionAssignment.deleteMany({ where: { organizationId: { in: ids } } });
  await db.desk.deleteMany({ where: { organizationId: { in: ids } } });
  await db.availabilityShift.deleteMany({ where: { organizationId: { in: ids } } });
  await db.floor.deleteMany({ where: { organizationId: { in: ids } } });
  await db.site.deleteMany({ where: { organizationId: { in: ids } } });
  await db.user.deleteMany({ where: { organizationId: { in: ids } } });
  await db.organization.deleteMany({ where: { id: { in: ids } } });
}

describe("desk watch and notifications", () => {
  beforeAll(async () => {
    await cleanup();
    org = await db.organization.create({ data: { name: "Desk Watch A", slug: SLUGS[0]! } });
    otherOrg = await db.organization.create({ data: { name: "Desk Watch B", slug: SLUGS[1]! } });
    const site = await db.site.create({
      data: { organizationId: org.id, name: "London", timeZone: TZ, operatingHoursStart: 420, operatingHoursEnd: 1140 },
    });
    floor = await db.floor.create({ data: { organizationId: org.id, siteId: site.id, name: "Level 4" } });
    const adminRow = await db.user.create({ data: { organizationId: org.id, email: "admin@dw.test", name: "Admin", role: Role.ORG_SUPER_ADMIN } });
    admin = { id: adminRow.id, name: adminRow.name, email: adminRow.email, role: adminRow.role, organizationId: org.id };
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it("validates watches: booked desk only, not your own booking, not past, not ineligible", async () => {
    const desk = await makeDesk("4.01");
    const holder = await makeUser();
    const watcher = await makeUser("Sales");
    const date = nextDateFor(2);
    const api = callerFor(watcher);

    await expect(api.deskWatch.create({ deskId: desk.id, date })).rejects.toThrow(/free on .* you can book it now/);

    await book(desk.id, holder, date);
    await expect(callerFor(holder).deskWatch.create({ deskId: desk.id, date })).rejects.toThrow(/You already have Desk 4.01 booked/);
    await expect(api.deskWatch.create({ deskId: desk.id, date: "2020-01-07" })).rejects.toThrow(/date that has passed/);

    const created = await api.deskWatch.create({ deskId: desk.id, date });
    expect((await api.deskWatch.create({ deskId: desk.id, date })).id).toBe(created.id); // idempotent
    expect(await api.deskWatch.status({ deskId: desk.id, date })).toMatchObject({ watching: true });
    expect((await api.deskWatch.listMine()).map((w) => [w.desk.number, w.date])).toEqual([["4.01", date]]);

    // A desk restricted to Engineering that day can't be watched by someone in Sales.
    const restricted = await makeDesk("4.02");
    const shift = await callerFor(admin).shift.create({ name: "Tuesday Only", daysOfWeek: [2] });
    await callerFor(admin).desk.save({
      deskId: restricted.id,
      number: "4.02",
      isActive: true,
      requiresCheckIn: false,
      assignmentMode: "BOOKABLE",
      attributes: [],
      assignments: [{ restrictionMode: "DEPARTMENT", departmentNames: ["Engineering"], shiftId: shift.id }],
    });
    await book(restricted.id, await makeUser("Engineering"), date);
    await expect(api.deskWatch.create({ deskId: restricted.id, date })).rejects.toThrow(/restricted to the Engineering department/);

    await api.deskWatch.remove({ deskId: desk.id, date });
    expect(await api.deskWatch.status({ deskId: desk.id, date })).toMatchObject({ watching: false });
  });

  it("alerts watchers once when the booking is cancelled, and not the person who cancelled", async () => {
    const desk = await makeDesk("4.10");
    const holder = await makeUser();
    const watcher = await makeUser();
    const otherDayWatcher = await makeUser();
    const date = nextDateFor(3);
    const otherDate = nextDateFor(4);

    const booking = await book(desk.id, holder, date);
    await book(desk.id, await makeUser(), otherDate);
    await callerFor(watcher).deskWatch.create({ deskId: desk.id, date });
    await callerFor(otherDayWatcher).deskWatch.create({ deskId: desk.id, date: otherDate });

    await callerFor(holder).booking.cancel({ bookingId: booking.id });

    const [alert] = await notificationsFor(watcher.id);
    expect(alert?.type).toBe("deskWatch.available");
    expect(await notificationsFor(holder.id)).toHaveLength(0);
    expect(await notificationsFor(otherDayWatcher.id)).toHaveLength(0);
    expect(await callerFor(watcher).deskWatch.status({ deskId: desk.id, date })).toMatchObject({ watching: false });

    const [listed] = await callerFor(watcher).notification.list();
    expect(listed?.title).toBe("Desk 4.10 is free");
    expect(listed?.body).toMatch(/09:00–17:00 \(Level 4 · London\)/);
    expect(listed?.href).toContain(`desk=${desk.id}`);
    expect(listed?.href).toContain(`date=${date}`);

    // One-shot: a second release that day doesn't alert again.
    const rebooked = await book(desk.id, await makeUser(), date, 600, 660);
    await callerFor(admin).booking.cancel({ bookingId: rebooked.id });
    expect(await notificationsFor(watcher.id)).toHaveLength(1);
  });

  it("alerts watchers when a booking is ended early or auto-cancelled", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

    const endedDesk = await makeDesk("4.20");
    const holder = await makeUser();
    const watcher = await makeUser();
    const inProgress = await db.booking.create({
      data: {
        organizationId: org.id,
        deskId: endedDesk.id,
        userId: holder.id,
        bookedById: holder.id,
        date: new Date(`${today}T00:00:00Z`),
        startAt: new Date(Date.now() - 60_000),
        endAt: new Date(Date.now() + 60 * 60_000),
        status: "CHECKED_IN",
        checkedInAt: new Date(),
      },
    });
    await db.deskWatch.create({ data: { organizationId: org.id, userId: watcher.id, deskId: endedDesk.id, date: new Date(`${today}T00:00:00Z`) } });
    await callerFor(holder).booking.endBooking({ bookingId: inProgress.id });
    const [ended] = await callerFor(watcher).notification.list();
    expect(ended?.title).toBe("Desk 4.20 is free");
    expect(ended?.href).not.toContain("start="); // released mid-booking: the map opens on "now"

    const checkInDesk = await makeDesk("4.21", true);
    const noShow = await makeUser();
    const autoWatcher = await makeUser();
    const soon = await db.booking.create({
      data: {
        organizationId: org.id,
        deskId: checkInDesk.id,
        userId: noShow.id,
        bookedById: noShow.id,
        date: new Date(`${today}T00:00:00Z`),
        startAt: new Date(Date.now() - 61 * 60_000), // not checked in within the first hour
        endAt: new Date(Date.now() + 60 * 60_000),
        createdAt: new Date(Date.now() - 24 * 60 * 60_000),
      },
    });
    await db.deskWatch.create({ data: { organizationId: org.id, userId: autoWatcher.id, deskId: checkInDesk.id, date: soon.date } });
    await runCheckInAutoCancelSweep(db);
    expect((await notificationsFor(autoWatcher.id)).map((n) => n.type)).toEqual(["deskWatch.available"]);
    const [released] = await callerFor(noShow).notification.list();
    expect(released?.title).toBe("Desk 4.21 was released");
  });

  it("keeps notifications private to their owner", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const outsider = await makeUser(null, otherOrg.id);
    const note = await db.notification.create({
      data: { organizationId: org.id, userId: owner.id, type: "booking.autoCancelled", payload: { bookingId: "missing", deskNumber: "9.99", startAt: new Date().toISOString(), endAt: new Date().toISOString() } },
    });

    expect(await callerFor(owner).notification.unreadCount()).toBe(1);
    expect(await callerFor(other).notification.list()).toHaveLength(0);
    expect(await callerFor(outsider).notification.list()).toHaveLength(0);

    expect((await callerFor(other).notification.markRead({ ids: [note.id] })).updated).toBe(0);
    expect((await callerFor(outsider).notification.markAllRead()).updated).toBe(0);
    expect(await callerFor(owner).notification.unreadCount()).toBe(1);

    expect((await callerFor(owner).notification.markRead({ ids: [note.id] })).updated).toBe(1);
    expect(await callerFor(owner).notification.unreadCount()).toBe(0);
  });
});
