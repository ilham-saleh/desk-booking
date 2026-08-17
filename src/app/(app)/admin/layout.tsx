import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { isSiteAdminRole } from "@/server/auth/roles";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || !isSiteAdminRole(session)) {
    redirect("/home");
  }

  return children;
}
