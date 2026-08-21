"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type When = "upcoming" | "past";

export default function BookingsPage() {
  const [tab, setTab] = useState<When>("upcoming");
  const utils = api.useUtils();
  const bookings = api.booking.listMine.useQuery({ when: tab });

  const cancelBooking = api.booking.cancel.useMutation({
    onSuccess: () => {
      toast.success("Booking cancelled");
      void utils.booking.listMine.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">My Bookings</h1>
        <p className="text-muted-foreground text-sm">Cancellation is allowed any time before a booking starts.</p>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={tab === "upcoming" ? "default" : "outline"} onClick={() => setTab("upcoming")}>
          Upcoming
        </Button>
        <Button size="sm" variant={tab === "past" ? "default" : "outline"} onClick={() => setTab("past")}>
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
                      <TableCell>{booking.desk.number}</TableCell>
                      <TableCell>
                        {booking.desk.floor.site.name} / {booking.desk.floor.name}
                      </TableCell>
                      <TableCell>{new Date(booking.date).toISOString().slice(0, 10)}</TableCell>
                      <TableCell>
                        {format(booking.startAt)}–{format(booking.endAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{booking.status}</Badge>
                      </TableCell>
                      {tab === "upcoming" && (
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={cancelBooking.isPending}
                            onClick={() => cancelBooking.mutate({ bookingId: booking.id })}
                          >
                            Cancel
                          </Button>
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
