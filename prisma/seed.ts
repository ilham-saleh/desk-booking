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

  const site =
    (await db.site.findFirst({ where: { organizationId: org.id, name: "HQ" } })) ??
    (await db.site.create({
      data: {
        organizationId: org.id,
        name: "HQ",
        address: "1 Example Street, London",
        timeZone: "Europe/London",
        operatingHoursStart: 420, // 07:00
        operatingHoursEnd: 1080, // 18:00
      },
    }));

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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
