import { redirect } from "next/navigation";

import { auth } from "@/server/auth";
import { isPlatformAdmin } from "@/server/auth/roles";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session || !isPlatformAdmin(session)) {
    redirect("/home");
  }

  return <div className="mx-auto max-w-4xl p-6">{children}</div>;
}
