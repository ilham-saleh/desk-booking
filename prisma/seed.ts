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

  const orgSuperAdmin = await db.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "ilhamsaleh.nabijonov@thirdbridge.com" } },
    update: {},
    create: {
      organizationId: org.id,
      email: "ilhamsaleh.nabijonov@thirdbridge.com",
      name: "Ilham Nabijonov",
      role: Role.ORG_SUPER_ADMIN,
    },
  });

  const siteAdmin = await db.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "site.admin@thirdbridge.com" } },
    update: {},
    create: {
      organizationId: org.id,
      email: "site.admin@thirdbridge.com",
      name: "Sam Site-Admin",
      role: Role.SITE_ADMIN,
      department: "Facilities",
    },
  });

  await db.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "standard.one@thirdbridge.com" } },
    update: {},
    create: {
      organizationId: org.id,
      email: "standard.one@thirdbridge.com",
      name: "Riley Employee",
      role: Role.STANDARD_USER,
      department: "Engineering",
    },
  });

  await db.user.upsert({
    where: { organizationId_email: { organizationId: org.id, email: "standard.two@thirdbridge.com" } },
    update: {},
    create: {
      organizationId: org.id,
      email: "standard.two@thirdbridge.com",
      name: "Jordan Employee",
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

  await db.permission.upsert({
    where: { userId_siteId: { userId: siteAdmin.id, siteId: site.id } },
    update: {},
    create: {
      organizationId: org.id,
      userId: siteAdmin.id,
      siteId: site.id,
    },
  });

  const floors = await seedFloorPlans(org.id, site.id, orgSuperAdmin.id);

  await seedDepartmentsAndRestrictions(org.id);
  await seedAvailabilityShifts(org.id);
  await seedOperatingHours(site.id, org.id);

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
      update: {},
      create: {
        organizationId,
        name: "Engineering Only",
        rules: {
          create: [
            {
              fieldType: "DEPARTMENT",
              operator: "IS_ANY_OF",
              value: [engineeringDept.name],
            },
          ],
        },
      },
    });

    // "Sales Team" restriction
    await db.bookingRestriction.upsert({
      where: { organizationId_name: { organizationId, name: "Sales Team" } },
      update: {},
      create: {
        organizationId,
        name: "Sales Team",
        rules: {
          create: [
            {
              fieldType: "DEPARTMENT",
              operator: "IS_ANY_OF",
              value: [salesDept.name],
            },
          ],
        },
      },
    });

    // "Anyone" restriction (no rules = open to all)
    await db.bookingRestriction.upsert({
      where: { organizationId_name: { organizationId, name: "Anyone" } },
      update: {},
      create: {
        organizationId,
        name: "Anyone",
      },
    });
  }
}

/**
 * Seeds availability shifts for desks (e.g., desk is available Mon-Fri to all employees).
 */
async function seedAvailabilityShifts(organizationId: string) {
  const desks = await db.desk.findMany({ where: { organizationId } });

  const anyoneRestriction = await db.bookingRestriction.findFirst({
    where: { organizationId, name: "Anyone" },
  });

  if (!anyoneRestriction) return;

  // For now, create a simple "Weekday 9-5" shift for all desks (skip if already exists)
  for (const desk of desks.slice(0, 5)) {
    const existing = await db.availabilityShift.findFirst({
      where: { deskId: desk.id, name: "Weekday 9-5" },
    });

    if (!existing) {
      await db.availabilityShift.create({
        data: {
          organizationId,
          deskId: desk.id,
          restrictionId: anyoneRestriction.id,
          name: "Weekday 9-5",
          daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
          advanceBookingWindowDays: 30,
          startTimeMinutes: 540, // 9:00
          endTimeMinutes: 1020, // 17:00
        },
      });
    }
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
