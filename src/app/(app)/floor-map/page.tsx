import { auth } from "@/server/auth";
import { FloorMapView } from "@/components/floor-map/floor-map-view";

export default async function FloorMapPage() {
  const session = await auth();
  return <FloorMapView currentUserRole={session!.user.role} />;
}
