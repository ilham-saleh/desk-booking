// Acceptance run for time-window desk availability + admin "End Booking", against a
// running `npm run dev` server: signs in through the dev Credentials provider and drives
// the real tRPC procedures. Usage: node scripts/verify-booking-window.mjs
// Requires AUTH_ENABLE_DEV_LOGIN=true, the seeded customer-zero users, and DATABASE_URL
// in .env (one in-progress booking is inserted directly, since the API rightly refuses
// to create bookings that start in the past).
import "dotenv/config";
import { randomBytes } from "node:crypto";
import pg from "pg";

const BASE = "http://localhost:3000";
const TZ = "Europe/London";

class Session {
  constructor(label) {
    this.label = label;
    this.cookies = new Map();
  }
  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  absorb(res) {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === "" || /Max-Age=0/i.test(c)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  async fetch(path, init = {}) {
    const res = await fetch(BASE + path, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers ?? {}), cookie: this.cookieHeader() },
    });
    this.absorb(res);
    return res;
  }
  async signIn(email) {
    const { csrfToken } = await (await this.fetch("/api/auth/csrf")).json();
    const body = new URLSearchParams({ csrfToken, email, callbackUrl: `${BASE}/home` });
    const res = await this.fetch("/api/auth/callback/dev-credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (![200, 302].includes(res.status)) throw new Error(`sign-in ${email} → ${res.status}`);
    const session = await (await this.fetch("/api/auth/session")).json();
    if (!session?.user) throw new Error(`no session for ${email}`);
    console.log(`  signed in as ${session.user.email} (${session.user.role})`);
    this.user = session.user;
    return session.user;
  }
  async query(proc, input) {
    const params = new URLSearchParams({
      batch: "1",
      input: JSON.stringify({ 0: { json: input ?? null } }),
    });
    return unwrap(proc, await (await this.fetch(`/api/trpc/${proc}?${params}`)).json());
  }
  async mutate(proc, input) {
    const res = await this.fetch(`/api/trpc/${proc}?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ 0: { json: input } }),
    });
    return unwrap(proc, await res.json());
  }
}

function unwrap(proc, payload) {
  const item = Array.isArray(payload) ? payload[0] : payload;
  if (item?.error) {
    const err = new Error(`${proc}: ${item.error.json?.message ?? JSON.stringify(item.error)}`);
    err.code = item.error.json?.data?.code;
    throw err;
  }
  return item?.result?.data?.json;
}

const ok = (cond, msg) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
};
const expectError = async (fn, pattern, msg) => {
  try {
    await fn();
  } catch (e) {
    if (pattern.test(e.message) || pattern.test(e.code ?? ""))
      return console.log(`  ✓ ${msg} (${e.message.slice(0, 100)})`);
    throw new Error(`${msg}: unexpected error ${e.message}`);
  }
  throw new Error(`${msg}: expected an error`);
};

const fmtDate = (d) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
function nextWeekdayAfter(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
const nowMinutesLondon = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  return (
    (Number(parts.find((p) => p.type === "hour").value) % 24) * 60 +
    Number(parts.find((p) => p.type === "minute").value)
  );
};
const deskOf = (availability, deskId) => availability.desks.find((d) => d.deskId === deskId);

const admin = new Session("admin");
const siteAdmin = new Session("site-admin");
const userA = new Session("A");
const userB = new Session("B");

console.log("STEP 0 — sign in");
await admin.signIn("ilhamsaleh.nabijonov@thirdbridge.com");
await siteAdmin.signIn("site.admin@thirdbridge.com");
await userA.signIn("standard.one@thirdbridge.com");
await userB.signIn("standard.two@thirdbridge.com");

const sites = await admin.query("site.list");
const site = sites.find((s) => s.name === "HQ") ?? sites[0];
const floor = site.floors[0];
const today = fmtDate(new Date());
const todayIsWeekday = ![0, 6].includes(new Date(`${today}T12:00:00Z`).getUTCDay());
const tomorrow = nextWeekdayAfter(today);
console.log(
  `  site ${site.name} / floor ${floor.name}; today ${today} (${todayIsWeekday ? "weekday" : "weekend"}), next weekday ${tomorrow}`,
);

// Direct DB access only for the in-progress fixture (Prisma stores UTC wall-clock in timestamp columns,
// hence `now() at time zone 'utc'` everywhere below). Stale fixture rows from an aborted run go first.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`delete from audit_logs where "targetId" like 'verify_%'`);
await client.query(`delete from bookings where id like 'verify_%'`);
let fixtureId = null;

// A dedicated desk so the run never collides with real bookings.
const existing = await admin.query("desk.listForFloor", { floorId: floor.id });
for (const stale of existing.filter(
  (d) => d.number === "2.10-verify" || d.number === "2.11-verify",
)) {
  try {
    await admin.mutate("desk.deleteDesk", { deskId: stale.id });
  } catch {
    /* has bookings — handled below by cancelling through the API where possible */
  }
}
const desk = await admin.mutate("desk.createDesk", {
  floorId: floor.id,
  number: "2.10-verify",
  x: 50,
  y: 50,
});
// A second desk for the in-progress fixture, so it can't collide with B's booking on the first one.
const desk2 = await admin.mutate("desk.createDesk", {
  floorId: floor.id,
  number: "2.11-verify",
  x: 90,
  y: 50,
});
console.log(`  created desks ${desk.number} (${desk.id}) and ${desk2.number} (${desk2.id})`);

const created = [];
try {
  console.log("\nTEST 1 — User A books tomorrow 09:00–18:00; today stays available for User B");
  const bookingA = await userA.mutate("booking.create", {
    deskId: desk.id,
    date: tomorrow,
    startMinutes: 540,
    endMinutes: 1080,
  });
  created.push(bookingA);
  ok(bookingA.status === "CONFIRMED", `A booked ${tomorrow} 09:00–18:00`);

  const todayWindow = await userB.query("booking.getFloorAvailability", {
    floorId: floor.id,
    date: today,
    startMinutes: 960,
    endMinutes: 1080,
  });
  ok(
    deskOf(todayWindow, desk.id).state === "AVAILABLE",
    `today 16:00–18:00 → AVAILABLE for B (was yellow/SCHEDULED before)`,
  );
  ok(deskOf(todayWindow, desk.id).bookings.length === 0, "no bookings listed for today");
  const todayWhole = await userB.query("booking.getFloorAvailability", {
    floorId: floor.id,
    date: today,
  });
  ok(deskOf(todayWhole, desk.id).state === "AVAILABLE", "today whole-day view → AVAILABLE");

  console.log(
    "\nTEST 2 — tomorrow shows BOOKED only where A's booking overlaps, with A's details visible to B",
  );
  const tmrwDuring = await userB.query("booking.getFloorAvailability", {
    floorId: floor.id,
    date: tomorrow,
    startMinutes: 960,
    endMinutes: 1080,
  });
  const seenByB = deskOf(tmrwDuring, desk.id);
  ok(seenByB.state === "BOOKED", `tomorrow 16:00–18:00 → BOOKED`);
  ok(
    seenByB.bookings[0]?.occupant?.name === userA.user.name,
    `B sees occupant "${seenByB.bookings[0]?.occupant?.name}"`,
  );
  ok(seenByB.bookings[0]?.occupant?.email === userA.user.email, "B sees occupant email");
  ok(
    seenByB.bookings[0]?.canManage === false && seenByB.bookings[0]?.isOwn === false,
    "B may not manage A's booking (canManage=false)",
  );
  const tmrwBefore = await userB.query("booking.getFloorAvailability", {
    floorId: floor.id,
    date: tomorrow,
    startMinutes: 420,
    endMinutes: 540,
  });
  ok(
    deskOf(tmrwBefore, desk.id).state === "AVAILABLE",
    "tomorrow 07:00–09:00 → AVAILABLE (booking not started yet)",
  );

  const seenByAdmin = deskOf(
    await admin.query("booking.getFloorAvailability", { floorId: floor.id, date: tomorrow }),
    desk.id,
  );
  ok(
    seenByAdmin.bookings[0]?.canManage === true,
    "System Admin may manage A's booking (canManage=true)",
  );
  const seenBySiteAdmin = deskOf(
    await siteAdmin.query("booking.getFloorAvailability", { floorId: floor.id, date: tomorrow }),
    desk.id,
  );
  console.log(
    `  ℹ Facility Admin canManage=${seenBySiteAdmin.bookings[0]?.canManage} (true only if they hold FACILITY_ADMIN on ${site.name})`,
  );

  console.log("\nTEST 3 — User B books today at an overlapping wall-clock time");
  const nowMin = nowMinutesLondon();
  if (todayIsWeekday && nowMin < 1050) {
    const start = Math.max(960, Math.ceil((nowMin + 1) / 30) * 30);
    const bookingB = await userB.mutate("booking.create", {
      deskId: desk.id,
      date: today,
      startMinutes: start,
      endMinutes: 1080,
    });
    created.push(bookingB);
    ok(
      bookingB.status === "CONFIRMED",
      `B booked today ${start / 60}:${String(start % 60).padStart(2, "0")}–18:00 while A holds it tomorrow`,
    );
    const afterB = deskOf(
      await userA.query("booking.getFloorAvailability", {
        floorId: floor.id,
        date: today,
        startMinutes: start,
        endMinutes: 1080,
      }),
      desk.id,
    );
    ok(
      afterB.state === "BOOKED" && afterB.bookings[0]?.occupant?.name === userB.user.name,
      `A now sees today's slot BOOKED by "${userB.user.name}"`,
    );
    await expectError(
      () => userA.mutate("booking.cancel", { bookingId: bookingB.id }),
      /FORBIDDEN|own bookings/,
      "A cannot cancel B's booking",
    );
  } else {
    console.log("  ⚠ skipped: outside HQ operating hours or weekend right now");
  }

  console.log("\nTEST 4 — standard user cannot cancel/end another's booking; admin can");
  await expectError(
    () => userB.mutate("booking.cancel", { bookingId: bookingA.id }),
    /FORBIDDEN|own bookings/,
    "B cannot cancel A's booking",
  );
  await expectError(
    () => userB.mutate("booking.endBooking", { bookingId: bookingA.id }),
    /FORBIDDEN|own bookings/,
    "B cannot end A's booking",
  );
  await expectError(
    () => userA.mutate("booking.endBooking", { bookingId: bookingA.id }),
    /hasn't started/,
    "A cannot 'end' a booking that hasn't started (cancel instead)",
  );

  console.log("\nTEST 5 — admin ends another user's IN-PROGRESS booking from the panel data");
  const id = `verify_${randomBytes(8).toString("hex")}`;
  fixtureId = id;
  const org = (await client.query('select "organizationId" from desks where id = $1', [desk2.id]))
    .rows[0].organizationId;
  const holderId = userA.user.id;
  const holderDeskFree = (
    await client.query(
      `select count(*)::int as n from bookings where "userId" = $1 and status in ('CONFIRMED','CHECKED_IN') and "startAt" < (now() at time zone 'utc') + interval '30 minutes' and "endAt" > (now() at time zone 'utc') - interval '30 minutes'`,
      [holderId],
    )
  ).rows[0].n;
  if (holderDeskFree > 0)
    throw new Error(
      "User A already has a booking around now — cannot insert the in-progress fixture",
    );
  await client.query(
    `insert into bookings (id, "organizationId", "deskId", "userId", "bookedById", date, "startAt", "endAt", status, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $4, $5::date, (now() at time zone 'utc') - interval '30 minutes', (now() at time zone 'utc') + interval '30 minutes', 'CONFIRMED', now() at time zone 'utc', now() at time zone 'utc')`,
    [id, org, desk2.id, holderId, today],
  );
  console.log(`  inserted in-progress booking ${id} for ${userA.user.name}`);
  const nowStart = Math.floor(nowMinutesLondon() / 30) * 30;
  const liveWindow = {
    startMinutes: Math.min(Math.max(nowStart, 420), 1050),
    endMinutes: Math.min(Math.max(nowStart, 420) + 30, 1080),
  };
  const live = deskOf(
    await userB.query("booking.getFloorAvailability", {
      floorId: floor.id,
      date: today,
      ...liveWindow,
    }),
    desk2.id,
  );
  ok(live.state === "BOOKED", `right now (${liveWindow.startMinutes / 60}h slot) → BOOKED`);
  ok(
    live.bookings.find((b) => b.id === id)?.occupant?.name === userA.user.name,
    "B sees who holds the desk right now",
  );
  await expectError(
    () => userB.mutate("booking.endBooking", { bookingId: id }),
    /FORBIDDEN|own bookings/,
    "B cannot end A's in-progress booking",
  );
  const ended = await admin.mutate("booking.endBooking", { bookingId: id });
  ok(ended.status === "COMPLETED", "System Admin ended A's in-progress booking");
  const freed = deskOf(
    await userB.query("booking.getFloorAvailability", {
      floorId: floor.id,
      date: today,
      ...liveWindow,
    }),
    desk2.id,
  );
  ok(freed.state === "AVAILABLE", "desk is AVAILABLE again right now");
  const audit = (
    await client.query(
      `select "actorId" from audit_logs where "targetId" = $1 and action = 'booking.endEarly'`,
      [id],
    )
  ).rows[0];
  ok(audit?.actorId === admin.user.id, "audit log records the admin as actor");

  console.log("\nCLEANUP");
} finally {
  if (fixtureId) {
    await client.query(`delete from audit_logs where "targetId" = $1`, [fixtureId]);
    await client.query(`delete from bookings where id = $1`, [fixtureId]);
    console.log(`  removed fixture ${fixtureId}`);
  }
  await client.end();
  for (const b of created) {
    try {
      await admin.mutate("booking.cancel", { bookingId: b.id });
      console.log(`  cancelled ${b.id}`);
    } catch (e) {
      console.log(`  could not cancel ${b.id}: ${e.message}`);
    }
  }
  for (const d of [desk, desk2]) {
    try {
      const res = await admin.mutate("desk.deleteDesk", { deskId: d.id });
      console.log(`  desk ${d.number} ${res?.mode ?? "removed"}`);
    } catch (e) {
      console.log(`  could not delete desk ${d.number}: ${e.message}`);
    }
  }
}
console.log("\nALL CHECKS PASSED");
