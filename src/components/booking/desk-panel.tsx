"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Role } from "@/generated/prisma/enums";
import { buildTimeOptions, formatMinutesLabel, todayInTimeZone } from "@/lib/time-slots";
import { api } from "@/lib/trpc/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookingSubjectFields, type BookingSubjectMode } from "@/components/booking/subject-fields";

export interface DeskPanelDesk {
  id: string;
  number: string;
  name: string | null;
  requiresCheckIn: boolean;
}

export interface DeskPanelSite {
  id: string;
  timeZone: string;
  operatingHoursStart: number;
  operatingHoursEnd: number;
}

export interface DeskPanelOccupant {
  id: string;
  status: "CONFIRMED" | "CHECKED_IN" | "CANCELLED" | "AUTO_CANCELLED" | "COMPLETED";
  userId: string | null;
  bookedById: string;
  startAt: string | Date;
  endAt: string | Date;
  occupantLabel: string;
}

function isAdminRole(role: Role): boolean {
  return role === Role.SITE_ADMIN || role === Role.ORG_SUPER_ADMIN;
}

function formatTime(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(value));
}

export function DeskPanel({
  open,
  onOpenChange,
  desk,
  site,
  occupants,
  currentUserId,
  currentUserRole,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  desk: DeskPanelDesk;
  site: DeskPanelSite;
  occupants: DeskPanelOccupant[];
  currentUserId: string;
  currentUserRole: Role;
  onChanged: () => void;
}) {
  const now = new Date();
  const currentBooking = occupants.find((o) => new Date(o.startAt) <= now && now < new Date(o.endAt));
  const canActOn = (o: DeskPanelOccupant) => o.userId === currentUserId || o.bookedById === currentUserId || isAdminRole(currentUserRole);

  const utils = api.useUtils();
  const onMutationSettled = () => {
    void utils.booking.getFloorAvailability.invalidate();
    onChanged();
  };

  const checkIn = api.booking.checkIn.useMutation({
    onSuccess: () => {
      toast.success("Checked in");
      onMutationSettled();
    },
    onError: (error) => toast.error(error.message),
  });
  const endBooking = api.booking.endBooking.useMutation({
    onSuccess: () => {
      toast.success("Booking ended");
      onMutationSettled();
    },
    onError: (error) => toast.error(error.message),
  });
  const cancelBooking = api.booking.cancel.useMutation({
    onSuccess: () => {
      toast.success("Booking cancelled");
      onMutationSettled();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Desk {desk.number}</SheetTitle>
          <SheetDescription>
            {desk.name ?? "No name"}
            {desk.requiresCheckIn && " · Check-in required"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-4">
          {currentBooking ? (
            <OccupantCard
              booking={currentBooking}
              site={site}
              canAct={canActOn(currentBooking)}
              requiresCheckIn={desk.requiresCheckIn}
              onCheckIn={() => checkIn.mutate({ bookingId: currentBooking.id })}
              onEndBooking={() => endBooking.mutate({ bookingId: currentBooking.id })}
              checkInPending={checkIn.isPending}
              endBookingPending={endBooking.isPending}
            />
          ) : (
            <BookingForm
              desk={desk}
              site={site}
              currentUserRole={currentUserRole}
              onBooked={onMutationSettled}
            />
          )}

          {occupants.length > 0 && (
            <div className="space-y-1.5 border-t pt-4 text-sm">
              <p className="font-medium">Today&apos;s bookings</p>
              {occupants.map((o) => (
                <div key={o.id} className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground">
                    {formatTime(o.startAt, site.timeZone)}–{formatTime(o.endAt, site.timeZone)} — {o.occupantLabel}
                    <StatusBadge status={o.status} className="ml-2" />
                  </p>
                  {o.status === "CONFIRMED" && new Date(o.startAt) > now && canActOn(o) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={cancelBooking.isPending}
                      onClick={() => cancelBooking.mutate({ bookingId: o.id })}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function StatusBadge({ status, className }: { status: DeskPanelOccupant["status"]; className?: string }) {
  if (status === "CHECKED_IN") {
    return (
      <Badge className={`border-transparent bg-green-600 text-white ${className ?? ""}`}>Checked in</Badge>
    );
  }
  return (
    <Badge variant="secondary" className={className}>
      {status === "CONFIRMED" ? "Confirmed" : status}
    </Badge>
  );
}

function OccupantCard({
  booking,
  site,
  canAct,
  requiresCheckIn,
  onCheckIn,
  onEndBooking,
  checkInPending,
  endBookingPending,
}: {
  booking: DeskPanelOccupant;
  site: DeskPanelSite;
  canAct: boolean;
  requiresCheckIn: boolean;
  onCheckIn: () => void;
  onEndBooking: () => void;
  checkInPending: boolean;
  endBookingPending: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border py-6 text-center">
      <Avatar className="size-14">
        <AvatarFallback className="text-lg font-medium">
          {booking.occupantLabel.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div>
        <p className="font-medium">{booking.occupantLabel}</p>
        <div className="mt-1">
          <StatusBadge status={booking.status} />
        </div>
      </div>
      <p className="text-muted-foreground text-sm">Booked until {formatTime(booking.endAt, site.timeZone)}</p>

      {canAct && requiresCheckIn && booking.status === "CONFIRMED" && (
        <Button className="w-48" onClick={onCheckIn} disabled={checkInPending}>
          {checkInPending ? "Checking in…" : "Check In"}
        </Button>
      )}
      {canAct && booking.status === "CHECKED_IN" && (
        <Button className="w-48" variant="destructive" onClick={onEndBooking} disabled={endBookingPending}>
          {endBookingPending ? "Ending…" : "End Booking"}
        </Button>
      )}
    </div>
  );
}

function BookingForm({
  desk,
  site,
  currentUserRole,
  onBooked,
}: {
  desk: DeskPanelDesk;
  site: DeskPanelSite;
  currentUserRole: Role;
  onBooked: () => void;
}) {
  const isAdmin = isAdminRole(currentUserRole);
  const timeOptions = buildTimeOptions(site.operatingHoursStart, site.operatingHoursEnd);

  const [date, setDate] = useState(todayInTimeZone(site.timeZone));
  const [startMinutes, setStartMinutes] = useState<number>(timeOptions[0] ?? 0);
  const [endMinutes, setEndMinutes] = useState<number>(timeOptions[1] ?? timeOptions[0] ?? 0);
  const [subjectMode, setSubjectMode] = useState<BookingSubjectMode>("self");
  const [forUserId, setForUserId] = useState<string>("");
  const [guestName, setGuestName] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const orgUsers = api.user.listActive.useQuery(undefined, { enabled: isAdmin });
  const createBooking = api.booking.create.useMutation({
    onSuccess: () => {
      toast.success(`Booked desk ${desk.number}`);
      setConfirmOpen(false);
      onBooked();
    },
    onError: (error) => {
      toast.error(error.message);
      setConfirmOpen(false);
    },
  });

  const endOptions = timeOptions.filter((minutes) => minutes > startMinutes);

  function submit() {
    createBooking.mutate({
      deskId: desk.id,
      date,
      startMinutes,
      endMinutes,
      forUserId: subjectMode === "user" && forUserId ? forUserId : undefined,
      guestName: subjectMode === "guest" && guestName ? guestName : undefined,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="desk-panel-date">Date</Label>
          <Input
            id="desk-panel-date"
            type="date"
            min={todayInTimeZone(site.timeZone)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>Start</Label>
            <Select value={String(startMinutes)} onValueChange={(v) => setStartMinutes(Number(v))}>
              <SelectTrigger>
                <SelectValue />
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
            <Select value={String(endMinutes)} onValueChange={(v) => setEndMinutes(Number(v))}>
              <SelectTrigger>
                <SelectValue />
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
        </div>

        {isAdmin && (
          <BookingSubjectFields
            mode={subjectMode}
            onModeChange={setSubjectMode}
            forUserId={forUserId}
            onForUserIdChange={setForUserId}
            guestName={guestName}
            onGuestNameChange={setGuestName}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button disabled={subjectMode === "user" && !forUserId} onClick={() => setConfirmOpen(true)}>
          Book desk {desk.number}
        </Button>
        <Button variant="outline" disabled>
          Watch (Phase 5)
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm booking</DialogTitle>
            <DialogDescription>
              Desk {desk.number} on {date}, {formatMinutesLabel(startMinutes)}–{formatMinutesLabel(endMinutes)}
              {subjectMode === "guest" && guestName && ` for guest ${guestName}`}
              {subjectMode === "user" &&
                forUserId &&
                ` for ${orgUsers.data?.find((u) => u.id === forUserId)?.name ?? "the selected user"}`}
              .
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createBooking.isPending}>
              {createBooking.isPending ? "Booking…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
