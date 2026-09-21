import "dotenv/config";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, Role } from "@/generated/prisma/client";
import { floorPlanKey, storage } from "@/server/storage";
import { renderPdfFirstPageToPng } from "@/server/storage/render-pdf";
import { FLOOR_LAYOUTS } from "./seed-data/floor-layouts";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const CUSTOMER_ZERO_SLUG = "customer-zero";
const CUSTOMER_ZERO_DOMAIN = "thirdbridge.com";

async function main() {
  const org = await db.organization.upsert({
    where: { slug: CUSTOMER_ZERO_SLUG },
    update: {},
    create: {
      name: "Customer Zero",
      slug: CUSTOMER_ZERO_SLUG,
      status: "ACTIVE",
      ssoGoogleDomains: [CUSTOMER_ZERO_DOMAIN],
    },
  });

  const platformAdminEmail = "platform-admin@deskbooking.internal";
  const existingPlatformAdmin = await db.user.findFirst({
    where: { organizationId: null, email: platformAdminEmail },
  });
  if (!existingPlatformAdmin) {
    await db.user.create({
      data: {
        organizationId: null,
        email: platformAdminEmail,
        name: "Platform Admin",
        role: Role.PLATFORM_ADMIN,
      },
    });
  }

  // Dev fixtures only. Profile fields (names, title, location) mimic what the
  // HRIS sync will provide; role/permissions are the app-owned part.
  const orgSuperAdmin = await db.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "ilhamsaleh.nabijonov@thirdbridge.com" } },
    update: { firstName: "Ilham", lastName: "Nabijonov", title: "Engineering Manager", location: "London" },
    create: {
      organizationId: org.id,
      email: "ilhamsaleh.nabijonov@thirdbridge.com",
      name: "Ilham Nabijonov",
      firstName: "Ilham",
      lastName: "Nabijonov",
      title: "Engineering Manager",
      location: "London",
      role: Role.ORG_SUPER_ADMIN,
    },
  });

  const siteAdmin = await db.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "site.admin@thirdbridge.com" } },
    update: { firstName: "Sam", lastName: "Site-Admin", title: "Facilities Coordinator", location: "London" },
    create: {
      organizationId: org.id,
      email: "site.admin@thirdbridge.com",
      name: "Sam Site-Admin",
      firstName: "Sam",
      lastName: "Site-Admin",
      title: "Facilities Coordinator",
      location: "London",
      role: Role.SITE_ADMIN,
      department: "Facilities",
    },
  });

  const bookingManager = await db.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "booking.manager@thirdbridge.com" } },
    update: { firstName: "Morgan", lastName: "Manager", title: "Team Assistant", location: "London" },
    create: {
      organizationId: org.id,
      email: "booking.manager@thirdbridge.com",
      name: "Morgan Manager",
      firstName: "Morgan",
      lastName: "Manager",
      title: "Team Assistant",
      location: "London",
      role: Role.BOOKING_MANAGER,
      department: "Operations",
    },
  });

  await db.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "standard.one@thirdbridge.com" } },
    update: { firstName: "Riley", lastName: "Employee", title: "Software Engineer", location: "London" },
    create: {
      organizationId: org.id,
      email: "standard.one@thirdbridge.com",
      name: "Riley Employee",
      firstName: "Riley",
      lastName: "Employee",
      title: "Software Engineer",
      location: "London",
      role: Role.STANDARD_USER,
      department: "Engineering",
    },
  });

  await db.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "standard.two@thirdbridge.com" } },
    update: { firstName: "Jordan", lastName: "Employee", title: "Account Executive", location: "New York" },
    create: {
      organizationId: org.id,
      email: "standard.two@thirdbridge.com",
      name: "Jordan Employee",
      firstName: "Jordan",
      lastName: "Employee",
      title: "Account Executive",
      location: "New York",
      role: Role.STANDARD_USER,
      department: "Sales",
    },
  });

  const site = await db.site.upsert({
    where: { id: (await db.site.findFirst({ where: { organizationId: org.id, name: "HQ" } }))?.id ?? "nonexistent" },
    update: {
      city: "London",
      country: "United Kingdom",
      description: "Headquarters",
      timeZone: "Europe/London",
      allowEmployeeSeeBookings: true,
    },
    create: {
      organizationId: org.id,
      name: "HQ",
      address: "1 Example Street, London",
      city: "London",
      country: "United Kingdom",
      description: "Headquarters",
      timeZone: "Europe/London",
      operatingHoursStart: 420, // 07:00
      operatingHoursEnd: 1080, // 18:00
    },
  });

  // A second site so site-scoped permissions have something to be scoped against.
  const secondSite =
    (await db.site.findFirst({ where: { organizationId: org.id, name: "New York" } })) ??
    (await db.site.create({
      data: {
        organizationId: org.id,
        name: "New York",
        address: "100 Example Avenue, New York",
        city: "New York",
        country: "United States",
        description: "US office",
        timeZone: "America/New_York",
        operatingHoursStart: 420,
        operatingHoursEnd: 1080,
      },
    }));

  await db.permission.upsert({
    where: { userId_siteId: { userId: siteAdmin.id, siteId: site.id } },
    update: { type: "FACILITY_ADMIN" },
    create: { organizationId: org.id, userId: siteAdmin.id, siteId: site.id, type: "FACILITY_ADMIN" },
  });
  await db.permission.upsert({
    where: { userId_siteId: { userId: bookingManager.id, siteId: site.id } },
    update: { type: "BOOK_FOR_OTHERS" },
    create: { organizationId: org.id, userId: bookingManager.id, siteId: site.id, type: "BOOK_FOR_OTHERS" },
  });

  const floors = await seedFloorPlans(org.id, site.id, orgSuperAdmin.id);

  await seedDepartmentsAndRestrictions(org.id);
  await seedAvailabilityShifts(org.id);
  await seedOperatingHours(site.id, org.id);
  await seedOperatingHours(secondSite.id, org.id);

  console.log("Seeded customer-zero:", {
    organization: org.slug,
    orgSuperAdmin: orgSuperAdmin.email,
    siteAdmin: siteAdmin.email,
    site: site.name,
    floors: floors.map((f) => f.name),
  });
}

/**
 * Seeds the three real floor plans (docs/floorplans/Floor-{2,4,5}.pdf) as
 * rasterized, published floor-map backgrounds with placed desks/rooms/
 * utilities — see prisma/seed-data/floor-layouts.ts for the placement data
 * and its accuracy caveats. Idempotent: skips rendering/uploading for a
 * floor that already has a live plan version.
 */
async function seedFloorPlans(organizationId: string, siteId: string, createdById: string) {
  const floors = [];

  for (const layout of FLOOR_LAYOUTS) {
    const floor =
      (await db.floor.findFirst({ where: { organizationId, siteId, name: layout.floorName } })) ??
      (await db.floor.create({
        data: { organizationId, siteId, name: layout.floorName, sortOrder: layout.sortOrder },
      }));

    if (!floor.livePlanVersionId) {
      const pdfBytes = await readFile(join(process.cwd(), "docs/floorplans", `${layout.pdfBaseName}.pdf`));
      const { png, width, height } = await renderPdfFirstPageToPng(new Uint8Array(pdfBytes));

      const version = await db.floorPlanVersion.create({
        data: { organizationId, floorId: floor.id, status: "DRAFT", sourceFileKey: "", createdById },
      });
      const sourceFileKey = floorPlanKey(organizationId, floor.id, version.id, "pdf");
      const renderedImageKey = floorPlanKey(organizationId, floor.id, version.id, "png");
      await storage.putObject(sourceFileKey, pdfBytes, "application/pdf");
      await storage.putObject(renderedImageKey, png, "image/png");
      await db.floorPlanVersion.update({
        where: { id: version.id },
        data: {
          status: "LIVE",
          sourceFileKey,
          renderedImageKey,
          imageWidth: width,
          imageHeight: height,
          publishedAt: new Date(),
        },
      });
      await db.floor.update({ where: { id: floor.id }, data: { livePlanVersionId: version.id } });
    }

    for (const desk of layout.desks) {
      await db.desk.upsert({
        where: { floorId_number: { floorId: floor.id, number: desk.number } },
        update: {},
        create: {
          organizationId,
          floorId: floor.id,
          number: desk.number,
          x: desk.x,
          y: desk.y,
          requiresCheckIn: desk.requiresCheckIn ?? false,
        },
      });
    }

    for (const room of layout.rooms) {
      const existing = await db.room.findFirst({ where: { floorId: floor.id, name: room.name } });
      if (!existing) {
        await db.room.create({
          data: { organizationId, floorId: floor.id, name: room.name, x: room.x, y: room.y, width: room.width, height: room.height },
        });
      }
    }

    for (const utility of layout.utilities) {
      const existing = await db.utility.findFirst({
        where: { floorId: floor.id, type: utility.type, label: utility.label ?? null },
      });
      if (!existing) {
        await db.utility.create({
          data: { organizationId, floorId: floor.id, type: utility.type, label: utility.label, x: utility.x, y: utility.y },
        });
      }
    }

    floors.push(floor);
  }

  return floors;
}

/**
 * Seeds departments and booking restrictions for the org.
 */
async function seedDepartmentsAndRestrictions(organizationId: string) {
  const departments = ["Engineering", "Sales", "Editorial", "Finance", "Operations"];

  for (const name of departments) {
    await db.department.upsert({
      where: { organizationId_name: { organizationId, name } },
      update: {},
      create: { organizationId, name },
    });
  }

  // Create sample restrictions
  const engineeringDept = await db.department.findUnique({
    where: { organizationId_name: { organizationId, name: "Engineering" } },
  });
  const salesDept = await db.department.findUnique({
    where: { organizationId_name: { organizationId, name: "Sales" } },
  });

  if (engineeringDept && salesDept) {
    // "Engineering Only" restriction
    await db.bookingRestriction.upsert({
      where: { organizationId_name: { organizationId, name: "Engineering Only" } },
      update: { color: "#2563eb" },
      create: {
        organizationId,
        name: "Engineering Only",
        color: "#2563eb",
        rules: {
          create: [{ fieldType: "DEPARTMENT", operator: "IS_ANY_OF", value: [engineeringDept.name], connector: "OR", sortOrder: 0 }],
        },
      },
    });

    // "Sales Team" restriction
    await db.bookingRestriction.upsert({
      where: { organizationId_name: { organizationId, name: "Sales Team" } },
      update: { color: "#dc2626" },
      create: {
        organizationId,
        name: "Sales Team",
        color: "#dc2626",
        rules: {
          create: [{ fieldType: "DEPARTMENT", operator: "IS_ANY_OF", value: [salesDept.name], connector: "OR", sortOrder: 0 }],
        },
      },
    });
  }
}

/**
 * Seeds the reusable availability shifts (named weekday sets) and gives the
 * first few desks a "different restriction on different days" configuration
 * so the Editing Platform / Floor Map have something to show.
 */
async function seedAvailabilityShifts(organizationId: string) {
  const shiftSeeds: Array<{ name: string; daysOfWeek: number[] }> = [
    { name: "Mon–Fri", daysOfWeek: [1, 2, 3, 4, 5] },
    { name: "Monday Only", daysOfWeek: [1] },
    { name: "Tuesday Only", daysOfWeek: [2] },
    { name: "Wednesday Only", daysOfWeek: [3] },
    { name: "Thursday Only", daysOfWeek: [4] },
    { name: "Friday Only", daysOfWeek: [5] },
    { name: "Mon + Fri", daysOfWeek: [1, 5] },
    { name: "Mon & Wed", daysOfWeek: [1, 3] },
    { name: "Tue & Thu", daysOfWeek: [2, 4] },
    { name: "Mon through Thu", daysOfWeek: [1, 2, 3, 4] },
  ];

  const shifts = new Map<string, string>();
  for (const seed of shiftSeeds) {
    const shift = await db.availabilityShift.upsert({
      where: { organizationId_name: { organizationId, name: seed.name } },
      update: { daysOfWeek: seed.daysOfWeek, isActive: true },
      create: { organizationId, name: seed.name, daysOfWeek: seed.daysOfWeek },
    });
    shifts.set(seed.name, shift.id);
  }

  const engineering = await db.bookingRestriction.findUnique({
    where: { organizationId_name: { organizationId, name: "Engineering Only" } },
  });
  const sales = await db.bookingRestriction.findUnique({
    where: { organizationId_name: { organizationId, name: "Sales Team" } },
  });

  // Only touch desks that have no restriction blocks yet — never overwrite admin edits.
  const desks = await db.desk.findMany({
    where: { organizationId, archivedAt: null, restrictionAssignments: { none: {} } },
    orderBy: { number: "asc" },
    take: 3,
  });

  for (const [index, desk] of desks.entries()) {
    const blocks =
      index === 0 && engineering && sales
        ? [
            { restrictionMode: "ANYONE" as const, restrictionId: null, shiftId: shifts.get("Mon + Fri")! },
            { restrictionMode: "ANYONE" as const, restrictionId: null, shiftId: shifts.get("Tuesday Only")! },
            { restrictionMode: "CUSTOM" as const, restrictionId: engineering.id, shiftId: shifts.get("Wednesday Only")! },
            { restrictionMode: "CUSTOM" as const, restrictionId: sales.id, shiftId: shifts.get("Thursday Only")! },
          ]
        : [{ restrictionMode: "ANYONE" as const, restrictionId: null, shiftId: shifts.get("Mon–Fri")!, advanceBookingWindowDays: 30 }];

    await db.deskRestrictionAssignment.createMany({
      data: blocks.map((block, sortOrder) => ({ organizationId, deskId: desk.id, sortOrder, ...block })),
    });
  }
}

/**
 * Seeds site operating hours (per-day configuration).
 */
async function seedOperatingHours(siteId: string, organizationId: string) {
  const weekdayHours = [
    { dayOfWeek: 1, openAtMinutes: 420, closeAtMinutes: 1080 }, // Mon 7-18
    { dayOfWeek: 2, openAtMinutes: 420, closeAtMinutes: 1080 }, // Tue 7-18
    { dayOfWeek: 3, openAtMinutes: 420, closeAtMinutes: 1080 }, // Wed 7-18
    { dayOfWeek: 4, openAtMinutes: 420, closeAtMinutes: 1080 }, // Thu 7-18
    { dayOfWeek: 5, openAtMinutes: 420, closeAtMinutes: 1080 }, // Fri 7-18
  ];

  for (const { dayOfWeek, openAtMinutes, closeAtMinutes } of weekdayHours) {
    await db.siteOperatingHours.upsert({
      where: { siteId_dayOfWeek: { siteId, dayOfWeek } },
      update: { openAtMinutes, closeAtMinutes },
      create: { organizationId, siteId, dayOfWeek, openAtMinutes, closeAtMinutes },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
