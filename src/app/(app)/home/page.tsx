import Link from "next/link";
import { ArrowRight, CalendarCheck, CalendarPlus, Clock, MapPin, MapPinned } from "lucide-react";

import { auth } from "@/server/auth";
import { locateOnMapQuery } from "@/lib/locate-on-map";
import { api } from "@/lib/trpc/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-header";
import { formatDisplayDate } from "@/lib/dates";
import { StatusBadge } from "@/components/booking/desk-panel";

function timeRange(startAt: Date, endAt: Date, timeZone: string) {
  const format = (value: Date) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(value));
  return `${format(startAt)}–${format(endAt)}`;
}

export default async function HomePage() {
  const session = await auth();
  const upcoming = await api.booking.listMine({ when: "upcoming" });
  const next = upcoming[0];
  const later = upcoming.slice(1, 4);
  const firstName = session!.user.name.split(" ")[0];

  return (
    <PageContainer className="max-w-[1100px]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">Here&apos;s what&apos;s next.</p>
          <h1 className="type-page-title text-[1.75rem] leading-9">
            Welcome back, {firstName}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/floor-map">
              <MapPinned /> Floor Map
            </Link>
          </Button>
          <Button asChild variant="brand">
            <Link href="/book">
              <CalendarPlus /> Book a desk
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Next booking */}
        <Card className="relative gap-0 overflow-hidden py-0">
          {next ? (
            <div className="flex h-full flex-col">
              <div className="bg-navy relative overflow-hidden px-6 pt-5 pb-6 text-white">
                {/* Brand "bridge" motif, echoing the logo mark */}
                <div aria-hidden className="absolute -top-4 right-6 flex gap-2 opacity-[0.14]">
                  <span className="bg-light-blue h-20 w-5 rounded-b-sm" />
                  <span className="bg-light-blue h-28 w-5 rounded-b-sm" />
                  <span className="bg-light-blue h-36 w-5 rounded-b-sm" />
                </div>
                <p className="text-light-blue text-xs font-semibold tracking-[0.06em] uppercase">Your next booking</p>
                <p className="mt-2 text-[2rem] leading-10 font-semibold tracking-[-0.02em]">Desk {next.desk.number}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75">
                  <MapPin className="size-3.5" />
                  {next.desk.floor.name} · {next.desk.floor.site.name}
                </p>
              </div>
              <div className="flex flex-1 flex-wrap items-center justify-between gap-4 px-6 py-5">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <span className="flex items-center gap-2 text-sm">
                    <CalendarCheck className="text-muted-foreground size-4" />
                    <span className="text-foreground font-semibold">{formatDisplayDate(new Date(next.date).toISOString().slice(0, 10))}</span>
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    <Clock className="text-muted-foreground size-4" />
                    <span className="text-foreground font-semibold tabular-nums">
                      {timeRange(next.startAt, next.endAt, next.desk.floor.site.timeZone)}
                    </span>
                  </span>
                  <StatusBadge status={next.status} />
                  {next.desk.requiresCheckIn && next.status === "CONFIRMED" && <Badge variant="outline">Check-in required</Badge>}
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={{ pathname: "/floor-map", query: locateOnMapQuery(next) }}>
                    <MapPinned /> Locate on map
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={CalendarPlus}
              title="No upcoming bookings"
              description="Find a free desk for the day you're coming in — it takes a few seconds."
              action={
                <Button asChild variant="brand" size="sm">
                  <Link href="/book">Book a desk</Link>
                </Button>
              }
              className="py-14"
            />
          )}
        </Card>

        {/* Summary */}
        <Card className="gap-0 py-0">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="type-card-title">Coming up</h2>
            <span className="text-muted-foreground text-xs tabular-nums">
              {upcoming.length} upcoming booking{upcoming.length === 1 ? "" : "s"}
            </span>
          </div>
          {later.length === 0 ? (
            <p className="text-muted-foreground px-5 py-6 text-sm">{next ? "Nothing else booked yet." : "Your bookings will appear here."}</p>
          ) : (
            <ul className="divide-y">
              {later.map((booking) => (
                <li key={booking.id}>
                  <Link
                    href={{ pathname: "/floor-map", query: locateOnMapQuery(booking) }}
                    className="hover:bg-surface-muted group flex items-center justify-between gap-3 px-5 py-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-foreground text-sm font-semibold">
                        {formatDisplayDate(new Date(booking.date).toISOString().slice(0, 10))} · Desk {booking.desk.number}
                      </p>
                      <p className="text-muted-foreground truncate text-xs tabular-nums">
                        {timeRange(booking.startAt, booking.endAt, booking.desk.floor.site.timeZone)} · {booking.desk.floor.name},{" "}
                        {booking.desk.floor.site.name}
                      </p>
                    </div>
                    <ArrowRight className="text-muted-foreground group-hover:text-navy size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-auto border-t px-5 py-3">
            <Link href="/bookings" className="text-navy inline-flex items-center gap-1 text-[0.8125rem] font-semibold underline-offset-4 hover:underline">
              All my bookings <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
