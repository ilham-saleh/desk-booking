import { healthRouter } from "@/server/api/routers/health";
import { createTRPCRouter } from "@/server/api/trpc";

export const appRouter = createTRPCRouter({
  health: healthRouter,
});

export type AppRouter = typeof appRouter;
