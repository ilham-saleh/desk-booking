"use client";

import Link from "next/link";
import { BellRing, MapPinIcon } from "lucide-react";
import { toast } from "sonner";

import { formatDisplayDate } from "@/lib/dates";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** My Bookings: desks the viewer asked to be told about, with a way to stop. Hidden when there are none. */
export function DeskWatchesCard() {
  const utils = api.useUtils();
  const watches = api.deskWatch.listMine.useQuery();
  const remove = api.deskWatch.remove.useMutation({
    onSuccess: () => {
      toast.success("Stopped watching");
      void utils.deskWatch.listMine.invalidate();
      void utils.deskWatch.status.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!watches.data || watches.data.length === 0) return null;

  return (
    <Card className="gap-0 py-0">
      <div className="border-b px-5 py-4">
        <h2 className="text-foreground flex items-center gap-2 text-sm font-semibold">
          <BellRing aria-hidden className="text-navy size-4" /> Desk watches
        </h2>
        <p className="text-muted-foreground mt-0.5 text-[0.8125rem]">You&apos;ll get a notification if one of these desks frees up on that day.</p>
      </div>
      <ul className="divide-y">
        {watches.data.map((watch) => (
          <li key={watch.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href={{
                  pathname: "/floor-map",
                  query: { site: watch.desk.floor.site.id, floor: watch.desk.floor.id, desk: watch.desk.id, date: watch.date },
                }}
                className="text-navy hover:bg-navy-soft -ml-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 font-semibold transition-colors"
                title="Locate this desk on the floor map"
              >
                <MapPinIcon aria-hidden className="size-3.5" />
                {watch.desk.number}
              </Link>
              <span className="text-muted-foreground truncate text-sm">
                {formatDisplayDate(watch.date, { year: true })} · {watch.desk.floor.site.name} / {watch.desk.floor.name}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ deskId: watch.desk.id, date: watch.date })}
              aria-label={`Stop watching desk ${watch.desk.number} on ${formatDisplayDate(watch.date)}`}
            >
              Stop watching
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
