import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { organizationKeyPrefix, storage } from "@/server/storage";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  pdf: "application/pdf",
};

/**
 * Streams tenant-scoped files (floor-plan sources/renders) — never a public
 * static path, since these are tenant-owned per CLAUDE.md rules 1/8. The
 * caller's organizationId must match the key's `org/{id}/...` prefix.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const session = await auth();
  const organizationId = session?.user.organizationId;
  if (!organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key: keyParts } = await params;
  const key = keyParts.join("/");
  if (!key.startsWith(organizationKeyPrefix(organizationId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let data: Buffer;
  try {
    data = await storage.getObject(key);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = key.split(".").pop() ?? "";
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=3600",
    },
  });
}
