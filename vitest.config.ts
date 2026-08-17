import { fileURLToPath } from "url";

import "dotenv/config";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // Next.js's bundler resolves "server-only" to a no-op under the
    // "react-server" condition; Vitest doesn't set that condition, so it
    // otherwise hits the package's default export, which just throws.
    alias: {
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
