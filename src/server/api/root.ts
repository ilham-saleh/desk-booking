import "server-only";

import { bookingRouter } from "@/server/api/routers/booking";
import { deskRouter } from "@/server/api/routers/desk";
import { facilityRouter } from "@/server/api/routers/facility";
import { floorRouter } from "@/server/api/routers/floor";
import { healthRouter } from "@/server/api/routers/health";
import { restrictionRouter } from "@/server/api/routers/restriction";
import { shiftRouter } from "@/server/api/routers/shift";
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
  restriction: restrictionRouter,
  shift: shiftRouter,
  desk: deskRouter,
});

export type AppRouter = typeof appRouter;
