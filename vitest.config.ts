import { fileURLToPath } from "url";

import "dotenv/config";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // Next.js's bundler resolves "server-only" to a no-op under the
      // "react-server" condition; Vitest doesn't set that condition, so it
      // otherwise hits the package's default export, which just throws.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
      // next-auth imports the bare subpath "next/server", which Next's own
      // bundler resolves natively but has no package.json "exports" entry —
      // Vite's resolver needs the literal file spelled out.
      "next/server": fileURLToPath(new URL("./node_modules/next/server.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Every DB-backed suite truncates shared tables in DATABASE_URL_TEST during
    // setup, so files must not run concurrently against the same database.
    fileParallelism: false,
    server: {
      // Vitest externalizes node_modules by default (loaded via native Node
      // resolution, bypassing Vite — and the alias above with it). next-auth
      // imports the bare "next/server" subpath internally, so it needs to be
      // inlined/transformed through Vite for that alias to actually apply.
      deps: { inline: [/next-auth/] },
    },
  },
});
