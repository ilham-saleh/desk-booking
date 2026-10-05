import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// After `prisma generate`, HMR reloads this module with a new PrismaClient class
// but globalThis still holds an instance of the old one, which rejects fields
// added to the schema since. Only reuse the cached client if it's current.
const cached = globalForPrisma.prisma;
if (cached && !(cached instanceof PrismaClient)) void (cached as PrismaClient).$disconnect();
export const db = cached instanceof PrismaClient ? cached : createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
