"use client";

import { use } from "react";
import { api } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FloorsList } from "@/components/admin/floors-list";

interface FacilityDetailPageProps {
  params: Promise<{ siteId: string }>;
}

export default function FacilityDetailPage({ params }: FacilityDetailPageProps) {
  const { siteId } = use(params);
  const { data: facility, isPending, error } = api.facility.get.useQuery({ siteId });

  if (isPending) {
    return <div className="space-y-6 p-8">Loading facility...</div>;
  }

  if (error) {
    return <div className="p-8 text-red-600">Error: {error.message}</div>;
  }

  if (!facility) {
    return <div className="p-8 text-gray-600">Facility not found</div>;
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-6 p-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">{facility.name}</h1>
        {facility.description && <p className="mt-2 text-gray-600">{facility.description}</p>}
      </div>

      {/* Facility Info Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Address</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">{facility.address || "—"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">City</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">{facility.city || "—"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Country</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">{facility.country || "—"}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Timezone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm">{facility.timeZone}</div>
          </CardContent>
        </Card>
      </div>

      {/* Operating Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Operating Hours</CardTitle>
        </CardHeader>
        <CardContent>
          {facility.operatingHours && facility.operatingHours.length > 0 ? (
            <div className="space-y-2">
              {facility.operatingHours.map((hours) => (
                <div key={hours.id} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{dayNames[hours.dayOfWeek]}</span>
                  <span className="text-gray-600">
                    {String(Math.floor(hours.openAtMinutes / 60)).padStart(2, "0")}:
                    {String(hours.openAtMinutes % 60).padStart(2, "0")} —{" "}
                    {String(Math.floor(hours.closeAtMinutes / 60)).padStart(2, "0")}:
                    {String(hours.closeAtMinutes % 60).padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No operating hours configured</p>
          )}
        </CardContent>
      </Card>

      {/* Floors Management */}
      <FloorsList siteId={siteId} />
    </div>
  );
}
