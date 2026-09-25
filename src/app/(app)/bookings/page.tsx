"use client";

import Link from "next/link";
import { useState } from "react";
import { MapPinIcon } from "lucide-react";
import { toast } from "sonner";

import { currentMinutesInTimeZone } from "@/lib/time-slots";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/booking/desk-panel";

type When = "upcoming" | "past";

/** Deep-link query that opens the Floor Map on this booking's site/floor/date/time with the desk highlighted. */
function locateOnMapQuery(booking: {
  deskId: string;
  startAt: Date;
  endAt: Date;
  desk: { floor: { id: string; siteId: string; site: { timeZone: string } } };
}): Record<string, string> {
  const timeZone = booking.desk.floor.site.timeZone;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(booking.startAt),
  );
  const endMinutes = currentMinutesInTimeZone(timeZone, new Date(booking.endAt));
  return {
    site: booking.desk.floor.siteId,
    floor: booking.desk.floor.id,
    desk: booking.deskId,
    date,
    start: String(currentMinutesInTimeZone(timeZone, new Date(booking.startAt))),
    end: String(endMinutes === 0 ? 24 * 60 : endMinutes),
  };
}

export default function BookingsPage() {
  const [tab, setTab] = useState<When>("upcoming");
  const utils = api.useUtils();
  const bookings = api.booking.listMine.useQuery({ when: tab });

  const onMutationSettled = () => void utils.booking.listMine.invalidate();

  const cancelBooking = api.booking.cancel.useMutation({
    onSuccess: () => {
      toast.success("Booking cancelled");
      onMutationSettled();
    },
    onError: (error) => toast.error(error.message),
  });
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

  const actionsPending = cancelBooking.isPending || checkIn.isPending || endBooking.isPending;
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">My Bookings</h1>
        <p className="text-muted-foreground text-sm">Cancellation is allowed any time before a booking starts.</p>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="rounded-full" variant={tab === "upcoming" ? "default" : "outline"} onClick={() => setTab("upcoming")}>
          Upcoming
        </Button>
        <Button size="sm" className="rounded-full" variant={tab === "past" ? "default" : "outline"} onClick={() => setTab("past")}>
          Past
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tab === "upcoming" ? "Upcoming bookings" : "Past bookings"}</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.isPending ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : bookings.data?.length === 0 ? (
            <p className="text-muted-foreground text-sm">No {tab} bookings.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Desk</TableHead>
                  <TableHead>Site / Floor</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                  {tab === "upcoming" && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.data?.map((booking) => {
                  const timeZone = booking.desk.floor.site.timeZone;
                  const format = (value: Date) =>
                    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(
                      new Date(value),
                    );
                  return (
                    <TableRow key={booking.id}>
                      <TableCell>
                        {tab === "upcoming" ? (
                          <Link
                            href={{ pathname: "/floor-map", query: locateOnMapQuery(booking) }}
                            className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
                            title="Locate this desk on the floor map"
                          >
                            <MapPinIcon aria-hidden className="size-3.5" />
                            {booking.desk.number}
                          </Link>
                        ) : (
                          booking.desk.number
                        )}
                      </TableCell>
                      <TableCell>
                        {booking.desk.floor.site.name} / {booking.desk.floor.name}
                      </TableCell>
                      <TableCell>{new Date(booking.date).toISOString().slice(0, 10)}</TableCell>
                      <TableCell>
                        {format(booking.startAt)}–{format(booking.endAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={booking.status} />
                      </TableCell>
                      {tab === "upcoming" && (
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            {booking.status === "CONFIRMED" && new Date(booking.startAt) > now && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actionsPending}
                                onClick={() => cancelBooking.mutate({ bookingId: booking.id })}
                              >
                                Cancel
                              </Button>
                            )}
                            {booking.status === "CONFIRMED" && booking.desk.requiresCheckIn && (
                              <Button
                                size="sm"
                                disabled={actionsPending}
                                onClick={() => checkIn.mutate({ bookingId: booking.id })}
                              >
                                Check In
                              </Button>
                            )}
                            {/* A booking in progress (confirmed or checked in) can be ended early to free the desk. */}
                            {(booking.status === "CHECKED_IN" ||
                              (booking.status === "CONFIRMED" && new Date(booking.startAt) <= now)) && (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={actionsPending}
                                onClick={() => endBooking.mutate({ bookingId: booking.id })}
                              >
                                End Booking
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
