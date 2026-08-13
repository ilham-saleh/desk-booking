import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

const createContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  return createTRPCContext({ headers: heads });
});

/** Direct server-side caller for use in Server Components — no HTTP round trip. */
export const api = appRouter.createCaller(await createContext());
