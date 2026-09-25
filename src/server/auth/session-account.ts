import "server-only";

import type { PrismaClient } from "@/generated/prisma/client";
import type { ScopedDb } from "@/server/tenancy";

/**
 * Sessions are stateless JWTs, so a token stays syntactically valid after its
 * user row is deactivated — or deleted outright (e.g. a dev database re-seeded
 * with fresh IDs). This is the one place that decides whether a session still
 * refers to a usable account; the tRPC `orgProcedure` middleware and the app
 * layout both rely on it so they can never disagree.
 *
 * Takes the client from the caller (raw for the app shell, org-scoped inside
 * tRPC — which additionally enforces that the row belongs to the session's
 * organization) so tests can point it at DATABASE_URL_TEST.
 */
export async function isSessionAccountActive(db: PrismaClient | ScopedDb, userId: string): Promise<boolean> {
  const account = await db.user.findUnique({ where: { id: userId }, select: { isActive: true } });
  return account?.isActive === true;
}
