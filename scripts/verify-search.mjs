// Acceptance run for global search (desks by number, people by name) and the person card,
// against a running `npm run dev` server, as a STANDARD user. Usage: node scripts/verify-search.mjs
const BASE = "http://localhost:3000";

class Session {
  cookies = new Map();
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
  }
  async query(proc, input) {
    const params = new URLSearchParams({
      batch: "1",
      input: JSON.stringify({ 0: { json: input ?? null } }),
    });
    const item = (await (await this.fetch(`/api/trpc/${proc}?${params}`)).json())[0];
    if (item?.error) {
      const err = new Error(`${proc}: ${item.error.json?.message}`);
      err.code = item.error.json?.data?.code;
      throw err;
    }
    return item?.result?.data?.json;
  }
}
const ok = (cond, msg) => {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
};

const employee = new Session();
console.log("STEP 0 — sign in");
await employee.signIn("standard.two@thirdbridge.com");

console.log("\nTEST 1 — desk search by number, across sites");
const sites = await employee.query("site.list");
const firstFloor = sites[0].floors[0];
const desks = await employee.query("desk.listForFloor", { floorId: firstFloor.id });
const sample = desks.find((d) => d.isActive) ?? desks[0];
const byNumber = await employee.query("search.global", { query: sample.number });
ok(
  byNumber.desks.some((d) => d.id === sample.id),
  `"${sample.number}" finds desk ${sample.number} on ${sites[0].name} / ${firstFloor.name}`,
);
ok(
  byNumber.desks.every((d) => d.floor?.site?.id),
  "every desk hit carries its site and floor for locating on the map",
);
const partial = await employee.query("search.global", { query: sample.number.slice(0, 2) });
ok(
  partial.desks.length >= 1 && partial.desks.length <= 8,
  `partial "${sample.number.slice(0, 2)}" returns a bounded list (${partial.desks.length})`,
);

console.log("\nTEST 2 — people search by name, as a standard user");
const people = await employee.query("search.global", { query: "riley" });
const riley = people.people.find((p) => p.email === "standard.one@thirdbridge.com");
ok(!!riley, `"riley" finds ${riley?.name} (${riley?.email})`);
ok(
  riley.department !== undefined && riley.title !== undefined,
  "hit includes department and title fields",
);
const nobody = await employee.query("search.global", { query: "zzzznobody" });
ok(
  nobody.people.length === 0 && nobody.desks.length === 0,
  "unknown text returns no desks and no people",
);

console.log("\nTEST 3 — person card: details plus current/next booking");
const card = await employee.query("search.person", { userId: riley.id });
ok(
  card.person.email === riley.email,
  `card shows ${card.person.name}: ${card.person.email}, ${card.person.department ?? "no dept"}, ${card.person.title ?? "no title"}`,
);
ok(
  "currentBooking" in card && "nextBooking" in card,
  `booking info present (now: ${card.currentBooking?.desk.number ?? "none"}, next: ${card.nextBooking?.desk.number ?? "none"})`,
);
if (card.nextBooking)
  ok(
    card.nextBooking.site.timeZone && card.nextBooking.floor.id,
    "next booking carries site/floor/desk for 'Locate'",
  );

console.log("\nTEST 4 — top bar (every app page) and Floor Map deep links render");
for (const path of ["/home", "/bookings", "/book"]) {
  const res = await employee.fetch(path);
  ok(res.status === 200, `GET ${path} (page with the top-bar search) renders (200)`);
}
const deskHit = byNumber.desks.find((d) => d.id === sample.id);
const deskLink = `/floor-map?${new URLSearchParams({ site: deskHit.floor.site.id, floor: deskHit.floor.id, desk: deskHit.id })}`;
ok(
  (await employee.fetch(deskLink)).status === 200,
  "GET /floor-map?site=&floor=&desk= (desk result deep link) renders (200)",
);
const page = await employee.fetch(`/floor-map?person=${riley.id}`);
ok(page.status === 200, "GET /floor-map?person=… renders (200)");

console.log("\nALL CHECKS PASSED");
