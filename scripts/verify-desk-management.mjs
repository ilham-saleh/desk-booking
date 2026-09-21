// Desk Management acceptance run (tasks/desk-management.md §35) against a running
// `npm run dev` server: signs in through the dev Credentials provider, then drives
// the real tRPC procedures. Usage: node scripts/verify-desk-management.mjs
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
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
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
    const csrfRes = await this.fetch("/api/auth/csrf");
    const { csrfToken } = await csrfRes.json();
    const body = new URLSearchParams({ csrfToken, email, callbackUrl: `${BASE}/home` });
    const res = await this.fetch("/api/auth/callback/dev-credentials", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (![200, 302].includes(res.status)) throw new Error(`sign-in ${email} → ${res.status}`);
    const session = await (await this.fetch("/api/auth/session")).json();
    if (!session?.user) throw new Error(`no session for ${email}: ${JSON.stringify(session)}`);
    console.log(`  signed in as ${session.user.email} (${session.user.role})`);
    return session.user;
  }
  async query(proc, input) {
    const params = new URLSearchParams({ batch: "1", input: JSON.stringify({ 0: { json: input ?? null } }) });
    const res = await this.fetch(`/api/trpc/${proc}?${params}`);
    return unwrap(proc, await res.json());
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
    if (pattern.test(e.message)) return console.log(`  ✓ ${msg} (${e.message.slice(0, 90)})`);
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

const admin = new Session("admin");
const employee = new Session("employee");
const sales = new Session("sales");

console.log("STEP 0 — sign in");
await admin.signIn("ilhamsaleh.nabijonov@thirdbridge.com");
await employee.signIn("standard.one@thirdbridge.com"); // Engineering
await sales.signIn("standard.two@thirdbridge.com"); // Sales

console.log("\nAUTHZ — standard user must not reach admin routes/procedures");
const editorPage = await employee.fetch("/admin/editor");
ok([302, 307].includes(editorPage.status) && /\/home/.test(editorPage.headers.get("location") ?? ""), `GET /admin/editor as standard user redirects (${editorPage.status} → ${editorPage.headers.get("location")})`);
const adminEditor = await admin.fetch("/admin/editor");
ok(adminEditor.status === 200, "GET /admin/editor as admin renders (200)");
const floorMapPage = await employee.fetch("/floor-map");
ok(floorMapPage.status === 200, "GET /floor-map as standard user renders (200)");

console.log("\nTEST 1 — site → floor → floor plan + only that floor's desks");
const sites = await admin.query("facility.list");
const site = sites.find((s) => s.name === "HQ") ?? sites[0];
const floors = await admin.query("floor.listForSite", { siteId: site.id });
const floor = floors.find((f) => f.name === "Level 2") ?? floors[0];
const otherFloor = floors.find((f) => f.id !== floor.id);
const plan = await admin.query("floor.getDraftFloorPlan", { floorId: floor.id });
ok(plan.renderedImageKey && plan.imageWidth && plan.imageHeight, `draft floor plan for ${floor.name}: ${plan.imageWidth}x${plan.imageHeight}`);
const planImage = await admin.fetch(`/api/files/${plan.renderedImageKey}`);
ok(planImage.status === 200, "floor plan image is served");
const desksBefore = await admin.query("desk.listForFloor", { floorId: floor.id });
const otherDesks = otherFloor ? await admin.query("desk.listForFloor", { floorId: otherFloor.id }) : [];
ok(desksBefore.every((d) => d.floorId === floor.id), `${desksBefore.length} desks loaded, all on ${floor.name}`);
ok(!otherDesks.some((d) => desksBefore.find((x) => x.id === d.id)), `no overlap with ${otherFloor?.name ?? "other floor"} (${otherDesks.length} desks)`);

console.log("\nTEST 2 — create desk at a clicked position, name it 2.21, refresh");
const stale = desksBefore.find((d) => d.number === "2.21-verify");
if (stale) await admin.mutate("desk.deleteDesk", { deskId: stale.id });
await expectError(() => employee.mutate("desk.createDesk", { floorId: floor.id, x: 10, y: 10 }), /FORBIDDEN/, "standard user cannot create a desk");
const created = await admin.mutate("desk.createDesk", { floorId: floor.id, x: 401.5, y: 302.25 });
ok(created.number.startsWith("Desk ") && created.x === 401.5, `created ${created.number} at (${created.x}, ${created.y})`);
let desk = await admin.query("desk.get", { deskId: created.id });
ok(desk.x === 401.5 && desk.y === 302.25, "position persisted (fresh read)");

console.log("\nTEST 3 — reposition and reload");
await admin.mutate("desk.moveDesk", { deskId: created.id, x: 777, y: 555 });
desk = await admin.query("desk.get", { deskId: created.id });
ok(desk.x === 777 && desk.y === 555, "moved position persisted (fresh read)");
const reloaded = await admin.query("desk.listForFloor", { floorId: floor.id });
ok(reloaded.find((d) => d.id === created.id)?.x === 777, "floor list shows the new position too");

console.log("\nTEST 5 — reusable restrictions");
const existing = await admin.query("restriction.listRestrictions");
for (const r of existing.filter((r) => ["Technology", "Global Client Services"].includes(r.name))) {
  await admin.mutate("restriction.deleteRestriction", { restrictionId: r.id, force: true });
}
const departments = await admin.query("restriction.listDepartmentOptions");
ok(departments.includes("Engineering") && departments.includes("Sales"), `department options come from real data: ${departments.join(", ")}`);
const technology = await admin.mutate("restriction.createRestriction", {
  name: "Technology",
  color: "#2563eb",
  rules: [{ fieldType: "DEPARTMENT", operator: "IS_ANY_OF", value: ["Engineering", "Product", "Technology"], connector: "OR" }],
});
const gcs = await admin.mutate("restriction.createRestriction", {
  name: "Global Client Services",
  color: "#059669",
  rules: [{ fieldType: "DEPARTMENT", operator: "IS_ANY_OF", value: ["Sales"], connector: "OR" }],
});
const list = await admin.query("restriction.listRestrictions");
ok(list.some((r) => r.id === technology.id && r.rules.length === 1 && r.color === "#2563eb"), "Technology appears in the reusable list with its rule and colour");
const count = await admin.query("restriction.previewMatchCount", { rules: [{ fieldType: "DEPARTMENT", operator: "IS_ANY_OF", value: ["Engineering"], connector: "OR" }] });
ok(count.matching >= 1 && count.total >= count.matching, `live match count is real: ${count.matching} of ${count.total} employees`);

console.log("\nTEST 4/6/7 — edit desk: details + four restriction/shift blocks, save, reload");
const shifts = await admin.query("shift.list");
const shiftByName = Object.fromEntries(shifts.map((s) => [s.name, s]));
ok(shiftByName["Mon + Fri"] && shiftByName["Wednesday Only"] && shiftByName["Thursday Only"] && shiftByName["Tuesday Only"], `reusable shifts available (${shifts.length})`);
const saved = await admin.mutate("desk.save", {
  deskId: created.id,
  number: "2.21-verify",
  description: "Quiet desk beside the window.",
  isActive: true,
  requiresCheckIn: false,
  assignmentMode: "BOOKABLE",
  attributes: ["STANDING_DESK", "NEAR_WINDOW"],
  assignments: [
    { restrictionMode: "ANYONE", shiftId: shiftByName["Mon + Fri"].id },
    { restrictionMode: "CUSTOM", restrictionId: technology.id, shiftId: shiftByName["Wednesday Only"].id },
    { restrictionMode: "CUSTOM", restrictionId: gcs.id, shiftId: shiftByName["Thursday Only"].id, advanceBookingWindowDays: 30 },
    { restrictionMode: "ANYONE", shiftId: shiftByName["Tuesday Only"].id },
  ],
});
ok(saved.number === "2.21-verify" && saved.restrictionAssignments.length === 4, "save returned 4 restriction blocks");
desk = await employee.query("desk.get", { deskId: created.id }); // as a standard user — what the Floor Map panel reads
ok(desk.description === "Quiet desk beside the window.", "description persisted");
ok(desk.attributes.map((a) => a.type).sort().join() === "NEAR_WINDOW,STANDING_DESK", "attributes persisted");
const summary = desk.restrictionAssignments.map((a) => `${a.restriction?.name ?? "Anyone can book"} / ${a.shift.name} (${a.shift.daysOfWeek.join(",")})`);
console.log("    Restricted to:\n      " + summary.join("\n      "));
ok(summary.join("|") === "Anyone can book / Mon + Fri (1,5)|Technology / Wednesday Only (3)|Global Client Services / Thursday Only (4)|Anyone can book / Tuesday Only (2)", "all four assignments persisted in order with shift days");
ok(desk.restrictionAssignments[2].advanceBookingWindowDays === 30, "advance booking window persisted");
await expectError(
  () =>
    admin.mutate("desk.save", {
      deskId: created.id,
      number: "2.21-verify",
      isActive: true,
      requiresCheckIn: false,
      assignmentMode: "BOOKABLE",
      attributes: [],
      assignments: [
        { restrictionMode: "ANYONE", shiftId: shiftByName["Mon + Fri"].id },
        { restrictionMode: "ANYONE", shiftId: shiftByName["Mon–Fri"].id },
      ],
    }),
  /covered by more than one restriction block/,
  "overlapping shifts on one desk are rejected",
);

console.log("\nBLOCK TARGETS — occupant and department blocks");
const engUser = (await admin.query("user.search", { query: "standard.one" }))[0];
const withTargets = await admin.mutate("desk.save", {
  deskId: created.id,
  number: "2.21-verify",
  isActive: true,
  requiresCheckIn: false,
  assignmentMode: "BOOKABLE",
  attributes: [],
  assignments: [
    { restrictionMode: "ASSIGNED_OCCUPANTS", occupantUserIds: [engUser.id], shiftId: shiftByName["Mon & Wed"].id },
    { restrictionMode: "DEPARTMENT", departmentNames: ["Sales"], shiftId: shiftByName["Thursday Only"].id },
  ],
});
ok(withTargets.restrictionAssignments[0].occupants.length === 1 && withTargets.restrictionAssignments[1].departmentNames[0] === "Sales", "occupant + department blocks persisted");
const monday = nextDateFor(1);
ok((await sales.query("desk.checkEligibility", { deskId: created.id, date: monday })).status === "NOT_ASSIGNED_OCCUPANT", "non-listed employee refused on the occupant block's day");
ok((await employee.query("desk.checkEligibility", { deskId: created.id, date: monday })).eligible === true, "listed occupant admitted");
ok((await sales.query("desk.checkEligibility", { deskId: created.id, date: nextDateFor(4) })).eligible === true, "Sales employee admitted by the department block on Thursday");
// restore the four-block configuration for the remaining tests
await admin.mutate("desk.save", {
  deskId: created.id,
  number: "2.21-verify",
  description: "Quiet desk beside the window.",
  isActive: true,
  requiresCheckIn: false,
  assignmentMode: "BOOKABLE",
  attributes: ["STANDING_DESK", "NEAR_WINDOW"],
  assignments: [
    { restrictionMode: "ANYONE", shiftId: shiftByName["Mon + Fri"].id },
    { restrictionMode: "CUSTOM", restrictionId: technology.id, shiftId: shiftByName["Wednesday Only"].id },
    { restrictionMode: "CUSTOM", restrictionId: gcs.id, shiftId: shiftByName["Thursday Only"].id, advanceBookingWindowDays: 30 },
    { restrictionMode: "ANYONE", shiftId: shiftByName["Tuesday Only"].id },
  ],
});

console.log("\nTEST 8 — Floor Map: eligibility + restricted state for real users");
const wednesday = nextDateFor(3);
const thursday = nextDateFor(4);
const engWed = await employee.query("desk.checkEligibility", { deskId: created.id, date: wednesday });
ok(engWed.eligible === true, `Engineering employee eligible on Wednesday (${wednesday})`);
const salesWed = await sales.query("desk.checkEligibility", { deskId: created.id, date: wednesday });
ok(salesWed.eligible === false && /restricted to Technology on Wednesdays/.test(salesWed.reason), `Sales employee refused on Wednesday: "${salesWed.reason}"`);
const salesThu = await sales.query("desk.checkEligibility", { deskId: created.id, date: thursday });
ok(salesThu.eligible === true, "Sales employee eligible on Thursday (Global Client Services)");
const availability = await sales.query("booking.getFloorAvailability", { floorId: floor.id, date: wednesday });
const live = availability.desks.find((d) => d.deskId === created.id);
ok(live && live.eligibleForViewer === false, "floor availability marks the desk restricted for the Sales viewer on Wednesday");
await expectError(() => sales.mutate("booking.create", { deskId: created.id, date: wednesday, startMinutes: 540, endMinutes: 600 }), /restricted to Technology on Wednesdays/, "server rejects the Sales booking on Wednesday with a clear reason");
const salesUser = (await admin.query("user.search", { query: "standard.two" }))[0];
await expectError(
  () => admin.mutate("booking.create", { deskId: created.id, date: wednesday, startMinutes: 540, endMinutes: 600, forUserId: salesUser.id }),
  /restricted to Technology/,
  "admin booking on behalf is validated against the occupant, not the admin",
);
const booking = await employee.mutate("booking.create", { deskId: created.id, date: wednesday, startMinutes: 540, endMinutes: 600 });
ok(booking.status === "CONFIRMED", "Engineering employee books the desk on Wednesday");

console.log("\nTEST 9 — safe delete");
await expectError(() => admin.mutate("desk.deleteDesk", { deskId: created.id }), /upcoming booking/, "delete blocked while an upcoming booking exists");
await employee.mutate("booking.cancel", { bookingId: booking.id });
const deleted = await admin.mutate("desk.deleteDesk", { deskId: created.id });
ok(deleted.mode === "archived", "desk with booking history is archived (history retained)");
const after = await admin.query("desk.listForFloor", { floorId: floor.id });
ok(!after.some((d) => d.id === created.id), "desk no longer appears on the floor after refresh");
const floorForMap = await employee.query("floor.get", { floorId: floor.id });
ok(!floorForMap.desks.some((d) => d.id === created.id), "Floor Map no longer lists the desk");
const scratch = await admin.mutate("desk.createDesk", { floorId: floor.id, x: 5, y: 5 });
const hard = await admin.mutate("desk.deleteDesk", { deskId: scratch.id });
ok(hard.mode === "deleted", "desk without bookings is hard-deleted");

// cleanup verification restrictions
await admin.mutate("restriction.deleteRestriction", { restrictionId: technology.id, force: true });
await admin.mutate("restriction.deleteRestriction", { restrictionId: gcs.id, force: true });
console.log("\nALL HTTP ACCEPTANCE CHECKS PASSED");
