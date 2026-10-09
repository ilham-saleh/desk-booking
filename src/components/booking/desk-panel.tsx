"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Lock } from "lucide-react";
import { toast } from "sonner";

import type { Role } from "@/generated/prisma/enums";
import { canBookForOthersRole } from "@/lib/roles";
import { formatDays, WEEKDAY_LONG, dayOfWeekForDate } from "@/lib/restrictions";
import { describeAssignmentAudience } from "@/lib/restriction-labels";
import {
  SLOT_MINUTES,
  buildTimeOptions,
  currentMinutesInTimeZone,
  formatMinutesLabel,
  todayInTimeZone,
} from "@/lib/time-slots";
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
import { Label } from "@/components/ui/label";
import { Skeleton, Spinner } from "@/components/ui/loading";
import { DetailRow, SidePanel, SidePanelBody, SidePanelHeader, SidePanelSection } from "@/components/ui/side-panel";
import { formatDisplayDate } from "@/lib/dates";
import { DateStepper, TimeRangeFields } from "@/components/booking/booking-fields";
import { BookingSubjectFields, type BookingSubjectMode, type BookingSubjectUser } from "@/components/booking/subject-fields";
import { Swatch } from "@/components/ui/combobox";

export interface DeskPanelDesk {
  id: string;
  number: string;
  name: string | null;
  requiresCheckIn: boolean;
  isActive: boolean;
}

export interface DeskPanelSite {
  id: string;
  name: string;
  timeZone: string;
  operatingHoursStart: number;
  operatingHoursEnd: number;
}

export interface DeskPanelBooking {
  id: string;
  status: "CONFIRMED" | "CHECKED_IN" | "CANCELLED" | "AUTO_CANCELLED" | "COMPLETED";
  userId: string | null;
  bookedById: string;
  startAt: string | Date;
  endAt: string | Date;
  isOwn: boolean;
  /** Resolved on the server with the same rule the cancel/end mutations enforce. */
  canManage: boolean;
  occupantLabel: string;
  occupant: { name: string; email: string | null; department: string | null; title: string | null; isGuest: boolean } | null;
  bookedByLabel: string | null;
}

export interface TimeWindowMinutes {
  startMinutes: number;
  endMinutes: number;
}

function formatTime(value: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(value));
}

function isInProgress(booking: DeskPanelBooking, now: Date): boolean {
  return new Date(booking.startAt) <= now && now < new Date(booking.endAt);
}

/** Whether the booking occupies any part of the site-local [start, end) window on its own date. */
function overlapsWindow(booking: DeskPanelBooking, window: TimeWindowMinutes, timeZone: string): boolean {
  const bookingStart = currentMinutesInTimeZone(timeZone, new Date(booking.startAt));
  const rawEnd = currentMinutesInTimeZone(timeZone, new Date(booking.endAt));
  const bookingEnd = rawEnd === 0 ? 24 * 60 : rawEnd; // a booking ending at midnight
  return bookingStart < window.endMinutes && window.startMinutes < bookingEnd;
}

/**
 * Right-side desk details panel on the Floor Map: who holds the desk for the
 * selected time (with their details), booking controls, "Restricted to"
 * (every restriction block + shift configured in the Editing Platform,
 * straight from the database), the day's bookings and location.
 * Inspect + book only — nothing here can edit or move a desk.
 */
export function DeskPanel({
  open,
  onOpenChange,
  desk,
  site,
  floorName,
  viewedDate,
  viewedWindow,
  bookings,
  currentUserRole,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  desk: DeskPanelDesk;
  site: DeskPanelSite;
  floorName: string;
  /** The date selected on the Floor Map — the booking form starts from it. */
  viewedDate: string;
  /** The time window selected on the Floor Map — decides which booking is "current" and pre-fills the form. */
  viewedWindow: TimeWindowMinutes;
  /** Active bookings for this desk on the viewed date. */
  bookings: DeskPanelBooking[];
  currentUserId: string;
  currentUserRole: Role;
  onChanged: () => void;
}) {
  const now = new Date();
  const blockingBookings = bookings.filter((b) => overlapsWindow(b, viewedWindow, site.timeZone));

  const utils = api.useUtils();
  const onMutationSettled = () => {
    void utils.booking.getFloorAvailability.invalidate();
    onChanged();
  };

  const details = api.desk.get.useQuery({ deskId: desk.id }, { enabled: open });
  const assignments = details.data?.restrictionAssignments ?? [];

  if (!open) return null;

  const isBooked = blockingBookings.length > 0;
  const features = details.data?.attributes ?? [];

  return (
    <SidePanel dockAt="xl" aria-label={`Desk ${desk.number} details`}>
      <SidePanelHeader
        title={`Desk ${desk.number}`}
        subtitle={`${floorName} · ${site.name}`}
        onClose={() => onOpenChange(false)}
        status={
          <>
            {!desk.isActive ? (
              <Badge variant="muted" dot>
                Inactive
              </Badge>
            ) : isBooked ? (
              <Badge variant="default" dot>
                Booked
              </Badge>
            ) : (
              <Badge variant="success" dot>
                Available
              </Badge>
            )}
            {details.data?.spaceType && <Badge variant="outline">{details.data.spaceType}</Badge>}
            {desk.requiresCheckIn && <Badge variant="brand">Check-in required</Badge>}
          </>
        }
      >
        {(desk.name || details.data?.description) && (
          <div className="mt-3 space-y-1">
            {desk.name && <p className="text-foreground text-sm font-medium">{desk.name}</p>}
            {details.data?.description && <p className="text-muted-foreground text-[0.8125rem] leading-5">{details.data.description}</p>}
          </div>
        )}
      </SidePanelHeader>

      <SidePanelBody>
        {!desk.isActive ? (
          <SidePanelSection>
            <p role="status" className="bg-surface-muted text-text-secondary rounded-xl p-3 text-sm">
              This desk is inactive and can&apos;t be booked.
            </p>
          </SidePanelSection>
        ) : (
          <>
            {isBooked && (
              <SidePanelSection title="Occupied for this time">
                {blockingBookings.map((booking) => (
                  <BookingCard key={booking.id} booking={booking} site={site} desk={desk} now={now} onSettled={onMutationSettled} />
                ))}
              </SidePanelSection>
            )}

            <SidePanelSection title={isBooked ? "Book another time" : "Booking"}>
              <BookingForm
                desk={desk}
                site={site}
                viewedDate={viewedDate}
                viewedWindow={viewedWindow}
                bookings={bookings}
                currentUserRole={currentUserRole}
                onBooked={onMutationSettled}
              />
            </SidePanelSection>
          </>
        )}

        {/* Restricted to — from the desk's restriction blocks in the database */}
        <SidePanelSection title="Restricted to">
          {details.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-4/5" />
            </div>
          ) : assignments.length === 0 ? (
            <AudienceRow initial="All" title="Anyone can book" detail="No day-specific restrictions on this desk" />
          ) : (
            <ul className="space-y-3">
              {assignments.map((assignment) => {
                const audience = describeAssignmentAudience(assignment);
                const color = assignment.restrictionMode === "CUSTOM" ? assignment.restriction?.color : null;
                return (
                  <li key={assignment.id}>
                    <AudienceRow
                      initial={audience.charAt(0).toUpperCase()}
                      color={color}
                      title={audience}
                      detail={`${assignment.shift.name} · ${formatDays(assignment.shift.daysOfWeek)}${
                        assignment.advanceBookingWindowDays ? ` · up to ${assignment.advanceBookingWindowDays} days ahead` : ""
                      }`}
                    />
                  </li>
                );
              })}
              {/* Days no block covers are open to everyone (see evaluateDeskEligibility). */}
              <li>
                <AudienceRow initial="A" title="Anyone can book" detail="All other days" />
              </li>
            </ul>
          )}
        </SidePanelSection>

        <SidePanelSection title={`Bookings · ${formatDisplayDate(viewedDate)}`}>
          {bookings.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bookings on this date</p>
          ) : (
            <ul className="space-y-1">
              {bookings.map((booking) => (
                <BookingRow key={booking.id} booking={booking} site={site} desk={desk} now={now} onSettled={onMutationSettled} />
              ))}
            </ul>
          )}
        </SidePanelSection>

        {features.length > 0 && (
          <SidePanelSection title="Desk features">
            <ul className="flex flex-wrap gap-1.5">
              {features.map((a) => (
                <li key={a.id}>
                  <Badge variant="secondary" className="px-3 py-1">
                    {a.type.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                  </Badge>
                </li>
              ))}
            </ul>
          </SidePanelSection>
        )}
      </SidePanelBody>
    </SidePanel>
  );
}

function AudienceRow({ initial, title, detail, color }: { initial: string; title: string; detail: string; color?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar className="size-9 rounded-xl">
        <AvatarFallback className="rounded-xl text-xs">{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 pt-0.5">
        <p className="text-foreground flex items-center gap-1.5 text-sm font-medium">
          {color && <Swatch color={color} />}
          <span className="truncate">{title}</span>
        </p>
        <p className="text-muted-foreground text-xs leading-5">{detail}</p>
      </div>
    </div>
  );
}

export function StatusBadge({ status, className }: { status: DeskPanelBooking["status"]; className?: string }) {
  const labels: Record<DeskPanelBooking["status"], string> = {
    CONFIRMED: "Confirmed",
    CHECKED_IN: "Checked in",
    CANCELLED: "Cancelled",
    AUTO_CANCELLED: "Auto-cancelled",
    COMPLETED: "Completed",
  };
  const variant =
    status === "CHECKED_IN" ? "success" : status === "CONFIRMED" ? "brand" : status === "COMPLETED" ? "muted" : "destructive";
  return (
    <Badge variant={variant} dot className={className}>
      {labels[status] ?? status}
    </Badge>
  );
}

type BookingAction = "checkIn" | "end" | "cancel";

/**
 * Check-in / End Booking / Cancel for one booking, with a confirmation step
 * before ending or cancelling. Buttons are only offered when the server said
 * the viewer may manage the booking (owner, or admin of this site); the
 * mutations re-check that regardless.
 */
function useBookingActions(
  booking: DeskPanelBooking,
  desk: DeskPanelDesk,
  timeZone: string,
  now: Date,
  onSettled: () => void,
) {
  const [confirming, setConfirming] = useState<Exclude<BookingAction, "checkIn"> | null>(null);

  const onError = (error: { message: string }) => {
    toast.error(error.message);
    setConfirming(null);
  };
  const checkIn = api.booking.checkIn.useMutation({
    onSuccess: () => {
      toast.success("Checked in");
      onSettled();
    },
    onError,
  });
  const endBooking = api.booking.endBooking.useMutation({
    onSuccess: () => {
      toast.success(`Booking ended — desk ${desk.number} is free`);
      setConfirming(null);
      onSettled();
    },
    onError,
  });
  const cancelBooking = api.booking.cancel.useMutation({
    onSuccess: () => {
      toast.success("Booking cancelled");
      setConfirming(null);
      onSettled();
    },
    onError,
  });

  const started = new Date(booking.startAt) <= now;
  const ended = new Date(booking.endAt) <= now;
  const available: BookingAction[] = [];
  if (booking.canManage && !ended) {
    if (booking.status === "CONFIRMED" && desk.requiresCheckIn) available.push("checkIn");
    if (booking.status === "CHECKED_IN" || (booking.status === "CONFIRMED" && started)) available.push("end");
    if (booking.status === "CONFIRMED" && !started) available.push("cancel");
  }
  const pending = checkIn.isPending || endBooking.isPending || cancelBooking.isPending;

  function run(action: BookingAction) {
    if (action === "checkIn") checkIn.mutate({ bookingId: booking.id });
    else setConfirming(action);
  }
  function confirm() {
    if (confirming === "end") endBooking.mutate({ bookingId: booking.id });
    if (confirming === "cancel") cancelBooking.mutate({ bookingId: booking.id });
  }

  const dialog = (
    <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirming === "end" ? "End this booking?" : "Cancel this booking?"}</DialogTitle>
          <DialogDescription>
            {booking.isOwn ? "Your booking" : `${booking.occupantLabel}'s booking`} of desk {desk.number} ({formatTime(booking.startAt, timeZone)}–{formatTime(booking.endAt, timeZone)}) will be{" "}
            {confirming === "end" ? "ended now and the desk released for others" : "cancelled"}.
            {!booking.isOwn && " They will no longer hold this desk."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirming(null)} disabled={pending}>
            Keep booking
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? "Working…" : confirming === "end" ? "End booking" : "Cancel booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { available, pending, run, dialog };
}

const ACTION_LABELS: Record<BookingAction, string> = { checkIn: "Check In", end: "End Booking", cancel: "Cancel Booking" };

/** The booking occupying the desk for the selected time: who holds it, their details, and any actions the viewer may take. */
function BookingCard({
  booking,
  site,
  desk,
  now,
  onSettled,
}: {
  booking: DeskPanelBooking;
  site: DeskPanelSite;
  desk: DeskPanelDesk;
  now: Date;
  onSettled: () => void;
}) {
  const actions = useBookingActions(booking, desk, site.timeZone, now, onSettled);
  const inProgress = isInProgress(booking, now);
  const occupant = booking.occupant;

  return (
    <div className="bg-surface-muted space-y-3 rounded-2xl border p-4" role="group" aria-label="Current booking">
      <div className="flex items-start gap-3">
        <Avatar className="size-11">
          <AvatarFallback className="bg-navy text-sm text-white">{booking.occupantLabel.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate font-semibold">
            {booking.occupantLabel}
            {booking.isOwn && <span className="text-muted-foreground font-normal"> (you)</span>}
          </p>
          {occupant && (occupant.title || occupant.department) && (
            <p className="text-muted-foreground truncate text-xs">{[occupant.title, occupant.department].filter(Boolean).join(" · ")}</p>
          )}
          {occupant?.email && <p className="text-muted-foreground truncate text-xs">{occupant.email}</p>}
          {occupant?.isGuest && <p className="text-muted-foreground text-xs">Guest</p>}
        </div>
        <StatusBadge status={booking.status} />
      </div>
      <div className="bg-surface flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
        <span className="text-muted-foreground">{inProgress ? "Booked until" : "Booked"}</span>
        <span className="text-foreground font-semibold tabular-nums">
          {formatTime(booking.startAt, site.timeZone)}–{formatTime(booking.endAt, site.timeZone)}
        </span>
      </div>
      {booking.bookedByLabel && <p className="text-muted-foreground text-xs">Booked by {booking.bookedByLabel}</p>}

      {actions.available.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.available.map((action) => (
            <Button
              key={action}
              size="sm"
              className="flex-1"
              variant={action === "checkIn" ? "brand" : action === "end" ? "destructive" : "outline"}
              onClick={() => actions.run(action)}
              disabled={actions.pending}
            >
              {ACTION_LABELS[action]}
            </Button>
          ))}
        </div>
      )}
      {actions.dialog}
    </div>
  );
}

/** One line in the day's booking list; standard users see who holds the desk, admins also get actions. */
function BookingRow({
  booking,
  site,
  desk,
  now,
  onSettled,
}: {
  booking: DeskPanelBooking;
  site: DeskPanelSite;
  desk: DeskPanelDesk;
  now: Date;
  onSettled: () => void;
}) {
  const actions = useBookingActions(booking, desk, site.timeZone, now, onSettled);
  return (
    <li className="hover:bg-surface-muted -mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors">
      <div className="min-w-0">
        <p className="text-foreground text-sm font-medium tabular-nums">
          {formatTime(booking.startAt, site.timeZone)}–{formatTime(booking.endAt, site.timeZone)}
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {booking.occupantLabel}
          {booking.isOwn && " (you)"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <StatusBadge status={booking.status} />
        {actions.available
          .filter((action) => action !== "checkIn")
          .map((action) => (
            <Button key={action} size="sm" variant="ghost" className="h-7 px-2.5" disabled={actions.pending} onClick={() => actions.run(action)}>
              {action === "end" ? "End" : "Cancel"}
            </Button>
          ))}
      </div>
      {actions.dialog}
    </li>
  );
}

function BookingForm({
  desk,
  site,
  viewedDate,
  viewedWindow,
  bookings,
  currentUserRole,
  onBooked,
}: {
  desk: DeskPanelDesk;
  site: DeskPanelSite;
  viewedDate: string;
  viewedWindow: TimeWindowMinutes;
  bookings: DeskPanelBooking[];
  currentUserRole: Role;
  onBooked: () => void;
}) {
  // Display gate only — booking.create enforces per-site "book for others" permission.
  const isAdmin = canBookForOthersRole(currentUserRole);
  const timeOptions = buildTimeOptions(site.operatingHoursStart, site.operatingHoursEnd);

  const [date, setDate] = useState(viewedDate);
  const [startMinutes, setStartMinutes] = useState<number>(viewedWindow.startMinutes);
  const [endMinutes, setEndMinutes] = useState<number>(viewedWindow.endMinutes);
  const [subjectMode, setSubjectMode] = useState<BookingSubjectMode>("self");
  const [forUser, setForUser] = useState<BookingSubjectUser | null>(null);
  const [guestName, setGuestName] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Same engine the server enforces — explains restriction/shift/window for the
  // chosen date + occupant (the selected employee, a guest, or the viewer).
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const eligibility = api.desk.checkEligibility.useQuery(
    {
      deskId: desk.id,
      date,
      occupantUserId: subjectMode === "user" && forUser ? forUser.id : undefined,
      forGuest: subjectMode === "guest" ? true : undefined,
    },
    { enabled: validDate && (subjectMode !== "user" || forUser !== null), placeholderData: (prev) => prev },
  );
  const blocked = eligibility.data ? !eligibility.data.eligible : false;

  // Pre-check against the bookings already loaded for the viewed date; the server re-checks on write.
  const conflicts =
    date === viewedDate ? bookings.filter((b) => overlapsWindow(b, { startMinutes, endMinutes }, site.timeZone)) : [];

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
      forUserId: subjectMode === "user" && forUser ? forUser.id : undefined,
      guestName: subjectMode === "guest" && guestName ? guestName : undefined,
    });
  }

  const occupantName =
    subjectMode === "guest" ? guestName.trim() || "Guest" : subjectMode === "user" ? (forUser?.name ?? "Another employee") : "You";
  const weekday = validDate ? WEEKDAY_LONG[dayOfWeekForDate(date)] : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3.5">
        {isAdmin ? (
          <BookingSubjectFields
            mode={subjectMode}
            onModeChange={setSubjectMode}
            forUser={forUser}
            onForUserChange={setForUser}
            guestName={guestName}
            onGuestNameChange={setGuestName}
          />
        ) : (
          <DetailRow label="Occupant">You</DetailRow>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="desk-panel-date">Date</Label>
          <DateStepper id="desk-panel-date" min={todayInTimeZone(site.timeZone)} value={date} onChange={setDate} />
        </div>

        <TimeRangeFields
          idPrefix="desk-panel"
          startOptions={timeOptions.slice(0, -1)}
          endOptions={endOptions}
          start={startMinutes}
          end={endMinutes}
          onStartChange={(next) => {
            setStartMinutes(next);
            if (endMinutes <= next) setEndMinutes(Math.min(next + SLOT_MINUTES, site.operatingHoursEnd));
          }}
          onEndChange={setEndMinutes}
        />
      </div>

      {conflicts.length > 0 && (
        <Notice tone="warning" title={`Desk ${desk.number} is already booked during this time.`}>
          <ul className="mt-1 space-y-0.5 tabular-nums">
            {conflicts.map((b) => (
              <li key={b.id}>
                {formatTime(b.startAt, site.timeZone)}–{formatTime(b.endAt, site.timeZone)} — {b.occupantLabel}
              </li>
            ))}
          </ul>
          <p className="mt-1">Pick a start or end time outside these hours.</p>
        </Notice>
      )}

      {blocked && eligibility.data && (
        <Notice
          tone="restricted"
          title={`${
            subjectMode === "user"
              ? `${forUser?.name ?? "This person"} can't book this desk`
              : subjectMode === "guest"
                ? "This desk can't be booked for a guest"
                : "You can't book this desk"
          } on ${weekday}.`}
        >
          <p className="mt-1">{eligibility.data.reason}</p>
        </Notice>
      )}
      {!blocked && conflicts.length === 0 && eligibility.data?.eligible && (
        <p className="text-success flex items-center gap-1.5 text-xs font-medium" role="status">
          <CheckCircle2 className="size-3.5" />
          {subjectMode === "user" ? `${forUser?.name ?? "They"} can book` : subjectMode === "guest" ? "A guest can book" : "You're eligible to book"} this
          desk on {weekday}.
        </p>
      )}

      <Button
        variant="brand"
        size="lg"
        className="w-full"
        disabled={
          (subjectMode === "user" && !forUser) || (subjectMode === "guest" && !guestName.trim()) || blocked || !validDate || conflicts.length > 0
        }
        onClick={() => setConfirmOpen(true)}
      >
        Book desk {desk.number}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm booking</DialogTitle>
            <DialogDescription>Check the details below, then confirm.</DialogDescription>
          </DialogHeader>
          <dl className="bg-surface-muted space-y-2.5 rounded-xl border p-4">
            <DetailRow label="Desk">
              {desk.number} · {site.name}
            </DetailRow>
            <DetailRow label="Occupant">{subjectMode === "guest" ? `${occupantName} (guest)` : occupantName}</DetailRow>
            <DetailRow label="Date">{validDate ? formatDisplayDate(date, { year: true }) : date}</DetailRow>
            <DetailRow label="Time">
              <span className="tabular-nums">
                {formatMinutesLabel(startMinutes)}–{formatMinutesLabel(endMinutes)}
              </span>
            </DetailRow>
          </dl>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="brand" onClick={submit} disabled={createBooking.isPending}>
              {createBooking.isPending && <Spinner />}
              {createBooking.isPending ? "Booking…" : "Confirm booking"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Inline, contextual message inside a panel. Tone is echoed by an icon and title text, not colour alone. */
export function Notice({
  tone,
  title,
  children,
}: {
  tone: "warning" | "restricted" | "info";
  title: string;
  children?: React.ReactNode;
}) {
  const styles = {
    warning: "border-[#f5d2b3] bg-warning-soft text-[#6b3608]",
    restricted: "border-[#f5d2b3] bg-[#fff7f1] text-[#6b3608]",
    info: "border-light-blue bg-navy-soft text-navy",
  }[tone];
  const Icon = tone === "restricted" ? Lock : tone === "warning" ? AlertTriangle : Info;
  return (
    <div role="status" className={`flex gap-2.5 rounded-xl border p-3 text-[0.8125rem] leading-5 ${styles}`}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}
