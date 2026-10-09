import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { runCheckInReminderSweep } from "@/server/booking/check-in-reminder";
import { formatNotification } from "@/server/notifications/format";

/**
 * runCheckInReminderSweep against DATABASE_URL_TEST: reminds once, 30 minutes
 * before the check-in deadline (an hour after start, or after booking if that
 * was later), only for unchecked, still-running bookings on check-in desks;
 * guest bookings remind the booker.
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) throw new Error("DATABASE_URL_TEST is not set — see .env.example");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });
const SLUG = "check-in-reminder-test";
const MINUTE = 60_000;

let org: { id: string };
let floor: { id: string };
let deskCounter = 0;
let userCounter = 0;

async function makeDesk(requiresCheckIn = true) {
  deskCounter++;
  return db.desk.create({ data: { organizationId: org.id, floorId: floor.id, number: `R${deskCounter}`, x: deskCounter, y: 1, requiresCheckIn } });
}

async function makeUser() {
  userCounter++;
  return db.user.create({ data: { organizationId: org.id, email: `reminder-${userCounter}@cir.test`, name: `Reminder ${userCounter}`, role: "STANDARD_USER" } });
}

/** A booking starting `minutesFromNow` from now (negative = already started), made a day ahead unless `createdMinutesAgo` says otherwise. */
async function makeBooking(
  minutesFromNow: number,
  opts: { requiresCheckIn?: boolean; checkedIn?: boolean; guestName?: string; durationMinutes?: number; createdMinutesAgo?: number } = {},
) {
  const desk = await makeDesk(opts.requiresCheckIn ?? true);
  const user = await makeUser();
  const startAt = new Date(Date.now() + minutesFromNow * MINUTE);
  const booking = await db.booking.create({
    data: {
      organizationId: org.id,
      deskId: desk.id,
      userId: opts.guestName ? null : user.id,
      guestName: opts.guestName ?? null,
      bookedById: user.id,
      date: new Date(startAt.toISOString().slice(0, 10) + "T00:00:00Z"),
      startAt,
      endAt: new Date(startAt.getTime() + (opts.durationMinutes ?? 120) * MINUTE),
      createdAt: opts.createdMinutesAgo != null ? new Date(Date.now() - opts.createdMinutesAgo * MINUTE) : new Date(startAt.getTime() - 24 * 60 * MINUTE),
      status: opts.checkedIn ? "CHECKED_IN" : "CONFIRMED",
      checkedInAt: opts.checkedIn ? new Date() : null,
    },
  });
  return { booking, user };
}

const remindersFor = (userId: string) => db.notification.findMany({ where: { userId, type: "booking.checkInReminder" } });

async function cleanup() {
  const existing = await db.organization.findUnique({ where: { slug: SLUG } });
  if (!existing) return;
  for (const model of [db.notification, db.booking, db.desk, db.floor, db.site, db.user] as const) {
    await (model as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { organizationId: existing.id } });
  }
  await db.organization.delete({ where: { id: existing.id } });
}

describe("runCheckInReminderSweep", () => {
  beforeAll(async () => {
    await cleanup();
    org = await db.organization.create({ data: { name: "Check-in Reminder", slug: SLUG } });
    const site = await db.site.create({
      data: { organizationId: org.id, name: "London", timeZone: "Europe/London", operatingHoursStart: 0, operatingHoursEnd: 1440 },
    });
    floor = await db.floor.create({ data: { organizationId: org.id, siteId: site.id, name: "Level 1" } });
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it("reminds once inside the window, before the deadline", async () => {
    // Started 40 min ago: deadline in 20 min, so we're inside the 30-minute reminder lead.
    const { booking, user } = await makeBooking(-40);
    await runCheckInReminderSweep(db);
    await runCheckInReminderSweep(db);

    const reminders = await remindersFor(user.id);
    expect(reminders).toHaveLength(1);
    expect((await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).checkInReminderSentAt).not.toBeNull();

    const text = formatNotification(reminders[0]!.type, reminders[0]!.payload);
    expect(text.title).toBe(`Check in to Desk ${(await db.desk.findUniqueOrThrow({ where: { id: booking.deskId } })).number}`);
    expect(text.body).toMatch(/^Check in by \d{2}:\d{2} or your booking on .* will be released\.$/);
  });

  it("doesn't remind too early, after the deadline, after the booking ended, when checked in, or without check-in", async () => {
    const notStarted = await makeBooking(60);
    const tooEarly = await makeBooking(-10); // deadline in 50 min
    const pastDeadline = await makeBooking(-70); // deadline 10 min ago — auto-cancel handles it
    const ended = await makeBooking(-40, { durationMinutes: 30 }); // a 30-minute booking that's already over
    const checkedIn = await makeBooking(-40, { checkedIn: true });
    const noCheckIn = await makeBooking(-40, { requiresCheckIn: false });

    await runCheckInReminderSweep(db);

    for (const { user } of [notStarted, tooEarly, pastDeadline, ended, checkedIn, noCheckIn]) {
      expect(await remindersFor(user.id)).toHaveLength(0);
    }
  });

  it("times a late booking's reminder from when it was made", async () => {
    // The slot started 70 min ago but was booked 35 min ago: deadline is 25 min from now.
    const { user } = await makeBooking(-70, { createdMinutesAgo: 35 });
    await runCheckInReminderSweep(db);
    const [reminder] = await remindersFor(user.id);
    const deadline = new Date((reminder!.payload as { deadlineAt: string }).deadlineAt).getTime();
    expect(Math.abs(deadline - (Date.now() + 25 * MINUTE))).toBeLessThan(MINUTE);
  });

  it("reminds the booker for a guest booking", async () => {
    const { user } = await makeBooking(-35, { guestName: "Visiting Partner" });
    await runCheckInReminderSweep(db);
    const [reminder] = await remindersFor(user.id);
    expect(formatNotification(reminder!.type, reminder!.payload).body).toMatch(/Visiting Partner's booking/);
  });
});
