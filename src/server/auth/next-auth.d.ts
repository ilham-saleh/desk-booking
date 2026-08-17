import type { Role } from "@/generated/prisma/enums";

// next-auth/@auth-core re-export their Session/User/JWT types rather than
// declaring them locally, so augmenting "next-auth"/"next-auth/jwt" doesn't
// merge — augment the actual source modules instead.
declare module "@auth/core/types" {
  interface User {
    role: Role;
    organizationId: string | null;
  }

  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      organizationId: string | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    userId: string;
    role: Role;
    organizationId: string | null;
  }
}
