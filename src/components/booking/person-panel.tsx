"use client";

import { MapPinIcon } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/loading";
import { DetailRow, SidePanel, SidePanelBody, SidePanelHeader, SidePanelSection } from "@/components/ui/side-panel";
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

  if (!open) return null;

  return (
    <SidePanel dockAt="xl" aria-label="Person details">
      <SidePanelHeader
        title={person?.name ?? (card.isPending ? "Loading…" : "Person")}
        subtitle={person ? [person.title, person.department].filter(Boolean).join(" · ") || "Employee" : undefined}
        onClose={() => onOpenChange(false)}
        status={person && !person.isActive ? <Badge variant="muted" dot>Inactive</Badge> : undefined}
      />

      <SidePanelBody>
        {card.isPending && (
          <SidePanelSection>
            <div className="flex items-center gap-3">
              <Skeleton className="size-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </SidePanelSection>
        )}
        {card.error && (
          <SidePanelSection>
            <p role="alert" className="text-danger text-sm">
              {card.error.message}
            </p>
          </SidePanelSection>
        )}

        {person && (
          <>
            <SidePanelSection>
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  <AvatarFallback className="bg-navy text-base text-white">{person.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <dl className="min-w-0 flex-1 space-y-1.5">
                  <DetailRow label="Email">
                    <span className="block truncate">{person.email}</span>
                  </DetailRow>
                  <DetailRow label="Department">{person.department ?? "—"}</DetailRow>
                  <DetailRow label="Title">{person.title ?? "—"}</DetailRow>
                </dl>
              </div>
            </SidePanelSection>

            <SidePanelSection title="Sitting now">
              {card.data?.currentBooking ? (
                <BookingCard booking={card.data.currentBooking} onLocate={onLocate} />
              ) : (
                <p className="text-muted-foreground text-sm">No desk booked right now</p>
              )}
            </SidePanelSection>

            <SidePanelSection title="Next booking">
              {card.data?.nextBooking ? (
                <BookingCard booking={card.data.nextBooking} onLocate={onLocate} />
              ) : (
                <p className="text-muted-foreground text-sm">No upcoming booking</p>
              )}
            </SidePanelSection>

            {card.data?.hiddenByPolicy && (
              <SidePanelSection>
                <p role="status" className="bg-surface-muted text-muted-foreground rounded-xl p-3 text-xs">
                  Some bookings aren&apos;t shown because their site keeps coworker bookings private.
                </p>
              </SidePanelSection>
            )}
          </>
        )}
      </SidePanelBody>
    </SidePanel>
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
    <div className="bg-surface-muted flex items-center justify-between gap-3 rounded-xl border p-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-foreground flex items-center gap-2 font-semibold">
          Desk {booking.desk.number} <StatusBadge status={booking.status} />
        </p>
        <p className="text-muted-foreground truncate text-xs">
          {booking.site.name} · {booking.floor.name}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">{formatWhen(booking)}</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => onLocate(booking)}>
        <MapPinIcon aria-hidden className="size-3.5" />
        Locate
      </Button>
    </div>
  );
}
