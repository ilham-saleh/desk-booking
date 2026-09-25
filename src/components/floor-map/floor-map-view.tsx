"use client";

import { useMemo, useState } from "react";

import type { Role } from "@/generated/prisma/enums";
import {
  SLOT_MINUTES,
  buildTimeOptions,
  currentMinutesInTimeZone,
  defaultTimeWindow,
  formatMinutesLabel,
  todayInTimeZone,
} from "@/lib/time-slots";
import { api } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DeskPanel } from "@/components/booking/desk-panel";
import { PersonPanel, type PersonPanelBooking } from "@/components/booking/person-panel";
import { FloorCanvas, type FloorCanvasDesk, type FloorCanvasNeighbourhood } from "@/components/floor-map/floor-canvas";

const AVAILABILITY_POLL_MS = 15_000;

/** Deep-link target, e.g. "Locate on map" from My Bookings. Validated on the client; the server re-validates everything. */
export interface FloorMapInitialState {
  siteId?: string;
  floorId?: string;
  date?: string;
  deskId?: string;
  startMinutes?: number;
  endMinutes?: number;
  /** Open this colleague's card (search result deep link). */
  personId?: string;
}

/**
 * Employee Floor Map. Desk colours answer "is this desk free for the selected
 * date and time window?" — a booking only makes a desk busy for its own
 * start–end range, so a desk booked 09:00–18:00 tomorrow is still available
 * today, and one booked 16:00–18:00 today is still available before 16:00.
 */
export function FloorMapView({
  currentUserId,
  currentUserRole,
  initial = {},
}: {
  currentUserId: string;
  currentUserRole: Role;
  initial?: FloorMapInitialState;
}) {
  const sites = api.site.list.useQuery();
  const [siteId, setSiteId] = useState<string | null>(initial.siteId ?? null);
  const [floorId, setFloorId] = useState<string | null>(initial.floorId ?? null);
  const [date, setDate] = useState<string | null>(initial.date ?? null);
  /** Explicit viewer choice; null means "use the default window for the selected date". */
  const [timeWindow, setTimeWindow] = useState<{ startMinutes: number; endMinutes: number } | null>(
    initial.startMinutes !== undefined && initial.endMinutes !== undefined && initial.endMinutes > initial.startMinutes
      ? { startMinutes: initial.startMinutes, endMinutes: initial.endMinutes }
      : null,
  );
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(initial.deskId ?? null);
  /** The deep-linked desk keeps pulsing until the viewer picks something else. */
  const [focusDeskId, setFocusDeskId] = useState<string | null>(initial.deskId ?? null);
  const [personId, setPersonId] = useState<string | null>(initial.personId ?? null);

  const effectiveSiteId = siteId ?? sites.data?.[0]?.id ?? null;
  const currentSite = sites.data?.find((site) => site.id === effectiveSiteId);
  const effectiveFloorId = floorId ?? currentSite?.floors[0]?.id ?? null;

  const floor = api.floor.get.useQuery({ floorId: effectiveFloorId! }, { enabled: !!effectiveFloorId });
  const site = floor.data?.site;
  const effectiveDate = date ?? (site ? todayInTimeZone(site.timeZone) : null);
  const validDate = !!effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate);

  const timeOptions = site ? buildTimeOptions(site.operatingHoursStart, site.operatingHoursEnd) : [];
  const effectiveWindow = timeWindow ?? (site && validDate ? defaultTimeWindow(effectiveDate, site) : null);

  const availability = api.booking.getFloorAvailability.useQuery(
    {
      floorId: effectiveFloorId!,
      date: effectiveDate!,
      startMinutes: effectiveWindow?.startMinutes,
      endMinutes: effectiveWindow?.endMinutes,
    },
    { enabled: !!effectiveFloorId && validDate && !!effectiveWindow, refetchInterval: AVAILABILITY_POLL_MS },
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
        eligibleForViewer: live?.eligibleForViewer,
      };
    });
  }, [floor.data, availability.data]);

  const neighbourhoods: FloorCanvasNeighbourhood[] = useMemo(() => {
    if (!floor.data?.neighbourhoods) return [];
    return floor.data.neighbourhoods.map((n) => ({
      id: n.id,
      name: n.name,
      color: n.color,
      deskIds: n.desks.map((d) => d.deskId),
    }));
  }, [floor.data?.neighbourhoods]);

  const selectedDesk = floor.data?.desks.find((d) => d.id === selectedDeskId);
  const selectedDeskAvailability = availability.data?.desks.find((d) => d.deskId === selectedDeskId);
  const focusedDeskMissing = !!focusDeskId && !!floor.data && !floor.data.desks.some((d) => d.id === focusDeskId);

  function selectDesk(deskId: string | null) {
    setSelectedDeskId(deskId);
    if (deskId !== focusDeskId) setFocusDeskId(null);
  }

  /** Jump to a desk anywhere: switch site/floor (and optionally date/time), select it, and pulse it until the next pick. */
  function locateDesk(target: { siteId: string; floorId: string; deskId: string; date?: string; window?: { startMinutes: number; endMinutes: number } }) {
    setPersonId(null);
    setSiteId(target.siteId);
    setFloorId(target.floorId);
    if (target.date) setDate(target.date);
    setTimeWindow(target.window ?? null);
    setSelectedDeskId(target.deskId);
    setFocusDeskId(target.deskId);
  }

  function locateBooking(booking: PersonPanelBooking) {
    const tz = booking.site.timeZone;
    const bookingDate = todayInTimeZone(tz, new Date(booking.startAt));
    const start = currentMinutesInTimeZone(tz, new Date(booking.startAt));
    const rawEnd = currentMinutesInTimeZone(tz, new Date(booking.endAt));
    const end = rawEnd === 0 ? 24 * 60 : rawEnd;
    locateDesk({
      siteId: booking.site.id,
      floorId: booking.floor.id,
      deskId: booking.desk.id,
      date: bookingDate,
      window: start % SLOT_MINUTES === 0 && end % SLOT_MINUTES === 0 && end > start ? { startMinutes: start, endMinutes: end } : undefined,
    });
  }

  /** Moving the start past the end pushes the end along so the window stays at least one slot long. */
  function setStart(startMinutes: number) {
    const endMinutes = Math.max(effectiveWindow?.endMinutes ?? 0, startMinutes + SLOT_MINUTES);
    setTimeWindow({ startMinutes, endMinutes: Math.min(endMinutes, site?.operatingHoursEnd ?? endMinutes) });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Floor Map</h1>
        <p className="text-muted-foreground text-sm">Live desk availability across your sites.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-3">
        <div className="grid gap-1.5">
          <Label htmlFor="floor-map-site" className="text-xs text-muted-foreground uppercase tracking-wide">
            Site
          </Label>
          <Select
            value={effectiveSiteId ?? ""}
            onValueChange={(value) => {
              setSiteId(value);
              setFloorId(sites.data?.find((s) => s.id === value)?.floors[0]?.id ?? null);
              setTimeWindow(null);
              selectDesk(null);
            }}
            disabled={!sites.data}
          >
            <SelectTrigger id="floor-map-site" className="w-52 rounded-full">
              <SelectValue placeholder={sites.isPending ? "Loading sites…" : "Select a site"} />
            </SelectTrigger>
            <SelectContent>
              {sites.data?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="floor-map-floor" className="text-xs text-muted-foreground uppercase tracking-wide">
            Floor
          </Label>
          <Select
            value={effectiveFloorId ?? ""}
            onValueChange={(value) => {
              setFloorId(value);
              selectDesk(null);
            }}
            disabled={!currentSite || currentSite.floors.length === 0}
          >
            <SelectTrigger id="floor-map-floor" className="w-44 rounded-full">
              <SelectValue placeholder={currentSite && currentSite.floors.length === 0 ? "No floors" : "Select a floor"} />
            </SelectTrigger>
            <SelectContent>
              {currentSite?.floors.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="floor-map-date" className="text-xs text-muted-foreground uppercase tracking-wide">
            Date
          </Label>
          <Input
            id="floor-map-date"
            type="date"
            className="w-40 rounded-full"
            value={effectiveDate ?? ""}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="floor-map-start" className="text-xs text-muted-foreground uppercase tracking-wide">
            From
          </Label>
          <Select
            value={effectiveWindow ? String(effectiveWindow.startMinutes) : ""}
            onValueChange={(v) => setStart(Number(v))}
            disabled={!site}
          >
            <SelectTrigger id="floor-map-start" className="w-28 rounded-full">
              <SelectValue placeholder="Start" />
            </SelectTrigger>
            <SelectContent>
              {timeOptions.slice(0, -1).map((minutes) => (
                <SelectItem key={minutes} value={String(minutes)}>
                  {formatMinutesLabel(minutes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="floor-map-end" className="text-xs text-muted-foreground uppercase tracking-wide">
            To
          </Label>
          <Select
            value={effectiveWindow ? String(effectiveWindow.endMinutes) : ""}
            onValueChange={(v) => effectiveWindow && setTimeWindow({ ...effectiveWindow, endMinutes: Number(v) })}
            disabled={!site}
          >
            <SelectTrigger id="floor-map-end" className="w-28 rounded-full">
              <SelectValue placeholder="End" />
            </SelectTrigger>
            <SelectContent>
              {timeOptions
                .filter((minutes) => !effectiveWindow || minutes > effectiveWindow.startMinutes)
                .map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {formatMinutesLabel(minutes)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {effectiveWindow && (
          <p className="text-muted-foreground self-center text-xs" role="status">
            Showing availability for {effectiveDate}, {formatMinutesLabel(effectiveWindow.startMinutes)}–
            {formatMinutesLabel(effectiveWindow.endMinutes)}
            {site ? ` (${site.timeZone})` : ""}
            {availability.isFetching ? " · refreshing…" : ""}
          </p>
        )}
      </div>

      {focusedDeskMissing && (
        <p role="status" className="text-muted-foreground rounded-md border bg-muted/40 p-3 text-sm">
          That desk isn&apos;t on this floor any more — it may have been moved or removed.
        </p>
      )}

      {floor.data ? (
        <FloorCanvas
          renderedImageKey={floor.data.livePlanVersion?.renderedImageKey ?? null}
          imageWidth={floor.data.livePlanVersion?.imageWidth ?? null}
          imageHeight={floor.data.livePlanVersion?.imageHeight ?? null}
          desks={desks}
          rooms={floor.data.rooms}
          utilities={floor.data.utilities}
          neighbourhoods={neighbourhoods}
          selectedDeskId={selectedDeskId}
          onSelectDesk={selectDesk}
          focusDeskId={focusDeskId}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{sites.data && sites.data.length === 0 ? "No sites yet" : "Loading floor…"}</CardTitle>
          </CardHeader>
          <CardContent />
        </Card>
      )}

      <PersonPanel open={!!personId} onOpenChange={(open) => !open && setPersonId(null)} userId={personId} onLocate={locateBooking} />

      {selectedDesk && floor.data && effectiveDate && effectiveWindow && !personId && (
        <DeskPanel
          open={!!selectedDeskId}
          onOpenChange={(open) => !open && selectDesk(null)}
          desk={selectedDesk}
          site={floor.data.site}
          floorName={floor.data.name}
          viewedDate={effectiveDate}
          viewedWindow={effectiveWindow}
          bookings={selectedDeskAvailability?.bookings ?? []}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onChanged={() => {
            void availability.refetch();
          }}
        />
      )}
    </div>
  );
}
