import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { isSessionAccountActive } from "@/server/auth/session-account";
import { db } from "@/server/db";
import { DesktopSidebar } from "@/components/layout/sidebar";
import { SIDEBAR_COOKIE, SIDEBAR_EXPANDED } from "@/components/layout/sidebar-state";
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

  const sidebarExpanded = (await cookies()).get(SIDEBAR_COOKIE)?.value === SIDEBAR_EXPANDED;

  return (
    // Viewport-locked shell: the sidebar runs full height, the top bar and page
    // share the remaining column. `main` is `relative` so map screens can fill
    // it edge to edge (absolute inset-0) while other pages scroll inside it.
    <div className="flex h-dvh overflow-hidden">
      <DesktopSidebar role={session.user.role} defaultExpanded={sidebarExpanded} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={session.user} />
        <main className="scroll-quiet relative min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-7">{children}</main>
      </div>
    </div>
  );
}
