import { createTRPCRouter, siteAdminProcedure } from "@/server/api/trpc";

export const userRouter = createTRPCRouter({
  /** Org-wide user directory (CLAUDE.md rule 10) — used to pick who a booking-on-behalf is for. */
  listActive: siteAdminProcedure.query(({ ctx }) =>
    ctx.db.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ),
});
