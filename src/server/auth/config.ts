import "server-only";

import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { env } from "@/lib/env";
import { edgeAuthConfig } from "@/server/auth/edge-config";
import { resolveDevCredentials, resolveEntraSignIn, resolveGoogleSignIn } from "@/server/auth/resolve-org";

const DEV_CREDENTIALS_PROVIDER_ID = "dev-credentials";

export const devLoginEnabled = env.NODE_ENV !== "production" && env.AUTH_ENABLE_DEV_LOGIN;

export const authConfig: NextAuthConfig = {
  ...edgeAuthConfig,
  providers: [
    ...edgeAuthConfig.providers,
    ...(devLoginEnabled
      ? [
          Credentials({
            id: DEV_CREDENTIALS_PROVIDER_ID,
            name: "Dev sign-in",
            credentials: { email: { label: "Email", type: "email" } },
            async authorize(credentials) {
              const email = credentials?.email;
              if (typeof email !== "string") return null;

              const identity = await resolveDevCredentials(email);
              if (!identity) return null;

              return identity;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...edgeAuthConfig.callbacks,
    async signIn({ user, account, profile }) {
      // Already resolved (and rejected, if unknown) inside authorize() above.
      if (account?.provider === DEV_CREDENTIALS_PROVIDER_ID) return true;

      const email = user.email;
      if (!email) return false;

      if (account?.provider === "google") {
        const identity = await resolveGoogleSignIn(email);
        if (!identity) return false;
        Object.assign(user, identity);
        return true;
      }

      if (account?.provider === "microsoft-entra-id") {
        const tenantId = typeof profile?.tid === "string" ? profile.tid : undefined;
        const issuer = typeof profile?.iss === "string" ? profile.iss : undefined;
        const identity = await resolveEntraSignIn(email, tenantId, issuer);
        if (!identity) return false;
        Object.assign(user, identity);
        return true;
      }

      return false;
    },
  },
};
