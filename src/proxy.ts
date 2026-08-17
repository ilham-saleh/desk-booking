import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { edgeAuthConfig } from "@/server/auth/edge-config";
import { isPlatformAdmin, isSiteAdminRole, type Session } from "@/server/auth/roles";

// Deliberately built on the Edge-safe config, not the full one — see
// edge-config.ts. Importing the full config here would pull the Prisma/pg
// driver into the Edge runtime, which doesn't support it.
const { auth } = NextAuth(edgeAuthConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth as Session | null;

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  if (pathname.startsWith("/admin") && !isSiteAdminRole(session)) {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  if (pathname.startsWith("/organizations") && !isPlatformAdmin(session)) {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/organizations/:path*", "/home", "/bookings/:path*", "/book/:path*", "/floor-map/:path*"],
};
