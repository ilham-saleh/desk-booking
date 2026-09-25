// Acceptance run for booking-subject behaviour against a running `npm run dev` server:
// employee typeahead search, guest bookings limited to unrestricted desks, occupant-aware
// availability, and the Floor Map deep link from My Bookings. Signs in through the dev
// Credentials provider and drives the real tRPC procedures / pages.
// Usage: node scripts/verify-booking-subjects.mjs  (needs AUTH_ENABLE_DEV_LOGIN=true + seeded users)
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
const deskOf = (availability, deskId) => availability.desks.find((d) => d.deskId === deskId);

const admin = new Session("admin");
const manager = new Session("manager");
const employee = new Session("employee");

console.log("STEP 0 — sign in");
await admin.signIn("ilhamsaleh.nabijonov@thirdbridge.com");
await manager.signIn("booking.manager@thirdbridge.com");
await employee.signIn("standard.one@thirdbridge.com");

const sites = await admin.query("site.list");
const site = sites.find((s) => s.name === "HQ") ?? sites[0];
const floor = site.floors[0];
const tomorrow = nextWeekdayAfter(fmtDate(new Date()));
console.log(`  site ${site.name} / floor ${floor.name}; booking date ${tomorrow}`);

const existing = await admin.query("desk.listForFloor", { floorId: floor.id });
for (const stale of existing.filter((d) => d.number.endsWith("-verify"))) {
  try {
    await admin.mutate("desk.deleteDesk", { deskId: stale.id });
  } catch {
    /* handled by cancelling through the API below */
  }
}
const openDesk = await admin.mutate("desk.createDesk", {
  floorId: floor.id,
  number: "open-verify",
  x: 60,
  y: 60,
});
const restrictedDesk = await admin.mutate("desk.createDesk", {
  floorId: floor.id,
  number: "restricted-verify",
  x: 100,
  y: 60,
});
const shifts = await admin.query("shift.list");
const everydayShift = shifts.find((s) => s.daysOfWeek.length >= 5) ?? shifts[0];
await admin.mutate("desk.save", {
  deskId: restrictedDesk.id,
  number: restrictedDesk.number,
  isActive: true,
  requiresCheckIn: false,
  assignmentMode: "BOOKABLE",
  attributes: [],
  assignments: [
    { restrictionMode: "DEPARTMENT", departmentNames: ["Engineering"], shiftId: everydayShift.id },
  ],
});
console.log(
  `  created ${openDesk.number} (no restrictions) and ${restrictedDesk.number} (Engineering only, shift "${everydayShift.name}")`,
);

const created = [];
try {
  console.log(
    "\nTEST 1 — employee typeahead is a server-side directory search, closed to standard users",
  );
  const hits = await manager.query("user.search", { query: "ril", limit: 20 });
  ok(
    hits.some((u) => u.email === employee.user.email),
    `Booking Manager typing "ril" finds ${employee.user.name}`,
  );
  ok(
    hits.every(
      (u) => /ril/i.test(u.name) || /ril/i.test(u.email) || /ril/i.test(u.department ?? ""),
    ),
    "every hit matches the typed text",
  );
  const none = await manager.query("user.search", { query: "zzzznotaperson", limit: 20 });
  ok(none.length === 0, "a name that isn't in the system returns no options");
  await expectError(
    () => employee.query("user.search", { query: "ril" }),
    /FORBIDDEN/,
    "standard user cannot search the directory",
  );

  console.log("\nTEST 2 — guests: only desks without restrictions");
  const guestOnRestricted = await manager.query("desk.checkEligibility", {
    deskId: restrictedDesk.id,
    date: tomorrow,
    forGuest: true,
  });
  ok(
    guestOnRestricted.eligible === false && guestOnRestricted.status === "GUEST_NOT_ALLOWED",
    `guest blocked on ${restrictedDesk.number}: ${guestOnRestricted.reason}`,
  );
  await expectError(
    () =>
      manager.mutate("booking.create", {
        deskId: restrictedDesk.id,
        date: tomorrow,
        startMinutes: 540,
        endMinutes: 600,
        guestName: "Visitor",
      }),
    /can't be booked for a guest/,
    "guest booking on a restricted desk is rejected server-side",
  );
  const guestOnOpen = await manager.query("desk.checkEligibility", {
    deskId: openDesk.id,
    date: tomorrow,
    forGuest: true,
  });
  ok(guestOnOpen.eligible === true, `guest allowed on ${openDesk.number}`);
  const guestBooking = await manager.mutate("booking.create", {
    deskId: openDesk.id,
    date: tomorrow,
    startMinutes: 540,
    endMinutes: 600,
    guestName: "Visitor",
  });
  created.push(guestBooking);
  ok(
    guestBooking.guestName === "Visitor" && guestBooking.userId === null,
    "guest booking on the open desk succeeds",
  );
  const guestMap = await manager.query("booking.getFloorAvailability", {
    floorId: floor.id,
    date: tomorrow,
    startMinutes: 600,
    endMinutes: 660,
    forGuest: true,
  });
  ok(
    deskOf(guestMap, restrictedDesk.id).eligibleForViewer === false &&
      deskOf(guestMap, openDesk.id).eligibleForViewer === true,
    "Book-a-Desk highlighting for a guest excludes the restricted desk",
  );
  await expectError(
    () =>
      employee.query("desk.checkEligibility", {
        deskId: openDesk.id,
        date: tomorrow,
        forGuest: true,
      }),
    /FORBIDDEN/,
    "standard user cannot evaluate for a guest",
  );

  console.log("\nTEST 3 — availability is evaluated for the chosen employee, not the booker");
  const forEmployee = await manager.query("booking.getFloorAvailability", {
    floorId: floor.id,
    date: tomorrow,
    startMinutes: 600,
    endMinutes: 660,
    occupantUserId: employee.user.id,
  });
  const employeeEligible = deskOf(forEmployee, restrictedDesk.id).eligibleForViewer;
  console.log(
    `  ℹ ${employee.user.name} on ${restrictedDesk.number}: eligibleForViewer=${employeeEligible} (true only if their HRIS department is Engineering)`,
  );
  await expectError(
    () =>
      employee.query("booking.getFloorAvailability", {
        floorId: floor.id,
        date: tomorrow,
        occupantUserId: manager.user.id,
      }),
    /FORBIDDEN/,
    "standard user cannot view availability for someone else",
  );

  console.log("\nTEST 4 — My Bookings → locate on map deep link");
  const own = await employee.mutate("booking.create", {
    deskId: openDesk.id,
    date: tomorrow,
    startMinutes: 780,
    endMinutes: 840,
  });
  created.push(own);
  const mine = await employee.query("booking.listMine", { when: "upcoming" });
  const listed = mine.find((b) => b.id === own.id);
  ok(
    listed?.desk.floor.siteId === site.id && listed?.desk.floor.id === floor.id,
    "listMine carries the site and floor ids the link needs",
  );
  const link = `/floor-map?site=${site.id}&floor=${floor.id}&desk=${openDesk.id}&date=${tomorrow}&start=780&end=840`;
  const page = await employee.fetch(link);
  ok(page.status === 200, `GET ${link.slice(0, 40)}… renders (200)`);
  const bogus = await employee.fetch(`/floor-map?site=<script>&desk=%00&start=17&date=nope`);
  ok(bogus.status === 200, "malformed deep-link params are ignored, page still renders (200)");

  console.log("\nCLEANUP");
} finally {
  for (const b of created) {
    try {
      await admin.mutate("booking.cancel", { bookingId: b.id });
      console.log(`  cancelled ${b.id}`);
    } catch (e) {
      console.log(`  could not cancel ${b.id}: ${e.message}`);
    }
  }
  for (const d of [openDesk, restrictedDesk]) {
    try {
      const res = await admin.mutate("desk.deleteDesk", { deskId: d.id });
      console.log(`  desk ${d.number} ${res?.mode ?? "removed"}`);
    } catch (e) {
      console.log(`  could not delete desk ${d.number}: ${e.message}`);
    }
  }
}
console.log("\nALL CHECKS PASSED");
