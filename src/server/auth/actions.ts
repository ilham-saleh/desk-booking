"use server";

import { signOut } from "@/server/auth";

/** Clears the session cookie and lands on the sign-in page. Safe to call from client components. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/sign-in" });
}
