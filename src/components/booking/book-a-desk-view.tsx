"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarSearch, Layers, MapPin } from "lucide-react";
import { toast } from "sonner";

import type { Role } from "@/generated/prisma/enums";
import { canBookForOthersRole } from "@/lib/roles";
import {
  buildTimeOptions,
  defaultTimeWindow,
  formatMinutesLabel,
  todayInTimeZone,
} from "@/lib/time-slots";
import { api } from "@/lib/trpc/client";
import {
  pickValidId,
  useLastFloorLocation,
  useSaveLastFloorLocation,
  useSyncedQueryParams,
} from "@/lib/use-floor-location";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { ProgressBar, Spinner } from "@/components/ui/loading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DetailRow,
  SidePanel,
  SidePanelBody,
  SidePanelFooter,
  SidePanelHeader,
  SidePanelSection,
} from "@/components/ui/side-panel";
import { formatDisplayDate } from "@/lib/dates";
import { DateStepper, TimeRangeFields } from "@/components/booking/booking-fields";
import {
  BookingSubjectFields,
  type BookingSubjectMode,
  type BookingSubjectUser,
} from "@/components/booking/subject-fields";
import {
  FloorCanvas,
  MAP_BACKGROUND,
  type FloorCanvasDesk,
} from "@/components/floor-map/floor-canvas";

export function BookADeskView({ currentUserRole }: { currentUserRole: Role }) {
  // Display gate only — booking.create enforces per-site "book for others" permission.
  const isAdmin = canBookForOthersRole(currentUserRole);
  const sites = api.site.list.useQuery();

  const searchParams = useSearchParams();
  const [linked] = useState(() => ({
    siteId: searchParams.get("site"),
    floorId: searchParams.get("floor"),
  }));
  const lastViewed = useLastFloorLocation();
  /** Explicit pick in this visit; empty falls back to the URL, then the last floor viewed. */
  const [siteChoice, setSiteId] = useState<string>("");
  const [dateInput, setDate] = useState("");
  const [startInput, setStartMinutes] = useState<number | null>(null);
  const [endInput, setEndMinutes] = useState<number | null>(null);
  const [subjectMode, setSubjectMode] = useState<BookingSubjectMode>("self");
  const [forUser, setForUser] = useState<BookingSubjectUser | null>(null);
  const [guestName, setGuestName] = useState("");

  const [searching, setSearching] = useState(false);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);

  // Restored ids are only used once they're confirmed against the sites this viewer can see.
  const siteId =
    siteChoice ||
    (sites.data
      ? (pickValidId(
          [linked.siteId, lastViewed?.siteId],
          sites.data.map((s) => s.id),
        ) ?? "")
      : "");
  const currentSite = sites.data?.find((site) => site.id === siteId);
  const site = api.site.get.useQuery({ siteId }, { enabled: !!siteId });
  const timeOptions = site.data
    ? buildTimeOptions(site.data.operatingHoursStart, site.data.operatingHoursEnd)
    : [];

  // Sensible defaults once a site is chosen (today, then the site's default window); every field stays editable.
  const date = dateInput || (site.data ? todayInTimeZone(site.data.timeZone) : "");
  const defaults =
    site.data && /^\d{4}-\d{2}-\d{2}$/.test(date) ? defaultTimeWindow(date, site.data) : null;
  const startMinutes = startInput ?? defaults?.startMinutes ?? null;
  const endOptions = timeOptions.filter(
    (minutes) => startMinutes !== null && minutes > startMinutes,
  );
  const after = (minutes: number | null | undefined) =>
    minutes != null && startMinutes !== null && minutes > startMinutes ? minutes : null;
  const endMinutes = after(endInput) ?? after(defaults?.endMinutes) ?? endOptions[0] ?? null;

  const effectiveFloorId = currentSite
    ? (pickValidId(
        [
          floorId,
          linked.siteId === currentSite.id ? linked.floorId : null,
          lastViewed?.siteId === currentSite.id ? lastViewed.floorId : null,
        ],
        currentSite.floors.map((f) => f.id),
      ) ??
      currentSite.floors[0]?.id ??
      null)
    : null;
  useSaveLastFloorLocation(siteId, effectiveFloorId);
  useSyncedQueryParams({ site: siteId || null, floor: effectiveFloorId }, !!sites.data);
  const floor = api.floor.get.useQuery(
    { floorId: effectiveFloorId! },
    { enabled: searching && !!effectiveFloorId },
  );
  // Eligibility is evaluated for whoever will sit at the desk: the chosen employee, a guest, or the viewer.
  const availability = api.booking.getFloorAvailability.useQuery(
    {
      floorId: effectiveFloorId!,
      date,
      startMinutes: startMinutes!,
      endMinutes: endMinutes!,
      occupantUserId: subjectMode === "user" && forUser ? forUser.id : undefined,
      forGuest: subjectMode === "guest" ? true : undefined,
    },
    {
      enabled:
        searching && !!effectiveFloorId && !!date && startMinutes !== null && endMinutes !== null,
    },
  );

  const desks: FloorCanvasDesk[] = (floor.data?.desks ?? []).map((desk) => {
    const live = availability.data?.desks.find((d) => d.deskId === desk.id);
    return {
      id: desk.id,
      number: desk.number,
      name: desk.name,
      x: desk.x,
      y: desk.y,
      requiresCheckIn: desk.requiresCheckIn,
      state: live?.state ?? "INACTIVE",
      freeForRequestedSlot: live?.freeForRequestedSlot,
      eligibleForViewer: live?.eligibleForViewer,
    };
  });
  const selectedDesk = floor.data?.desks.find((d) => d.id === selectedDeskId);

  const createBooking = api.booking.create.useMutation({
    onSuccess: () => {
      toast.success(`Booked desk ${selectedDesk?.number}`);
      setSelectedDeskId(null);
      void availability.refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const canSearch =
    !!siteId &&
    !!date &&
    startMinutes !== null &&
    endMinutes !== null &&
    (subjectMode === "self" ||
      (subjectMode === "user" && !!forUser) ||
      (subjectMode === "guest" && guestName.trim().length > 0));

  // Bring the selected-desk summary into view in the (internally scrolling) panel.
  const selectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedDeskId)
      selectionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedDeskId]);

  const availableCount = desks.filter(
    (d) => d.freeForRequestedSlot === true && d.eligibleForViewer !== false,
  ).length;
  const occupantLabel =
    subjectMode === "guest" && guestName
      ? `${guestName} (guest)`
      : subjectMode === "user" && forUser
        ? forUser.name
        : "You";
  const invalidate = () => {
    setSearching(false);
    setSelectedDeskId(null);
  };

  function book() {
    createBooking.mutate({
      deskId: selectedDeskId!,
      date,
      startMinutes: startMinutes!,
      endMinutes: endMinutes!,
      forUserId: subjectMode === "user" && forUser ? forUser.id : undefined,
      guestName: subjectMode === "guest" && guestName ? guestName : undefined,
    });
  }

  return (
    <div className="absolute inset-0 flex max-lg:flex-col">
      <h1 className="sr-only">Book a Desk</h1>

      {/* Map — the main stage */}
      <div className="relative min-w-0 flex-1 max-lg:h-[45%] max-lg:flex-none">
        {searching && currentSite && floor.data ? (
          <FloorCanvas
            key={effectiveFloorId ?? "none"}
            renderedImageKey={floor.data.livePlanVersion?.renderedImageKey ?? null}
            imageWidth={floor.data.livePlanVersion?.imageWidth ?? null}
            imageHeight={floor.data.livePlanVersion?.imageHeight ?? null}
            desks={desks}
            rooms={floor.data.rooms}
            utilities={floor.data.utilities}
            selectedDeskId={selectedDeskId}
            onSelectDesk={setSelectedDeskId}
            highlightMode
            loading={availability.isPending}
            legend={[
              { kind: "available", label: "Available" },
              { kind: "booked", label: "Booked" },
              { kind: "restricted", label: "Restricted" },
            ]}
            topLeft={
              currentSite.floors.length > 1 ? (
                <div
                  className="bg-surface/95 pointer-events-auto flex gap-1 rounded-full border p-1 shadow-md backdrop-blur"
                  role="tablist"
                  aria-label="Floor"
                >
                  {currentSite.floors.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      role="tab"
                      aria-selected={f.id === effectiveFloorId}
                      onClick={() => {
                        setFloorId(f.id);
                        setSelectedDeskId(null);
                      }}
                      className={cn(
                        "focus-visible:ring-cyan/40 h-8 rounded-full px-3.5 text-[0.8125rem] font-semibold transition-colors outline-none focus-visible:ring-2",
                        f.id === effectiveFloorId
                          ? "bg-navy text-white"
                          : "text-text-secondary hover:bg-navy-soft hover:text-navy",
                      )}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              ) : undefined
            }
          />
        ) : searching && effectiveFloorId ? (
          <FloorCanvas
            renderedImageKey={null}
            imageWidth={null}
            imageHeight={null}
            desks={[]}
            rooms={[]}
            utilities={[]}
            selectedDeskId={null}
            onSelectDesk={() => undefined}
            loading
          />
        ) : (
          <div className={`flex h-full items-center justify-center p-6 ${MAP_BACKGROUND}`}>
            <EmptyState
              icon={CalendarSearch}
              title={
                searching && currentSite && currentSite.floors.length === 0
                  ? "This site has no floors yet"
                  : "Find a desk"
              }
              description={
                searching && currentSite && currentSite.floors.length === 0
                  ? "Pick another site, or ask an administrator to add a floor."
                  : "Choose who, where and when in the panel, then find available desks. Free desks light up on the floor plan."
              }
              className="bg-surface max-w-sm rounded-2xl border shadow-sm"
            />
          </div>
        )}
      </div>

      {/* Booking panel */}
      <SidePanel className="max-lg:static max-lg:min-h-0 max-lg:max-w-none max-lg:flex-1 max-lg:border-t max-lg:border-l-0 max-lg:shadow-none">
        <SidePanelHeader
          title="Book a desk"
          subtitle="Free desks for your time are highlighted on the map."
        />
        <SidePanelBody>
          <SidePanelSection title="Occupant">
            {isAdmin ? (
              <div className="grid gap-3.5">
                <BookingSubjectFields
                  mode={subjectMode}
                  onModeChange={(m) => {
                    setSubjectMode(m);
                    invalidate();
                  }}
                  forUser={forUser}
                  onForUserChange={(u) => {
                    setForUser(u);
                    invalidate();
                  }}
                  guestName={guestName}
                  onGuestNameChange={setGuestName}
                />
              </div>
            ) : (
              <DetailRow label="Booking for">You</DetailRow>
            )}
          </SidePanelSection>

          <SidePanelSection title="Where">
            <div className="grid gap-3.5">
              <div className="grid gap-1.5">
                <Label htmlFor="book-site">Site</Label>
                <Select
                  value={siteId}
                  onValueChange={(value) => {
                    setSiteId(value);
                    setFloorId(null);
                    invalidate();
                  }}
                >
                  <SelectTrigger id="book-site" className="w-full">
                    <span className="flex min-w-0 items-center gap-2">
                      <MapPin className="text-muted-foreground size-4" />
                      <SelectValue
                        placeholder={sites.isPending ? "Loading sites…" : "Select a site"}
                      />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {(sites.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="book-floor">Floor</Label>
                <Select
                  value={effectiveFloorId ?? ""}
                  onValueChange={(value) => {
                    setFloorId(value);
                    setSelectedDeskId(null);
                  }}
                  disabled={!currentSite || currentSite.floors.length === 0}
                >
                  <SelectTrigger id="book-floor" className="w-full">
                    <span className="flex min-w-0 items-center gap-2">
                      <Layers className="text-muted-foreground size-4" />
                      <SelectValue
                        placeholder={
                          currentSite
                            ? currentSite.floors.length
                              ? "Select a floor"
                              : "No floors"
                            : "Select a site first"
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
              </div>
            </div>
          </SidePanelSection>

          <SidePanelSection title="When">
            <div className="grid gap-3.5">
              <div className="grid gap-1.5">
                <Label htmlFor="book-date">Date</Label>
                <DateStepper
                  id="book-date"
                  min={site.data ? todayInTimeZone(site.data.timeZone) : undefined}
                  value={date}
                  onChange={(value) => {
                    setDate(value);
                    invalidate();
                  }}
                />
              </div>
              <TimeRangeFields
                idPrefix="book"
                startOptions={timeOptions.slice(0, -1)}
                endOptions={endOptions}
                start={startMinutes}
                end={endMinutes}
                disabled={!site.data}
                onStartChange={(v) => {
                  setStartMinutes(v);
                  invalidate();
                }}
                onEndChange={(v) => {
                  setEndMinutes(v);
                  invalidate();
                }}
              />
              {site.data && (
                <p className="type-helper">
                  Times are in {site.data.timeZone.replaceAll("_", " ")} (the site&apos;s time
                  zone).
                </p>
              )}
            </div>
          </SidePanelSection>

          {searching && floor.data && (
            <SidePanelSection title="Results" aria-live="polite">
              {availability.isPending ? (
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">Checking availability…</p>
                  <ProgressBar className="bg-surface-sunken rounded-full" />
                </div>
              ) : (
                <p className="text-sm">
                  <span className="text-foreground text-lg font-semibold tabular-nums">
                    {availableCount}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    desk{availableCount === 1 ? "" : "s"} available on {floor.data.name}
                    {availableCount > 0 ? " — pick one on the map." : "."}
                  </span>
                </p>
              )}
            </SidePanelSection>
          )}

          {selectedDesk && (
            <SidePanelSection
              title="Selected desk"
              className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200"
            >
              <div
                ref={selectionRef}
                className="border-cyan/40 bg-cyan-soft/60 scroll-mb-4 space-y-3 rounded-2xl border p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-navy text-xl font-semibold tracking-[-0.015em]">
                    Desk {selectedDesk.number}
                  </p>
                  <button
                    type="button"
                    className="text-text-secondary hover:text-navy text-xs font-medium underline-offset-4 hover:underline"
                    onClick={() => setSelectedDeskId(null)}
                  >
                    Change
                  </button>
                </div>
                <dl className="space-y-2">
                  <DetailRow label="Location">
                    {floor.data?.name} · {currentSite?.name}
                  </DetailRow>
                  <DetailRow label="Occupant">{occupantLabel}</DetailRow>
                  <DetailRow label="Date">{formatDisplayDate(date, { year: true })}</DetailRow>
                  <DetailRow label="Time">
                    <span className="tabular-nums">
                      {formatMinutesLabel(startMinutes ?? 0)}–{formatMinutesLabel(endMinutes ?? 0)}
                    </span>
                  </DetailRow>
                </dl>
              </div>
            </SidePanelSection>
          )}
        </SidePanelBody>

        <SidePanelFooter>
          {selectedDesk ? (
            <Button
              variant="brand"
              size="lg"
              className="w-full"
              disabled={createBooking.isPending}
              onClick={book}
            >
              {createBooking.isPending && <Spinner />}
              {createBooking.isPending ? "Booking…" : `Book desk ${selectedDesk.number}`}
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full"
              variant={searching ? "outline" : "default"}
              disabled={!canSearch}
              onClick={() => {
                if (searching) void availability.refetch();
                else setSearching(true);
              }}
            >
              <CalendarSearch />
              {searching ? "Refresh availability" : "Find available desks"}
            </Button>
          )}
        </SidePanelFooter>
      </SidePanel>
    </div>
  );
}
