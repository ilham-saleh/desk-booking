import Link from "next/link";

import { auth } from "@/server/auth";
import { api } from "@/lib/trpc/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function HomePage() {
  const session = await auth();
  const upcoming = await api.booking.listMine({ when: "upcoming" });
  const next = upcoming[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {session!.user.name.split(" ")[0]}</h1>
        <p className="text-muted-foreground text-sm">Here&apos;s what&apos;s next.</p>
      </div>

      <div className="flex gap-3">
        <Button asChild>
          <Link href="/book">Book a Desk</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/bookings">My Bookings</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Next booking</CardTitle>
          <CardDescription>
            {upcoming.length > 1 ? `You have ${upcoming.length} upcoming bookings.` : "Your next upcoming booking."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {next ? (
            <p className="text-sm">
              Desk {next.desk.number} at {next.desk.floor.site.name} / {next.desk.floor.name} on{" "}
              {new Date(next.date).toISOString().slice(0, 10)},{" "}
              {new Intl.DateTimeFormat("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: next.desk.floor.site.timeZone,
              }).format(new Date(next.startAt))}
              –
              {new Intl.DateTimeFormat("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: next.desk.floor.site.timeZone,
              }).format(new Date(next.endAt))}
              .
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">No upcoming bookings — go book a desk.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
