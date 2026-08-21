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

/**
 * Direct server-side caller for use in Server Components — no HTTP round
 * trip. Passes the context *function* (React-cache-memoized per request),
 * not an awaited context object — the latter would resolve once at module
 * load and bind every subsequent request, regardless of caller, to whichever
 * session happened to be active first.
 */
export const api = appRouter.createCaller(createContext);
