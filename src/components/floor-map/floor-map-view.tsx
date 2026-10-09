"use client";

import { useEffect, useMemo, useState } from "react";

import type { Role } from "@/generated/prisma/enums";
import {
  SLOT_MINUTES,
  currentMinutesInTimeZone,
  firstMapDate,
  formatMinutesLabel,
  isMapDateSelectable,
  mapTimeWindow,
  todayInTimeZone,
} from "@/lib/time-slots";
import { Building2, Layers, MousePointerClick } from "lucide-react";

import { api } from "@/lib/trpc/client";
import {
  pickValidId,
  useLastFloorLocation,
  useSaveLastFloorLocation,
  useSyncedQueryParams,
} from "@/lib/use-floor-location";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { ProgressBar, Skeleton } from "@/components/ui/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SidePanel,
  SidePanelBody,
  SidePanelHeader,
  SidePanelSection,
} from "@/components/ui/side-panel";
import { formatDisplayDate } from "@/lib/dates";
import { DeskPanel } from "@/components/booking/desk-panel";
import { PersonPanel, type PersonPanelBooking } from "@/components/booking/person-panel";
import { MapDateTimePicker } from "@/components/floor-map/date-time-picker";
import { MarkerSwatch, type MarkerKind } from "@/components/floor-map/desk-markers";
import {
  FloorCanvas,
  MAP_BACKGROUND,
  markerKind,
  type FloorCanvasDesk,
  type FloorCanvasNeighbourhood,
} from "@/components/floor-map/floor-canvas";

const AVAILABILITY_POLL_MS = 15_000;
/** How often "Now" re-reads the clock, so the map rolls into the next slot on its own. */
const CLOCK_TICK_MS = 30_000;

/** The current time, refreshed every `CLOCK_TICK_MS`. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** Deep-link target, e.g. "Locate on map" from My Bookings. Validated on the client; the server re-validates everything. */
export interface FloorMapInitialState {
  siteId?: string;
  floorId?: string;
  date?: string;
  deskId?: string;
  startMinutes?: number;
  /** Open this colleague's card (search result deep link). */
  personId?: string;
}

/**
 * Employee Floor Map. Desk colours answer "is this desk free from the selected
 * start time until the site closes?" — a booking only makes a desk busy for
 * its own start–end range, so a desk booked 09:00–18:00 tomorrow is still
 * available today, and one booked 09:00–11:00 today is available from 11:00.
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
  /** Explicit start time; null follows the clock ("Now") today, or opening time on other dates. */
  const [startMinutes, setStartMinutes] = useState<number | null>(initial.startMinutes ?? null);
  const now = useNow();
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(initial.deskId ?? null);
  /** The deep-linked desk keeps pulsing until the viewer picks something else. */
  const [focusDeskId, setFocusDeskId] = useState<string | null>(initial.deskId ?? null);
  const [personId, setPersonId] = useState<string | null>(initial.personId ?? null);

  // Chosen (or deep-linked) → last viewed → first. Until the site list arrives the
  // chosen ids are trusted so a deep link starts loading at once; after that only ids
  // this viewer can actually see are used.
  const lastViewed = useLastFloorLocation();
  const effectiveSiteId = sites.data
    ? (pickValidId(
        [siteId, lastViewed?.siteId],
        sites.data.map((s) => s.id),
      ) ??
      sites.data[0]?.id ??
      null)
    : siteId;
  const currentSite = sites.data?.find((site) => site.id === effectiveSiteId);
  const effectiveFloorId = currentSite
    ? (pickValidId(
        [floorId, lastViewed?.siteId === currentSite.id ? lastViewed.floorId : null],
        currentSite.floors.map((f) => f.id),
      ) ??
      currentSite.floors[0]?.id ??
      null)
    : sites.data
      ? null
      : floorId;

  // Refresh-proof: the address bar always describes what's on screen.
  useSaveLastFloorLocation(sites.data && effectiveSiteId, effectiveFloorId);
  useSyncedQueryParams(
    {
      site: effectiveSiteId,
      floor: effectiveFloorId,
      date: date || null,
      start: startMinutes !== null ? String(startMinutes) : null,
      desk: focusDeskId,
      person: personId,
    },
    !!sites.data,
  );

  const floor = api.floor.get.useQuery(
    { floorId: effectiveFloorId! },
    { enabled: !!effectiveFloorId },
  );
  const site = floor.data?.site;
  // Past dates, weekends and finished days can't be viewed; they fall back to the first bookable day.
  const effectiveDate = site
    ? date && /^\d{4}-\d{2}-\d{2}$/.test(date) && isMapDateSelectable(date, site, now)
      ? date
      : firstMapDate(site, now)
    : null;
  const validDate = !!effectiveDate;
  const mapWindow = site && effectiveDate ? mapTimeWindow(effectiveDate, startMinutes, site, now) : null;
  const effectiveWindow = mapWindow ? { startMinutes: mapWindow.startMinutes, endMinutes: mapWindow.endMinutes } : null;

  const availability = api.booking.getFloorAvailability.useQuery(
    {
      floorId: effectiveFloorId!,
      date: effectiveDate!,
      startMinutes: effectiveWindow?.startMinutes,
      endMinutes: effectiveWindow?.endMinutes,
    },
    {
      enabled: !!effectiveFloorId && validDate && !!effectiveWindow,
      refetchInterval: AVAILABILITY_POLL_MS,
    },
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
  }, [floor.data]);

  const selectedDesk = floor.data?.desks.find((d) => d.id === selectedDeskId);
  const selectedDeskAvailability = availability.data?.desks.find(
    (d) => d.deskId === selectedDeskId,
  );
  const focusedDeskMissing =
    !!focusDeskId && !!floor.data && !floor.data.desks.some((d) => d.id === focusDeskId);

  function selectDesk(deskId: string | null) {
    setSelectedDeskId(deskId);
    if (deskId !== focusDeskId) setFocusDeskId(null);
  }

  /** Jump to a desk anywhere: switch site/floor (and optionally date/time), select it, and pulse it until the next pick. */
  function locateDesk(target: {
    siteId: string;
    floorId: string;
    deskId: string;
    date?: string;
    startMinutes?: number;
  }) {
    setPersonId(null);
    setSiteId(target.siteId);
    setFloorId(target.floorId);
    if (target.date) setDate(target.date);
    setStartMinutes(target.startMinutes ?? null);
    setSelectedDeskId(target.deskId);
    setFocusDeskId(target.deskId);
  }

  function locateBooking(booking: PersonPanelBooking) {
    const tz = booking.site.timeZone;
    const bookingDate = todayInTimeZone(tz, new Date(booking.startAt));
    const start = currentMinutesInTimeZone(tz, new Date(booking.startAt));
    // A start that has already passed (an ongoing booking) falls back to "Now" in mapTimeWindow.
    locateDesk({
      siteId: booking.site.id,
      floorId: booking.floor.id,
      deskId: booking.desk.id,
      date: bookingDate,
      startMinutes: start % SLOT_MINUTES === 0 ? start : undefined,
    });
  }

  const counts = useMemo(() => {
    const tally = { available: 0, booked: 0, restricted: 0, inactive: 0 };
    for (const desk of desks) tally[markerKind(desk)] += 1;
    return tally;
  }, [desks]);

  const floorLoading =
    !!effectiveFloorId && (floor.isPending || (!!floor.data && availability.isPending));

  return (
    <div className="absolute inset-0 flex">
      <div className="relative flex min-w-0 flex-1 flex-col">
        {/* Map toolbar — where and when. Compact so the map keeps the viewport. */}
        <div className="bg-surface toolbar-elevated relative z-10 flex flex-wrap items-center gap-2.5 px-3 py-3 xl:px-4">
          <h1 className="sr-only">Floor Map</h1>
          <Label htmlFor="floor-map-site" className="sr-only">
            Site
          </Label>
          <Select
            value={effectiveSiteId ?? ""}
            onValueChange={(value) => {
              setSiteId(value);
              setFloorId(sites.data?.find((s) => s.id === value)?.floors[0]?.id ?? null);
              setStartMinutes(null);
              selectDesk(null);
            }}
            disabled={!sites.data}
          >
            <SelectTrigger id="floor-map-site" className="w-36">
              <span className="flex min-w-0 items-center gap-2">
                <Building2 className="text-muted-foreground size-4" />
                <SelectValue placeholder={sites.isPending ? "Loading sites…" : "Select a site"} />
              </span>
            </SelectTrigger>
            <SelectContent>
              {sites.data?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Label htmlFor="floor-map-floor" className="sr-only">
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
            <SelectTrigger id="floor-map-floor" className="w-[7.5rem]">
              <span className="flex min-w-0 items-center gap-2">
                <Layers className="text-muted-foreground size-4" />
                <SelectValue
                  placeholder={
                    currentSite && currentSite.floors.length === 0 ? "No floors" : "Floor"
                  }
                />
              </span>
            </SelectTrigger>
            <SelectContent>
              {currentSite?.floors.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span aria-hidden className="bg-border mx-1 hidden h-6 w-px 2xl:block" />

          <MapDateTimePicker
            className="w-[13.5rem]"
            site={site ?? null}
            date={effectiveDate}
            startMinutes={mapWindow?.startMinutes ?? null}
            isNow={mapWindow?.isNow ?? false}
            now={now}
            onApply={(nextDate, nextStart) => {
              setDate(nextDate);
              setStartMinutes(nextStart);
            }}
            disabled={!site}
          />

          {site && (
            <span
              className="text-muted-foreground ml-auto hidden text-xs 2xl:inline"
              title="Times are shown in the site's time zone"
            >
              {site.timeZone.replaceAll("_", " ")}
            </span>
          )}
          <ProgressBar
            active={availability.isFetching && !floorLoading}
            className="absolute inset-x-0 bottom-0"
          />
        </div>

        {/* White workspace; the map is a quietly outlined card so it doesn't float edge-to-edge. */}
        <div className="bg-surface min-h-0 flex-1 px-3 pb-3 xl:px-4 xl:pb-4">
          <div className="border-border-control relative h-full overflow-hidden rounded-2xl border shadow-xs">
            {focusedDeskMissing && (
              <p
                role="status"
                className="bg-surface text-text-secondary absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-medium shadow-md"
              >
                That desk isn&apos;t on this floor any more — it may have been moved or removed.
              </p>
            )}

            {sites.data && sites.data.length === 0 ? (
              <div className={`flex h-full items-center justify-center ${MAP_BACKGROUND}`}>
                <EmptyState
                  icon={Building2}
                  title="No sites yet"
                  description="Once an administrator sets up a site and floor, its live map appears here."
                  className="bg-surface max-w-sm rounded-2xl border shadow-sm"
                />
              </div>
            ) : (
              <FloorCanvas
                key={effectiveFloorId ?? "none"}
                renderedImageKey={floor.data?.livePlanVersion?.renderedImageKey ?? null}
                imageWidth={floor.data?.livePlanVersion?.imageWidth ?? null}
                imageHeight={floor.data?.livePlanVersion?.imageHeight ?? null}
                markerSize={floor.data?.livePlanVersion?.markerSize ?? null}
                desks={desks}
                rooms={floor.data?.rooms ?? []}
                utilities={floor.data?.utilities ?? []}
                neighbourhoods={neighbourhoods}
                selectedDeskId={selectedDeskId}
                onSelectDesk={selectDesk}
                focusDeskId={focusDeskId}
                loading={!floor.data || floorLoading}
              />
            )}
          </div>
        </div>
      </div>

      {personId ? (
        <PersonPanel
          open={!!personId}
          onOpenChange={(open) => !open && setPersonId(null)}
          userId={personId}
          onLocate={locateBooking}
        />
      ) : selectedDesk && floor.data && effectiveDate && effectiveWindow ? (
        <DeskPanel
          key={selectedDesk.id}
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
      ) : (
        <SidePanel dockAt="xl" className="max-xl:hidden">
          <SidePanelHeader
            title={floor.data?.name ?? (floorLoading ? "Loading floor…" : "Floor Map")}
            subtitle={
              floor.data ? floor.data.site.name : "Live desk availability across your sites"
            }
          />
          <SidePanelBody>
            <SidePanelSection title="Availability">
              {effectiveDate && effectiveWindow ? (
                <p className="text-foreground text-sm font-medium" role="status">
                  {formatDisplayDate(effectiveDate)} ·{" "}
                  from {mapWindow?.isNow ? "now" : formatMinutesLabel(effectiveWindow.startMinutes)} until{" "}
                  {formatMinutesLabel(effectiveWindow.endMinutes)}
                </p>
              ) : (
                <Skeleton className="h-5 w-40" />
              )}
              {floor.data && availability.data ? (
                <>
                  <AvailabilityMeter
                    available={counts.available}
                    total={desks.length - counts.inactive}
                  />
                  <dl className="grid grid-cols-2 gap-2">
                    <CountTile kind="available" label="Available" value={counts.available} />
                    <CountTile kind="booked" label="Booked" value={counts.booked} />
                    <CountTile kind="restricted" label="Restricted" value={counts.restricted} />
                    <CountTile kind="inactive" label="Inactive" value={counts.inactive} />
                  </dl>
                </>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-2 w-full" />
                  <div className="grid grid-cols-2 gap-2">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                </div>
              )}
            </SidePanelSection>
            <SidePanelSection>
              <div className="flex items-start gap-3">
                <span className="bg-cyan-soft text-cyan-ink flex size-9 shrink-0 items-center justify-center rounded-xl">
                  <MousePointerClick className="size-4" />
                </span>
                <div className="space-y-0.5">
                  <p className="type-card-title">Select a desk</p>
                  <p className="text-muted-foreground text-[0.8125rem] leading-5">
                    Click any desk on the map to see who&apos;s there, its restrictions and
                    features, and to book it.
                  </p>
                </div>
              </div>
            </SidePanelSection>
          </SidePanelBody>
        </SidePanel>
      )}
    </div>
  );
}

function AvailabilityMeter({ available, total }: { available: number; total: number }) {
  const ratio = total > 0 ? available / total : 0;
  return (
    <div className="space-y-1.5">
      <div className="bg-surface-sunken h-2 overflow-hidden rounded-full" aria-hidden>
        <div
          className="bg-success h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <p className="text-muted-foreground text-xs">
        <span className="text-foreground font-semibold tabular-nums">{available}</span> of {total}{" "}
        bookable desk{total === 1 ? "" : "s"} free
      </p>
    </div>
  );
}

function CountTile({ kind, label, value }: { kind: MarkerKind; label: string; value: number }) {
  return (
    <div className="bg-surface-muted rounded-xl border border-transparent px-3 py-2.5">
      <dt className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <MarkerSwatch kind={kind} />
        {label}
      </dt>
      <dd className="text-foreground mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
