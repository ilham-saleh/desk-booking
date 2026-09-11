import { bookingRouter } from "@/server/api/routers/booking";
import { facilityRouter } from "@/server/api/routers/facility";
import { floorRouter } from "@/server/api/routers/floor";
import { healthRouter } from "@/server/api/routers/health";
import { siteRouter } from "@/server/api/routers/site";
import { userRouter } from "@/server/api/routers/user";
import { createTRPCRouter } from "@/server/api/trpc";

export const appRouter = createTRPCRouter({
  health: healthRouter,
  site: siteRouter,
  facility: facilityRouter,
  floor: floorRouter,
  booking: bookingRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
