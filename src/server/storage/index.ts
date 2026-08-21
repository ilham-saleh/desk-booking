import { localStorage } from "@/server/storage/local";

/**
 * Swappable file storage (CLAUDE.md: local volume in dev, tenant-scoped
 * S3-compatible object storage in production — Phase 8). Only the local
 * implementation exists today; a future S3Storage just needs to satisfy this
 * same interface and get swapped in here.
 *
 * Deliberately doesn't `import "server-only"` (unlike src/server/db) — this
 * module is also imported directly by prisma/seed.ts, which runs under tsx
 * outside Next's module graph and would crash on that guard.
 */
export interface StorageProvider {
  putObject(key: string, data: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}

export const storage: StorageProvider = localStorage;

/** `org/{organizationId}/floor-plans/{floorId}/{versionId}.{ext}` */
export function floorPlanKey(organizationId: string, floorId: string, versionId: string, ext: "pdf" | "png"): string {
  return `org/${organizationId}/floor-plans/${floorId}/${versionId}.${ext}`;
}

/** The `org/{organizationId}/...` prefix every tenant-scoped key must start with. */
export function organizationKeyPrefix(organizationId: string): string {
  return `org/${organizationId}/`;
}
