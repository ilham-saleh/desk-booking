import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, normalize, resolve } from "node:path";

import { env } from "@/lib/env";
import type { StorageProvider } from "@/server/storage";

const root = resolve(env.UPLOAD_DIR);

function resolveKey(key: string): string {
  const path = resolve(root, normalize(key));
  if (path !== root && !path.startsWith(root + "/")) {
    throw new Error(`Storage key escapes upload root: ${key}`);
  }
  return path;
}

export const localStorage: StorageProvider = {
  async putObject(key, data) {
    const path = resolveKey(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },

  async getObject(key) {
    return readFile(resolveKey(key));
  },

  async deleteObject(key) {
    await rm(resolveKey(key), { force: true });
  },
};
