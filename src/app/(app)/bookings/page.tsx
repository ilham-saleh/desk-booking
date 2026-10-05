"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { CalendarCheck, CalendarPlus, History, MapPinIcon } from "lucide-react";

import { locateOnMapQuery } from "@/lib/locate-on-map";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { TableSkeleton } from "@/components/ui/loading";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDisplayDate } from "@/lib/dates";
import { StatusBadge } from "@/components/booking/desk-panel";

type When = "upcoming" | "past";

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
    <PageContainer>
      <PageHeader
        title="My Bookings"
        description="Cancellation is allowed any time before a booking starts."
        actions={
          <Button asChild variant="brand">
            <Link href="/book">
              <CalendarPlus /> Book a desk
            </Link>
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as When)}>
        <TabsList>
          <TabsTrigger value="upcoming">
            <CalendarCheck className="size-3.5" /> Upcoming
          </TabsTrigger>
          <TabsTrigger value="past">
            <History className="size-3.5" /> Past
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="gap-0 overflow-hidden py-0">
          {bookings.isPending ? (
            <TableSkeleton rows={5} />
          ) : bookings.data?.length === 0 ? (
            <EmptyState
              icon={tab === "upcoming" ? CalendarCheck : History}
              title={tab === "upcoming" ? "No upcoming bookings" : "No past bookings"}
              description={tab === "upcoming" ? "When you book a desk it'll appear here, with a shortcut to find it on the map." : "Bookings you've completed or cancelled will show here."}
              action={
                tab === "upcoming" ? (
                  <Button asChild size="sm">
                    <Link href="/book">Book a desk</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Desk</TableHead>
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
                      <TableCell className="pl-5">
                        {tab === "upcoming" ? (
                          <Link
                            href={{ pathname: "/floor-map", query: locateOnMapQuery(booking) }}
                            className="text-navy hover:bg-navy-soft -ml-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-semibold transition-colors"
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
                      <TableCell>{formatDisplayDate(new Date(booking.date).toISOString().slice(0, 10), { year: true })}</TableCell>
                      <TableCell className="tabular-nums">
                        {format(booking.startAt)}–{format(booking.endAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={booking.status} />
                      </TableCell>
                      {tab === "upcoming" && (
                        <TableCell className="pr-5">
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
                                variant="brand"
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
      </Card>
    </PageContainer>
  );
}
