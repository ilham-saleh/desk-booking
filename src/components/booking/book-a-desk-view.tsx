"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Role } from "@/generated/prisma/enums";
import { buildTimeOptions, formatMinutesLabel, todayInTimeZone } from "@/lib/time-slots";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingSubjectFields, type BookingSubjectMode } from "@/components/booking/subject-fields";
import { FloorCanvas, type FloorCanvasDesk } from "@/components/floor-map/floor-canvas";

export function BookADeskView({ currentUserRole }: { currentUserRole: Role }) {
  const isAdmin = currentUserRole === Role.SITE_ADMIN || currentUserRole === Role.ORG_SUPER_ADMIN;
  const sites = api.site.list.useQuery();
  const orgUsers = api.user.listActive.useQuery(undefined, { enabled: isAdmin });

  const [siteId, setSiteId] = useState<string>("");
  const [date, setDate] = useState("");
  const [startMinutes, setStartMinutes] = useState<number | null>(null);
  const [endMinutes, setEndMinutes] = useState<number | null>(null);
  const [subjectMode, setSubjectMode] = useState<BookingSubjectMode>("self");
  const [forUserId, setForUserId] = useState("");
  const [guestName, setGuestName] = useState("");

  const [searching, setSearching] = useState(false);
  const [floorId, setFloorId] = useState<string | null>(null);
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const currentSite = sites.data?.find((site) => site.id === siteId);
  const site = api.site.get.useQuery({ siteId }, { enabled: !!siteId });
  const timeOptions = site.data ? buildTimeOptions(site.data.operatingHoursStart, site.data.operatingHoursEnd) : [];
  const endOptions = timeOptions.filter((minutes) => startMinutes !== null && minutes > startMinutes);

  const effectiveFloorId = floorId ?? currentSite?.floors[0]?.id ?? null;
  const floor = api.floor.get.useQuery({ floorId: effectiveFloorId! }, { enabled: searching && !!effectiveFloorId });
  const availability = api.booking.getFloorAvailability.useQuery(
    { floorId: effectiveFloorId!, date, startMinutes: startMinutes!, endMinutes: endMinutes! },
    { enabled: searching && !!effectiveFloorId && !!date && startMinutes !== null && endMinutes !== null },
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
    };
  });
  const selectedDesk = floor.data?.desks.find((d) => d.id === selectedDeskId);

  const createBooking = api.booking.create.useMutation({
    onSuccess: () => {
      toast.success(`Booked desk ${selectedDesk?.number}`);
      setConfirmOpen(false);
      setSelectedDeskId(null);
      void availability.refetch();
    },
    onError: (error) => {
      toast.error(error.message);
      setConfirmOpen(false);
    },
  });

  const canSearch = !!siteId && !!date && startMinutes !== null && endMinutes !== null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Book a Desk</h1>
        <p className="text-muted-foreground text-sm">
          Pick a site, date, and time range, then find and confirm an available desk.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search criteria</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {isAdmin && (
            <div className="sm:col-span-2 lg:col-span-4">
              <BookingSubjectFields
                mode={subjectMode}
                onModeChange={setSubjectMode}
                forUserId={forUserId}
                onForUserIdChange={setForUserId}
                guestName={guestName}
                onGuestNameChange={setGuestName}
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Site</Label>
            <Select
              value={siteId}
              onValueChange={(value) => {
                setSiteId(value);
                setFloorId(null);
                setSearching(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a site" />
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
            <Label htmlFor="book-date">Date</Label>
            <Input
              id="book-date"
              type="date"
              min={site.data ? todayInTimeZone(site.data.timeZone) : undefined}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSearching(false);
              }}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Start</Label>
            <Select
              value={startMinutes !== null ? String(startMinutes) : ""}
              onValueChange={(v) => {
                setStartMinutes(Number(v));
                setSearching(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Start time" />
              </SelectTrigger>
              <SelectContent>
                {timeOptions.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {formatMinutesLabel(minutes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>End</Label>
            <Select
              value={endMinutes !== null ? String(endMinutes) : ""}
              onValueChange={(v) => {
                setEndMinutes(Number(v));
                setSearching(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="End time" />
              </SelectTrigger>
              <SelectContent>
                {endOptions.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {formatMinutesLabel(minutes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <Button disabled={!canSearch} onClick={() => setSearching(true)}>
              Find Available Desk
            </Button>
          </div>
        </CardContent>
      </Card>

      {searching && currentSite && (
        <>
          <div className="flex gap-1">
            {currentSite.floors.map((f) => (
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

          {floor.data && (
            <FloorCanvas
              renderedImageKey={floor.data.livePlanVersion?.renderedImageKey ?? null}
              imageWidth={floor.data.livePlanVersion?.imageWidth ?? null}
              imageHeight={floor.data.livePlanVersion?.imageHeight ?? null}
              desks={desks}
              rooms={floor.data.rooms}
              utilities={floor.data.utilities}
              selectedDeskId={selectedDeskId}
              onSelectDesk={(deskId) => {
                setSelectedDeskId(deskId);
                setConfirmOpen(true);
              }}
              highlightMode
            />
          )}
        </>
      )}

      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Confirm booking</SheetTitle>
            <SheetDescription>Review the details, then confirm to book this desk.</SheetDescription>
          </SheetHeader>

          <div className="space-y-3 p-4 text-sm">
            <SummaryRow
              label="Occupant"
              value={
                subjectMode === "guest" && guestName
                  ? guestName
                  : subjectMode === "user" && forUserId
                    ? orgUsers.data?.find((u) => u.id === forUserId)?.name ?? "Selected user"
                    : "Myself"
              }
            />
            <SummaryRow label="Location" value={`${currentSite?.name ?? ""} / ${floor.data?.name ?? ""}`} />
            <SummaryRow label="Desk" value={selectedDesk?.number ?? ""} />
            <SummaryRow label="Date" value={date} />
            <SummaryRow label="Time" value={`${formatMinutesLabel(startMinutes ?? 0)}–${formatMinutesLabel(endMinutes ?? 0)}`} />
          </div>

          <SheetFooter className="flex-row justify-end border-t">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={createBooking.isPending}
              onClick={() =>
                createBooking.mutate({
                  deskId: selectedDeskId!,
                  date,
                  startMinutes: startMinutes!,
                  endMinutes: endMinutes!,
                  forUserId: subjectMode === "user" && forUserId ? forUserId : undefined,
                  guestName: subjectMode === "guest" && guestName ? guestName : undefined,
                })
              }
            >
              {createBooking.isPending ? "Booking…" : "Confirm"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
