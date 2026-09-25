import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { isSessionAccountActive } from "@/server/auth/session-account";
import { db } from "@/server/db";
import { DesktopSidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) {
    redirect("/sign-in");
  }
  // A JWT can outlive its user row (deactivated, or a re-seeded dev database).
  // Without this every page's first tRPC call would fail with an opaque error
  // and no way to get back to sign-in — drop the session instead.
  if (!(await isSessionAccountActive(db, session.user.id))) {
    redirect("/sign-out?reason=inactive");
  }

  return (
    <div className="flex h-screen flex-col">
      <TopBar user={session.user} />
      <div className="flex flex-1 overflow-hidden">
        <DesktopSidebar role={session.user.role} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
