import "server-only";

import { bookingRouter } from "@/server/api/routers/booking";
import { deskRouter } from "@/server/api/routers/desk";
import { deskWatchRouter } from "@/server/api/routers/desk-watch";
import { facilityRouter } from "@/server/api/routers/facility";
import { floorRouter } from "@/server/api/routers/floor";
import { healthRouter } from "@/server/api/routers/health";
import { neighbourhoodRouter } from "@/server/api/routers/neighbourhood";
import { notificationRouter } from "@/server/api/routers/notification";
import { restrictionRouter } from "@/server/api/routers/restriction";
import { searchRouter } from "@/server/api/routers/search";
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
  neighbourhood: neighbourhoodRouter,
  search: searchRouter,
  deskWatch: deskWatchRouter,
  notification: notificationRouter,
});

export type AppRouter = typeof appRouter;
