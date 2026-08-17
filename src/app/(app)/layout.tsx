import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { DesktopSidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) {
    redirect("/sign-in");
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
