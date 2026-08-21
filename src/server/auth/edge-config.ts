import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

import { env } from "@/lib/env";

/**
 * Auth.js validates every configured provider's config on every request —
 * an OAuth app whose credentials haven't been registered yet (blank env
 * vars) fails that validation and 500s the *entire* auth() call, not just
 * sign-in attempts through that specific provider. So each provider is only
 * added once its required env vars are actually set.
 */
export const googleEnabled = Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
export const entraEnabled = Boolean(
  env.AUTH_MICROSOFT_ENTRA_ID_ID && env.AUTH_MICROSOFT_ENTRA_ID_SECRET && env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
);

const edgeProviders: NextAuthConfig["providers"] = [];
if (googleEnabled) {
  edgeProviders.push(Google);
}
if (entraEnabled) {
  edgeProviders.push(MicrosoftEntraID);
}

/**
 * The subset of the Auth.js config that's safe to run in the Edge middleware
 * runtime: OAuth provider definitions (no DB access) plus the two callbacks
 * that only shape the JWT/session payload (no DB access either). The full
 * config (src/server/auth/config.ts) builds on this, adding the dev
 * Credentials provider and the `signIn` callback — both of which query the
 * database via `@prisma/adapter-pg`, which isn't Edge-compatible.
 */
export const edgeAuthConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  providers: edgeProviders,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        token.role = user.role;
        token.organizationId = user.organizationId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId;
      session.user.role = token.role;
      session.user.organizationId = token.organizationId;
      return session;
    },
  },
};
