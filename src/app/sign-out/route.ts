import type { NextRequest } from "next/server";

import { signOut } from "@/server/auth";

const REASONS = new Set(["inactive"]);

/**
 * Forced sign-out target for sessions the app shell has found to be stale
 * (see src/app/(app)/layout.tsx). A page can't clear cookies during render,
 * so the layout redirects here and this handler drops the JWT before sending
 * the user back to sign in with an explanatory notice.
 */
export async function GET(request: NextRequest) {
  const reason = request.nextUrl.searchParams.get("reason");
  const query = reason && REASONS.has(reason) ? `?reason=${reason}` : "";
  await signOut({ redirectTo: `/sign-in${query}` });
}
