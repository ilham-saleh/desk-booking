"use client";

import { useMemo, useState } from "react";

import type { Role } from "@/generated/prisma/enums";
import { todayInTimeZone } from "@/lib/time-slots";
import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DeskPanel } from "@/components/booking/desk-panel";
import { FloorCanvas, type FloorCanvasDesk } from "@/components/floor-map/floor-canvas";

const AVAILABILITY_POLL_MS = 15_000;

export function FloorMapView({ currentUserRole }: { currentUserRole: Role }) {
  const sites = api.site.list.useQuery();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);

  const effectiveSiteId = siteId ?? sites.data?.[0]?.id ?? null;
  const currentSite = sites.data?.find((site) => site.id === effectiveSiteId);
  const effectiveFloorId = floorId ?? currentSite?.floors[0]?.id ?? null;

  const floor = api.floor.get.useQuery({ floorId: effectiveFloorId! }, { enabled: !!effectiveFloorId });
  const effectiveDate = date ?? (floor.data ? todayInTimeZone(floor.data.site.timeZone) : null);

  const availability = api.booking.getFloorAvailability.useQuery(
    { floorId: effectiveFloorId!, date: effectiveDate! },
    { enabled: !!effectiveFloorId && !!effectiveDate, refetchInterval: AVAILABILITY_POLL_MS },
  );

  const desks: FloorCanvasDesk[] = useMemo(() => {
    if (!floor.data) return [];
    const byId = new Map(availability.data?.desks.map((d) => [d.deskId, d]));
    return floor.data.desks.map((desk) => {
      const live = byId.get(desk.id);
      return {
        id: desk.id,
        number: desk.number,
        name: desk.name,
        x: desk.x,
        y: desk.y,
        requiresCheckIn: desk.requiresCheckIn,
        state: live?.state ?? "INACTIVE",
      };
    });
  }, [floor.data, availability.data]);

  const selectedDesk = floor.data?.desks.find((d) => d.id === selectedDeskId);
  const selectedDeskAvailability = availability.data?.desks.find((d) => d.deskId === selectedDeskId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Floor Map</h1>
        <p className="text-muted-foreground text-sm">Live desk availability across your sites.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label>Site</Label>
          <div className="flex gap-1">
            {sites.data?.map((site) => (
              <Button
                key={site.id}
                size="sm"
                variant={site.id === effectiveSiteId ? "default" : "outline"}
                onClick={() => {
                  setSiteId(site.id);
                  setFloorId(site.floors[0]?.id ?? null);
                  setSelectedDeskId(null);
                }}
              >
                {site.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label>Floor</Label>
          <div className="flex gap-1">
            {currentSite?.floors.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={f.id === effectiveFloorId ? "default" : "outline"}
                onClick={() => {
                  setFloorId(f.id);
                  setSelectedDeskId(null);
                }}
              >
                {f.name}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="floor-map-date">Date</Label>
          <Input
            id="floor-map-date"
            type="date"
            className="w-40"
            value={effectiveDate ?? ""}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className={cn("grid gap-4", selectedDesk && "lg:grid-cols-[1fr_320px]")}>
        {floor.data ? (
          <FloorCanvas
            renderedImageKey={floor.data.livePlanVersion?.renderedImageKey ?? null}
            imageWidth={floor.data.livePlanVersion?.imageWidth ?? null}
            imageHeight={floor.data.livePlanVersion?.imageHeight ?? null}
            desks={desks}
            rooms={floor.data.rooms}
            utilities={floor.data.utilities}
            selectedDeskId={selectedDeskId}
            onSelectDesk={setSelectedDeskId}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Loading floor…</CardTitle>
            </CardHeader>
            <CardContent />
          </Card>
        )}

        {selectedDesk && floor.data && (
          <DeskPanel
            desk={selectedDesk}
            site={floor.data.site}
            occupants={selectedDeskAvailability?.bookings ?? []}
            currentUserRole={currentUserRole}
            onBooked={() => {
              void availability.refetch();
            }}
          />
        )}
      </div>
    </div>
  );
}
