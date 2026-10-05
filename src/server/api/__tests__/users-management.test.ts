import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PermissionType, PrismaClient, Role } from "@/generated/prisma/client";
import { appRouter } from "@/server/api/root";

/**
 * Users management acceptance tests (tasks/users-management.md §36) through
 * the real tRPC routers against DATABASE_URL_TEST:
 *  - only admins reach the Users area; Booking Managers / Standard Users are refused
 *  - Facility Admin scope: can't touch other-site users, System Admins, themselves,
 *    can't assign System Admin, can't grant sites they don't manage
 *  - directory search / role filter / pagination / sort by role
 *  - Save User changes only the role (profile is Entra-owned); role change drops
 *    permissions the new role can't use; System Admin demotion is audited
 *  - Booking Manager permissions: initial empty state, add selected, remove
 *  - canBookForUser: BM books for others only at granted sites; standard user never
 *  - bulk removal deactivates safely, keeps bookings, blocks the removed user
 */

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL_TEST is not set — see .env.example");
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

type SessionUser = { id: string; name: string; email: string; role: Role; organizationId: string | null };
const callerFor = (user: SessionUser) => appRouter.createCaller({ db, headers: new Headers(), session: { user } });

function nextDateFor(dayOfWeek: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 2);
  while (date.getUTCDay() !== dayOfWeek) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const SLUG = "users-mgmt-test";

let org: { id: string };
let london: { id: string; name: string };
let newYork: { id: string; name: string };
let londonDesk: { id: string };
let newYorkDesk: { id: string };
let systemAdmin: SessionUser;
let londonAdmin: SessionUser;
let newYorkAdmin: SessionUser;
let bookingManager: SessionUser;
let employee: SessionUser;
let employeeTwo: SessionUser;

async function cleanup() {
  const existing = await db.organization.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!existing) return;
  const where = { organizationId: existing.id };
  await db.auditLog.deleteMany({ where });
  await db.booking.deleteMany({ where });
  await db.desk.deleteMany({ where });
  await db.permission.deleteMany({ where });
  await db.floor.deleteMany({ where });
  await db.site.deleteMany({ where });
  await db.user.deleteMany({ where });
  await db.organization.delete({ where: { id: existing.id } });
}

async function mk(email: string, firstName: string, lastName: string, role: Role, extra: { title?: string; department?: string; location?: string } = {}) {
  const row = await db.user.create({
    data: { organizationId: org.id, email, name: `${firstName} ${lastName}`, firstName, lastName, role, ...extra },
  });
  return { id: row.id, name: row.name, email: row.email, role: row.role, organizationId: org.id } satisfies SessionUser;
}

async function grant(userId: string, siteId: string, type: PermissionType) {
  await db.permission.create({ data: { organizationId: org.id, userId, siteId, type } });
}

/** Session objects are snapshots — reload role after a save so the caller reflects the persisted role. */
async function refreshed(user: SessionUser): Promise<SessionUser> {
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return { ...user, role: row.role, name: row.name, email: row.email };
}

describe("users management", () => {
  beforeAll(async () => {
    await cleanup();
    org = await db.organization.create({ data: { name: "Users Mgmt", slug: SLUG } });
    london = await db.site.create({ data: { organizationId: org.id, name: "London - Steward Building", timeZone: "Europe/London", operatingHoursStart: 420, operatingHoursEnd: 1140 } });
    newYork = await db.site.create({ data: { organizationId: org.id, name: "New York", timeZone: "America/New_York", operatingHoursStart: 420, operatingHoursEnd: 1140 } });
    const londonFloor = await db.floor.create({ data: { organizationId: org.id, siteId: london.id, name: "Level 2" } });
    const newYorkFloor = await db.floor.create({ data: { organizationId: org.id, siteId: newYork.id, name: "NY 1" } });
    londonDesk = await db.desk.create({ data: { organizationId: org.id, floorId: londonFloor.id, number: "2.01", x: 10, y: 10 } });
    newYorkDesk = await db.desk.create({ data: { organizationId: org.id, floorId: newYorkFloor.id, number: "NY.01", x: 10, y: 10 } });

    systemAdmin = await mk("sys@um.test", "Andreya", "Patterson", Role.ORG_SUPER_ADMIN, { title: "Head of Workplace" });
    londonAdmin = await mk("london.admin@um.test", "Sarah", "Smith", Role.SITE_ADMIN, { title: "Manager", department: "Technology" });
    newYorkAdmin = await mk("ny.admin@um.test", "Nate", "York", Role.SITE_ADMIN);
    bookingManager = await mk("alex.hudson@um.test", "Alex", "Hudson", Role.BOOKING_MANAGER, { title: "Associate", department: "Consulting" });
    employee = await mk("john.brown@um.test", "John", "Brown", Role.STANDARD_USER, { title: "Analyst", department: "Finance", location: "London" });
    employeeTwo = await mk("james.lee@um.test", "James", "Lee", Role.STANDARD_USER, { department: "Finance" });
    await grant(londonAdmin.id, london.id, PermissionType.FACILITY_ADMIN);
    await grant(newYorkAdmin.id, newYork.id, PermissionType.FACILITY_ADMIN);
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  // ----- Access to the Users area -----

  it("refuses the Users directory to Booking Managers and Standard Users", async () => {
    await expect(callerFor(bookingManager).user.listDirectory({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(employee).user.listDirectory({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(employee).user.get({ userId: bookingManager.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(callerFor(bookingManager).user.save({ userId: employee.id, role: Role.STANDARD_USER })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ----- Directory: columns, search, filter, pagination, sort -----

  it("lists users with the table columns and a readable permission summary", async () => {
    const page = await callerFor(systemAdmin).user.listDirectory({});
    const alex = page.items.find((row) => row.id === bookingManager.id)!;
    expect(alex).toMatchObject({ name: "Alex Hudson", email: "alex.hudson@um.test", title: "Associate", department: "Consulting", roleLabel: "Booking Manager" });
    expect(alex.permissionSummary).toBe("No booking permissions");
    expect(page.items.find((row) => row.id === systemAdmin.id)!.permissionSummary).toBe("All sites and floors");
    expect(page.items.find((row) => row.id === londonAdmin.id)!.permissionSummary).toBe("Manages: London - Steward Building");
    expect(page.items.find((row) => row.id === employee.id)!.permissionSummary).toBe("Standard booking access");
  });

  it("searches by first name, last name, full name and email", async () => {
    const admin = callerFor(systemAdmin);
    expect((await admin.user.listDirectory({ search: "alex" })).items.map((row) => row.email)).toEqual(["alex.hudson@um.test"]);
    expect((await admin.user.listDirectory({ search: "Hudson" })).items.map((row) => row.email)).toEqual(["alex.hudson@um.test"]);
    expect((await admin.user.listDirectory({ search: "Alex Hudson" })).items.map((row) => row.email)).toEqual(["alex.hudson@um.test"]);
    expect((await admin.user.listDirectory({ search: "john.brown@" })).items.map((row) => row.name)).toEqual(["John Brown"]);
  });

  it("filters by role and paginates", async () => {
    const admin = callerFor(systemAdmin);
    const managers = await admin.user.listDirectory({ role: Role.BOOKING_MANAGER });
    expect(managers.items.map((row) => row.role)).toEqual([Role.BOOKING_MANAGER]);

    const firstPage = await admin.user.listDirectory({ pageSize: 5, page: 1 });
    const secondPage = await admin.user.listDirectory({ pageSize: 5, page: 2 });
    expect(firstPage.total).toBe(6);
    expect(firstPage.pageCount).toBe(2);
    expect(firstPage.items).toHaveLength(5);
    expect(secondPage.items).toHaveLength(1);
    expect(new Set([...firstPage.items, ...secondPage.items].map((row) => row.id)).size).toBe(6);
  });

  it("sorts by role, broadest access first", async () => {
    const page = await callerFor(systemAdmin).user.listDirectory({ sortBy: "role", sortDir: "asc" });
    const roles = page.items.map((row) => row.role);
    expect(roles[0]).toBe(Role.ORG_SUPER_ADMIN);
    expect(roles.at(-1)).toBe(Role.STANDARD_USER);
    expect(roles.indexOf(Role.SITE_ADMIN)).toBeLessThan(roles.indexOf(Role.BOOKING_MANAGER));
  });

  // ----- Facility Admin scope -----

  it("shows a Facility Admin only users inside their site scope", async () => {
    const page = await callerFor(londonAdmin).user.listDirectory({});
    const ids = new Set(page.items.map((row) => row.id));
    expect(ids.has(systemAdmin.id)).toBe(false); // never System Admins
    expect(ids.has(londonAdmin.id)).toBe(false); // never themselves
    expect(ids.has(newYorkAdmin.id)).toBe(false); // scoped to another site
    expect(ids.has(bookingManager.id)).toBe(true); // unscoped → in scope
    expect(ids.has(employee.id)).toBe(true);
  });

  it("stops a Facility Admin managing another site's admin, a System Admin, or themselves", async () => {
    const caller = callerFor(londonAdmin);
    await expect(caller.user.get({ userId: newYorkAdmin.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.user.get({ userId: systemAdmin.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.user.save({ userId: londonAdmin.id, role: Role.ORG_SUPER_ADMIN })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.user.addSitePermissions({ userId: londonAdmin.id, siteIds: [newYork.id] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stops a Facility Admin creating a System Admin or granting a site they don't manage", async () => {
    const caller = callerFor(londonAdmin);
    await expect(caller.user.save({ userId: employee.id, role: Role.ORG_SUPER_ADMIN })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await caller.user.save({ userId: employeeTwo.id, role: Role.BOOKING_MANAGER });
    await expect(caller.user.addSitePermissions({ userId: employeeTwo.id, siteIds: [newYork.id] })).rejects.toThrow(/don't manage New York/);
    const detail = await caller.user.get({ userId: employeeTwo.id });
    expect(detail.availableSites.map((site) => site.id)).toEqual([london.id]); // only their own site is offered
    await caller.user.addSitePermissions({ userId: employeeTwo.id, siteIds: [london.id] });
    expect((await caller.user.get({ userId: employeeTwo.id })).permissions.map((permission) => permission.siteName)).toEqual(["London - Steward Building"]);
  });

  // ----- User Details: save role (profile fields are Entra-owned) -----

  it("Save User changes only the role and never writes Entra-owned profile fields", async () => {
    const admin = callerFor(systemAdmin);
    // Profile keys aren't in the input schema, so they are stripped rather than written.
    const input = { userId: employee.id, firstName: "Jonathan", email: bookingManager.email, location: "New York", role: Role.STANDARD_USER };
    await admin.user.save(input);
    const detail = await admin.user.get({ userId: employee.id });
    expect(detail).toMatchObject({ firstName: "John", lastName: "Brown", email: employee.email, title: "Analyst", department: "Finance", location: "London" });
  });

  it("assigning System Admin grants every site without permission rows", async () => {
    const admin = callerFor(systemAdmin);
    await admin.user.save({ userId: employeeTwo.id, role: Role.ORG_SUPER_ADMIN });
    const detail = await admin.user.get({ userId: employeeTwo.id });
    expect(detail.role).toBe(Role.ORG_SUPER_ADMIN);
    expect(detail.permissionSummary).toBe("All sites and floors");
    expect(detail.permissions).toEqual([]); // the London BOOK_FOR_OTHERS row was dropped, not kept hidden
    expect(await db.permission.count({ where: { userId: employeeTwo.id } })).toBe(0);
    employeeTwo = await refreshed(employeeTwo);
    // …and admin functionality works globally
    expect((await callerFor(employeeTwo).facility.list()).map((site) => site.id).sort()).toEqual([london.id, newYork.id].sort());
    await expect(callerFor(employeeTwo).desk.moveDesk({ deskId: newYorkDesk.id, x: 11, y: 11 })).resolves.toBeTruthy();
  });

  it("demoting a System Admin removes global access and is audited", async () => {
    const admin = callerFor(systemAdmin);
    await admin.user.save({ userId: employeeTwo.id, role: Role.STANDARD_USER });
    employeeTwo = await refreshed(employeeTwo);
    await expect(callerFor(employeeTwo).user.listDirectory({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    const audit = await db.auditLog.findFirst({ where: { organizationId: org.id, action: "user.roleChanged", targetId: employeeTwo.id }, orderBy: { createdAt: "desc" } });
    expect(audit?.after).toMatchObject({ role: Role.STANDARD_USER });
  });

  it("Facility Admin gets a managed site and can manage only that site", async () => {
    const admin = callerFor(systemAdmin);
    await admin.user.save({ userId: employeeTwo.id, role: Role.SITE_ADMIN });
    employeeTwo = await refreshed(employeeTwo);
    let detail = await admin.user.get({ userId: employeeTwo.id });
    expect(detail.permissionSummary).toBe("No site assigned");
    await admin.user.addSitePermissions({ userId: employeeTwo.id, siteIds: [london.id] });
    detail = await admin.user.get({ userId: employeeTwo.id });
    expect(detail.permissions.map((permission) => permission.type)).toEqual([PermissionType.FACILITY_ADMIN]);

    const asFacilityAdmin = callerFor(employeeTwo);
    await expect(asFacilityAdmin.desk.moveDesk({ deskId: londonDesk.id, x: 12, y: 12 })).resolves.toBeTruthy();
    await expect(asFacilityAdmin.desk.moveDesk({ deskId: newYorkDesk.id, x: 12, y: 12 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await asFacilityAdmin.facility.list()).map((site) => site.id)).toEqual([london.id]);
  });

  it("Facility Admin → Standard User leaves no hidden admin access behind", async () => {
    const admin = callerFor(systemAdmin);
    const result = await admin.user.save({ userId: employeeTwo.id, role: Role.STANDARD_USER });
    expect(result.removedPermissionCount).toBe(1);
    expect(await db.permission.count({ where: { userId: employeeTwo.id } })).toBe(0);
    employeeTwo = await refreshed(employeeTwo);
    await expect(callerFor(employeeTwo).desk.moveDesk({ deskId: londonDesk.id, x: 1, y: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  // ----- Booking Manager permissions and delegated booking -----

  it("a new Booking Manager starts with no 'book for others' sites and cannot book for others", async () => {
    const detail = await callerFor(systemAdmin).user.get({ userId: bookingManager.id });
    expect(detail.permissions).toEqual([]);
    expect(detail.permissionSummary).toBe("No booking permissions");
    expect(detail.availableSites.map((site) => site.id).sort()).toEqual([london.id, newYork.id].sort());

    await expect(
      callerFor(bookingManager).booking.create({ deskId: londonDesk.id, date: nextDateFor(2), startMinutes: 540, endMinutes: 600, forUserId: employee.id }),
    ).rejects.toThrow(/permission to book on behalf of others at London/);
  });

  it("Add Selected grants multiple sites; the Booking Manager may then book for others there", async () => {
    const admin = callerFor(systemAdmin);
    await admin.user.addSitePermissions({ userId: bookingManager.id, siteIds: [london.id, newYork.id] });
    const detail = await admin.user.get({ userId: bookingManager.id });
    expect(detail.permissions.map((permission) => permission.siteName).sort()).toEqual(["London - Steward Building", "New York"]);
    expect(detail.permissionSummary).toBe("Book for others: London - Steward Building, New York");

    const booking = await callerFor(bookingManager).booking.create({ deskId: londonDesk.id, date: nextDateFor(2), startMinutes: 540, endMinutes: 600, forUserId: employee.id });
    expect(booking.userId).toBe(employee.id); // occupant
    expect(booking.bookedById).toBe(bookingManager.id); // creator
  });

  it("removing a site permission immediately stops delegated booking there", async () => {
    const admin = callerFor(systemAdmin);
    await admin.user.removeSitePermission({ userId: bookingManager.id, siteId: newYork.id });
    const detail = await admin.user.get({ userId: bookingManager.id });
    expect(detail.permissions.map((permission) => permission.siteName)).toEqual(["London - Steward Building"]);

    await expect(
      callerFor(bookingManager).booking.create({ deskId: newYorkDesk.id, date: nextDateFor(3), startMinutes: 540, endMinutes: 600, forUserId: employee.id }),
    ).rejects.toThrow(/permission to book on behalf of others at New York/);
    // guests are "others" too
    await expect(
      callerFor(bookingManager).booking.create({ deskId: newYorkDesk.id, date: nextDateFor(3), startMinutes: 540, endMinutes: 600, guestName: "Visitor" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // self-booking anywhere still fine
    await expect(callerFor(bookingManager).booking.create({ deskId: newYorkDesk.id, date: nextDateFor(3), startMinutes: 540, endMinutes: 600 })).resolves.toMatchObject({ userId: bookingManager.id });
  });

  it("a Booking Manager cannot manage users, desks or sites", async () => {
    const caller = callerFor(bookingManager);
    await expect(caller.user.listDirectory({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.user.addSitePermissions({ userId: bookingManager.id, siteIds: [newYork.id] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.desk.moveDesk({ deskId: londonDesk.id, x: 1, y: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.facility.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a Standard User can never book for someone else", async () => {
    await expect(
      callerFor(employee).booking.create({ deskId: londonDesk.id, date: nextDateFor(4), startMinutes: 540, endMinutes: 600, forUserId: bookingManager.id }),
    ).rejects.toThrow(/only book a desk for yourself/);
  });

  it("Standard Users and System Admins don't take site permissions", async () => {
    await expect(callerFor(systemAdmin).user.addSitePermissions({ userId: employee.id, siteIds: [london.id] })).rejects.toThrow(/don't take site permissions/);
  });

  // ----- Edit Users mode: bulk removal -----

  it("bulk removal deactivates users, keeps their bookings, and blocks them from the system", async () => {
    const admin = callerFor(systemAdmin);
    const bookingsBefore = await db.booking.count({ where: { userId: employee.id } });
    expect(bookingsBefore).toBeGreaterThan(0);

    await expect(admin.user.deactivateMany({ userIds: [systemAdmin.id] })).rejects.toThrow(/own account/);
    const result = await admin.user.deactivateMany({ userIds: [employee.id, bookingManager.id] });
    expect(result.deactivated).toBe(2);

    expect(await db.booking.count({ where: { userId: employee.id } })).toBe(bookingsBefore);
    expect((await db.user.findUniqueOrThrow({ where: { id: employee.id } })).isActive).toBe(false);

    // Hidden by default, visible under the Inactive filter
    expect((await admin.user.listDirectory({})).items.some((row) => row.id === employee.id)).toBe(false);
    expect((await admin.user.listDirectory({ status: "inactive" })).items.map((row) => row.id).sort()).toEqual([employee.id, bookingManager.id].sort());

    // A still-valid session for a removed user is refused on the next call
    await expect(callerFor(employee).booking.listMine({ when: "upcoming" })).rejects.toThrow(/no longer has access/);

    await admin.user.reactivate({ userId: employee.id });
    await expect(callerFor(employee).booking.listMine({ when: "upcoming" })).resolves.toBeTruthy();
  });

  it("a Facility Admin cannot remove users outside their scope", async () => {
    await expect(callerFor(londonAdmin).user.deactivateMany({ userIds: [newYorkAdmin.id] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
