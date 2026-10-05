import "server-only";

import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { env } from "@/lib/env";
import { edgeAuthConfig } from "@/server/auth/edge-config";
import { fetchGraphProfile, toEntraProfile } from "@/server/auth/entra-profile";
import { resolveDevCredentials, resolveEntraSignIn } from "@/server/auth/resolve-org";

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

      // Microsoft Entra ID is the only SSO provider: sign-in and first-sign-in provisioning.
      if (account?.provider === "microsoft-entra-id" && profile) {
        const graph = account.access_token ? await fetchGraphProfile(account.access_token) : null;
        const entraProfile = toEntraProfile(profile, graph);
        if (!entraProfile) {
          console.warn("Entra sign-in rejected: token is missing oid, tid or email");
          return false;
        }
        const identity = await resolveEntraSignIn(entraProfile);
        if (!identity) return false;
        Object.assign(user, identity);
        return true;
      }

      return false;
    },
  },
};
