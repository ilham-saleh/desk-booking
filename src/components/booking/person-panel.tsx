"use client";

import { MapPinIcon } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/booking/desk-panel";

export interface PersonPanelBooking {
  id: string;
  status: "CONFIRMED" | "CHECKED_IN" | "CANCELLED" | "AUTO_CANCELLED" | "COMPLETED";
  startAt: string | Date;
  endAt: string | Date;
  desk: { id: string; number: string };
  floor: { id: string; name: string };
  site: { id: string; name: string; timeZone: string };
}

function formatWhen(booking: PersonPanelBooking): string {
  const tz = booking.site.timeZone;
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: tz,
  }).format(new Date(booking.startAt));
  const time = (value: string | Date) =>
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(
      new Date(value),
    );
  return `${day}, ${time(booking.startAt)}–${time(booking.endAt)}`;
}

/**
 * Right-side card for a colleague found via search: directory details plus
 * the booking in progress and the next upcoming one (each with "Locate on
 * map"). Read-only — booking actions live in the desk panel.
 */
export function PersonPanel({
  open,
  onOpenChange,
  userId,
  onLocate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onLocate: (booking: PersonPanelBooking) => void;
}) {
  const card = api.search.person.useQuery({ userId: userId! }, { enabled: open && !!userId });
  const person = card.data?.person;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{person?.name ?? "Person"}</SheetTitle>
          <SheetDescription>
            {person
              ? [person.title, person.department].filter(Boolean).join(" · ") || "Employee"
              : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 p-4 text-sm">
          {card.isPending && <p className="text-muted-foreground">Loading details…</p>}
          {card.error && (
            <p role="alert" className="text-destructive">
              {card.error.message}
            </p>
          )}

          {person && (
            <>
              <div className="flex items-center gap-3">
                <Avatar className="size-14">
                  <AvatarFallback className="text-lg font-medium">
                    {person.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <dl className="grid gap-0.5">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-24 shrink-0">Email</dt>
                    <dd className="truncate">{person.email}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-24 shrink-0">Department</dt>
                    <dd>{person.department ?? "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground w-24 shrink-0">Title</dt>
                    <dd>{person.title ?? "—"}</dd>
                  </div>
                  {!person.isActive && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground w-24 shrink-0">Status</dt>
                      <dd>Inactive</dd>
                    </div>
                  )}
                </dl>
              </div>

              <section className="space-y-2 border-t pt-4" aria-labelledby="person-current-heading">
                <h3 id="person-current-heading" className="font-medium">
                  Sitting now
                </h3>
                {card.data?.currentBooking ? (
                  <BookingCard booking={card.data.currentBooking} onLocate={onLocate} />
                ) : (
                  <p className="text-muted-foreground">No desk booked right now</p>
                )}
              </section>

              <section className="space-y-2 border-t pt-4" aria-labelledby="person-next-heading">
                <h3 id="person-next-heading" className="font-medium">
                  Next booking
                </h3>
                {card.data?.nextBooking ? (
                  <BookingCard booking={card.data.nextBooking} onLocate={onLocate} />
                ) : (
                  <p className="text-muted-foreground">No upcoming booking</p>
                )}
              </section>

              {card.data?.hiddenByPolicy && (
                <p
                  role="status"
                  className="text-muted-foreground bg-muted/40 rounded-md border p-3 text-xs"
                >
                  Some bookings aren&apos;t shown because their site keeps coworker bookings
                  private.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function BookingCard({
  booking,
  onLocate,
}: {
  booking: PersonPanelBooking;
  onLocate: (booking: PersonPanelBooking) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="font-medium">
          Desk {booking.desk.number} <StatusBadge status={booking.status} className="ml-1" />
        </p>
        <p className="text-muted-foreground text-xs">
          {booking.site.name} · {booking.floor.name}
        </p>
        <p className="text-muted-foreground text-xs">{formatWhen(booking)}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => onLocate(booking)}>
        <MapPinIcon aria-hidden className="size-3.5" />
        Locate
      </Button>
    </div>
  );
}
