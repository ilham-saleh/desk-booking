// Users Management acceptance run (tasks/users-management.md §36) against a running
// `npm run dev` server: signs in through the dev Credentials provider, then drives the
// real pages and tRPC procedures. Usage: node scripts/verify-users-management.mjs
// Requires AUTH_ENABLE_DEV_LOGIN=true and the seeded customer-zero users.
const BASE = "http://localhost:3000";

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
    const res = await fetch(BASE + path, { ...init, redirect: "manual", headers: { ...(init.headers ?? {}), cookie: this.cookieHeader() } });
    this.absorb(res);
    return res;
  }
  async signIn(email) {
    const { csrfToken } = await (await this.fetch("/api/auth/csrf")).json();
    const body = new URLSearchParams({ csrfToken, email, callbackUrl: `${BASE}/home` });
    const res = await this.fetch("/api/auth/callback/dev-credentials", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    if (![200, 302].includes(res.status)) throw new Error(`sign-in ${email} → ${res.status}`);
    const session = await (await this.fetch("/api/auth/session")).json();
    if (!session?.user) throw new Error(`no session for ${email}: ${JSON.stringify(session)}`);
    console.log(`  signed in as ${session.user.email} (${session.user.role})`);
    return session.user;
  }
  async query(proc, input) {
    const params = new URLSearchParams({ batch: "1", input: JSON.stringify({ 0: { json: input ?? null } }) });
    return unwrap(proc, await (await this.fetch(`/api/trpc/${proc}?${params}`)).json());
  }
  async mutate(proc, input) {
    const res = await this.fetch(`/api/trpc/${proc}?batch=1`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ 0: { json: input } }) });
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
    if (pattern.test(e.message) || pattern.test(e.code ?? "")) return console.log(`  ✓ ${msg} (${e.message.slice(0, 100)})`);
    throw new Error(`${msg}: unexpected error ${e.message}`);
  }
  throw new Error(`${msg}: expected an error`);
};
function nextDateFor(dayOfWeek) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  while (d.getUTCDay() !== dayOfWeek) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const redirectsHome = (res) => [302, 307].includes(res.status) && /\/home/.test(res.headers.get("location") ?? "");

const admin = new Session("admin");
const manager = new Session("manager");
const employee = new Session("employee");

console.log("STEP 0 — sign in");
await admin.signIn("ilhamsaleh.nabijonov@thirdbridge.com");
await manager.signIn("booking.manager@thirdbridge.com");
await employee.signIn("standard.one@thirdbridge.com");

console.log("\nTEST 12 — Booking Manager / Standard User cannot reach admin routes");
for (const [label, s] of [["booking manager", manager], ["standard user", employee]]) {
  ok(redirectsHome(await s.fetch("/admin/users")), `GET /admin/users as ${label} redirects to /home`);
  ok(redirectsHome(await s.fetch("/admin/editor")), `GET /admin/editor as ${label} redirects to /home`);
  await expectError(() => s.query("user.listDirectory", {}), /FORBIDDEN/, `user.listDirectory refused for ${label}`);
}
ok((await admin.fetch("/admin/users")).status === 200, "GET /admin/users as System Admin renders (200)");

console.log("\nTEST 1/3/4 — users list: columns, search, role filter, pagination");
const page = await admin.query("user.listDirectory", { pageSize: 25 });
ok(page.items.length > 0 && page.total >= page.items.length, `directory returns ${page.items.length} of ${page.total} users (page ${page.page}/${page.pageCount})`);
const sample = page.items[0];
ok(["id", "name", "email", "title", "department", "roleLabel", "permissionSummary"].every((k) => k in sample), "rows carry Name / Email / Title / Department / Role / Permissions");
console.log("    " + page.items.map((u) => `${u.name} | ${u.email} | ${u.title ?? "—"} | ${u.department ?? "—"} | ${u.roleLabel} | ${u.permissionSummary}`).join("\n    "));
const byEmail = await admin.query("user.listDirectory", { search: "booking.manager@" });
ok(byEmail.items.length === 1 && byEmail.items[0].email === "booking.manager@thirdbridge.com", "search by email finds the right employee");
const byName = await admin.query("user.listDirectory", { search: "riley" });
ok(byName.items.some((u) => u.email === "standard.one@thirdbridge.com"), "search by first name finds the right employee");
const managers = await admin.query("user.listDirectory", { role: "BOOKING_MANAGER" });
ok(managers.items.length > 0 && managers.items.every((u) => u.role === "BOOKING_MANAGER"), "role filter shows only Booking Managers");
const small = await admin.query("user.listDirectory", { pageSize: 5, page: 1 });
ok(small.items.length <= 5 && small.pageCount === Math.ceil(small.total / 5), `pagination: ${small.items.length} rows on page 1 of ${small.pageCount}`);

console.log("\nTEST 5 — profile fields are Entra-owned: Save User changes only the role");
const riley = byName.items.find((u) => u.email === "standard.one@thirdbridge.com");
const original = await admin.query("user.get", { userId: riley.id });
ok((await admin.fetch(`/admin/users/${riley.id}`)).status === 200, "GET /admin/users/[userId] renders (200)");
// Profile keys are not part of the input schema, so they are dropped rather than written.
await admin.mutate("user.save", { userId: riley.id, firstName: "Rylee", email: "standard.one+verify@thirdbridge.com", location: "Manchester", role: original.role });
const fresh = await admin.query("user.get", { userId: riley.id });
ok(
  fresh.firstName === original.firstName && fresh.email === original.email && fresh.location === original.location && fresh.title === original.title && fresh.department === original.department,
  "Entra-owned names / email / location / title / department untouched by Save User",
);

console.log("\nTEST 8/9/10/11 — Booking Manager permissions end-to-end");
const sites = await admin.query("facility.list");
const hq = sites.find((s) => s.name === "HQ");
const ny = sites.find((s) => s.name === "New York");
ok(hq && ny, `two sites available: ${sites.map((s) => s.name).join(", ")}`);
const morgan = byEmail.items[0];
// start from a clean slate: Standard User → Booking Manager, no permissions
await admin.mutate("user.save", { userId: morgan.id, role: "STANDARD_USER" });
await admin.mutate("user.save", { userId: morgan.id, role: "BOOKING_MANAGER" });
let detail = await admin.query("user.get", { userId: morgan.id });
ok(detail.role === "BOOKING_MANAGER" && detail.permissions.length === 0 && detail.permissionSummary === "No booking permissions", "new Booking Manager has no 'book for others' sites");
ok(detail.availableSites.length === sites.length, `Available Sites lists all ${sites.length} sites`);

const hqFloors = await admin.query("floor.listForSite", { siteId: hq.id });
const hqDesks = await admin.query("desk.listForFloor", { floorId: hqFloors[0].id });
const hqDesk = hqDesks.find((d) => d.isActive && d.restrictionAssignments.every((a) => a.restrictionMode === "ANYONE")) ?? hqDesks[0];
const rileyId = riley.id;
const tuesday = nextDateFor(2);
await expectError(
  () => manager.mutate("booking.create", { deskId: hqDesk.id, date: tuesday, startMinutes: 600, endMinutes: 660, forUserId: rileyId }),
  /permission to book on behalf of others at HQ/,
  "without permission, booking for another employee at HQ is refused",
);

await admin.mutate("user.addSitePermissions", { userId: morgan.id, siteIds: [hq.id, ny.id] });
detail = await admin.query("user.get", { userId: morgan.id });
ok(detail.permissions.map((p) => p.siteName).sort().join(",") === [hq.name, ny.name].sort().join(","), "Add Selected: both sites appear under associated permissions");
ok(detail.permissionSummary.startsWith("Book for others:"), `Permissions column reads "${detail.permissionSummary}"`);

const delegated = await manager.mutate("booking.create", { deskId: hqDesk.id, date: tuesday, startMinutes: 600, endMinutes: 660, forUserId: rileyId });
ok(delegated.userId === rileyId && delegated.bookedById !== rileyId, `Booking Manager booked desk ${hqDesk.number} at HQ on behalf of Riley (occupant ≠ creator)`);
await manager.mutate("booking.cancel", { bookingId: delegated.id });

await admin.mutate("user.removeSitePermission", { userId: morgan.id, siteId: ny.id });
await admin.mutate("user.removeSitePermission", { userId: morgan.id, siteId: hq.id });
detail = await admin.query("user.get", { userId: morgan.id });
ok(detail.permissions.length === 0, "Remove: permissions disappear");
await expectError(
  () => manager.mutate("booking.create", { deskId: hqDesk.id, date: tuesday, startMinutes: 600, endMinutes: 660, forUserId: rileyId }),
  /permission to book on behalf of others/,
  "after removal, delegated booking at HQ is refused again",
);
await admin.mutate("user.addSitePermissions", { userId: morgan.id, siteIds: [hq.id] }); // restore seed state

console.log("\nTEST 6/7 — System Admin & Facility Admin role assignment");
const samRow = (await admin.query("user.listDirectory", { search: "site.admin@" })).items[0];
let sam = await admin.query("user.get", { userId: samRow.id });
ok(sam.role === "SITE_ADMIN" && sam.permissions.some((p) => p.siteName === "HQ"), "Facility Admin Sam manages HQ");
const samSession = new Session("sam");
await samSession.signIn("site.admin@thirdbridge.com");
const nyFloors = await admin.query("floor.listForSite", { siteId: ny.id });
await expectError(() => samSession.mutate("floor.create", { siteId: ny.id, name: "Sam's NY floor" }), /FORBIDDEN|don't manage/, "Facility Admin cannot manage New York (server denies)");
ok((await samSession.query("facility.list")).every((s) => s.id === hq.id), "Facility Admin's site list is only HQ");
ok(Array.isArray(nyFloors), "admin can read New York floors");
await admin.mutate("user.save", { userId: sam.id, role: "ORG_SUPER_ADMIN" });
sam = await admin.query("user.get", { userId: sam.id });
ok(sam.permissionSummary === "All sites and floors" && sam.permissions.length === 0, "System Admin shows 'All sites and floors' with no permission rows");
const samAsSuper = new Session("sam2");
await samAsSuper.signIn("site.admin@thirdbridge.com");
ok((await samAsSuper.query("facility.list")).length === sites.length, "System Admin sees every site");
await admin.mutate("user.save", { userId: sam.id, role: "SITE_ADMIN" });
await admin.mutate("user.addSitePermissions", { userId: sam.id, siteIds: [hq.id] });
sam = await admin.query("user.get", { userId: sam.id });
ok(sam.role === "SITE_ADMIN" && sam.permissions.map((p) => p.siteName).join() === "HQ", "restored Sam as Facility Admin of HQ");

console.log("\nTEST 13/14 — Edit Users → remove users (soft), history intact, access blocked");
const jordan = (await admin.query("user.listDirectory", { search: "standard.two@" })).items[0];
const jordanSession = new Session("jordan");
await jordanSession.signIn("standard.two@thirdbridge.com");
const bookingsBefore = (await jordanSession.query("booking.listMine", { when: "past" })).length + (await jordanSession.query("booking.listMine", { when: "upcoming" })).length;
const removed = await admin.mutate("user.deactivateMany", { userIds: [jordan.id] });
ok(removed.deactivated === 1, "bulk remove deactivated 1 user");
ok(!(await admin.query("user.listDirectory", { search: "standard.two@" })).items.length, "removed user hidden from the default (Active) list");
ok((await admin.query("user.listDirectory", { search: "standard.two@", status: "inactive" })).items.length === 1, "…and visible under Inactive");
await expectError(() => jordanSession.query("booking.listMine", { when: "upcoming" }), /no longer has access|UNAUTHORIZED/, "removed user's live session is refused");
const denied = new Session("jordan-again");
await expectError(() => denied.signIn("standard.two@thirdbridge.com"), /no session|sign-in/, "removed user cannot sign in");
await admin.mutate("user.reactivate", { userId: jordan.id });
const jordanBack = new Session("jordan-back");
await jordanBack.signIn("standard.two@thirdbridge.com");
const bookingsAfter = (await jordanBack.query("booking.listMine", { when: "past" })).length + (await jordanBack.query("booking.listMine", { when: "upcoming" })).length;
ok(bookingsAfter === bookingsBefore, `booking history intact (${bookingsAfter} bookings) after remove + reactivate`);

console.log("\nALL HTTP ACCEPTANCE CHECKS PASSED");
