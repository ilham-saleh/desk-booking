import { getSession } from "@/server/auth";
import { DesktopSidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();

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
