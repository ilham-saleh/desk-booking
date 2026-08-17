import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient, Role } from "@/generated/prisma/client";

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

  console.log("Seeded customer-zero:", {
    organization: org.slug,
    orgSuperAdmin: orgSuperAdmin.email,
    siteAdmin: siteAdmin.email,
    site: site.name,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
