import { getSession } from "@/server/auth";
import { isSiteAdmin } from "@/server/auth/roles";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = getSession();

  if (!isSiteAdmin(session)) {
    return (
      <p className="text-muted-foreground text-sm">
        Admin only. Real enforcement moves to route middleware in Phase 1.
      </p>
    );
  }

  return children;
}
