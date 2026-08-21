"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Role } from "@/generated/prisma/enums";
import { buildTimeOptions, formatMinutesLabel, todayInTimeZone } from "@/lib/time-slots";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
  startAt: string | Date;
  endAt: string | Date;
  occupantLabel: string;
}

export function DeskPanel({
  desk,
  site,
  occupants,
  currentUserRole,
  onBooked,
}: {
  desk: DeskPanelDesk;
  site: DeskPanelSite;
  occupants: DeskPanelOccupant[];
  currentUserRole: Role;
  onBooked: () => void;
}) {
  const isAdmin = currentUserRole === Role.SITE_ADMIN || currentUserRole === Role.ORG_SUPER_ADMIN;
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
    <Card>
      <CardHeader>
        <CardTitle>Desk {desk.number}</CardTitle>
        <CardDescription>
          {desk.name ?? "No name"}
          {desk.requiresCheckIn && " · Check-in required"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {occupants.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Today&apos;s bookings</p>
            {occupants.map((occupant, index) => (
              <p key={index} className="text-muted-foreground">
                {formatTimeRange(occupant.startAt, occupant.endAt, site.timeZone)} — {occupant.occupantLabel}
              </p>
            ))}
          </div>
        )}

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
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <Button
          className="w-full"
          disabled={subjectMode === "user" && !forUserId}
          onClick={() => setConfirmOpen(true)}
        >
          Book desk {desk.number}
        </Button>
        <Button variant="outline" className="w-full" disabled>
          Watch (Phase 5)
        </Button>
      </CardFooter>

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
    </Card>
  );
}

function formatTimeRange(start: string | Date, end: string | Date, timeZone: string): string {
  const format = (value: string | Date) =>
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(value));
  return `${format(start)}–${format(end)}`;
}
