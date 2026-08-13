import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const healthRouter = createTRPCRouter({
  ping: publicProcedure.query(() => ({
    status: "ok" as const,
    timestamp: new Date(),
  })),
});
