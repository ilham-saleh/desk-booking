/** Storage keys are served through the tenant-scoped file route, never a public static path. */
export function floorPlanImageUrl(renderedImageKey: string): string {
  return `/api/files/${renderedImageKey}`;
}
