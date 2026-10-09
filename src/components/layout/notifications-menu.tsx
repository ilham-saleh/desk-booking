"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Bell, BellRing, CalendarX2, Clock, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/loading";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Unread count refresh while the menu is closed; alerts are created by other people's actions and the worker. */
const UNREAD_POLL_MS = 60_000;

const TYPE_ICONS: Record<string, LucideIcon> = {
  "deskWatch.available": BellRing,
  "booking.checkInReminder": Clock,
  "booking.autoCancelled": CalendarX2,
};

/** Top-bar bell: unread count, the newest notifications, and links to act on them. */
export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const utils = api.useUtils();

  const unread = api.notification.unreadCount.useQuery(undefined, { refetchInterval: UNREAD_POLL_MS });
  const list = api.notification.list.useQuery(undefined, { enabled: open });

  const refresh = () => {
    void utils.notification.unreadCount.invalidate();
    void utils.notification.list.invalidate();
  };
  const markRead = api.notification.markRead.useMutation({ onSettled: refresh });
  const markAllRead = api.notification.markAllRead.useMutation({
    onSettled: refresh,
    onError: (error) => toast.error(error.message),
  });

  const count = unread.data ?? 0;
  const items = list.data ?? [];

  function openItem(item: (typeof items)[number]) {
    if (!item.readAt) markRead.mutate({ ids: [item.id] });
    setOpen(false);
    router.push(item.href as Route); // built server-side from known paths (formatNotification)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"} className="relative">
          <Bell className="size-[18px]" strokeWidth={1.75} />
          {count > 0 && (
            <Badge aria-hidden className="absolute -top-1 -right-1 size-5 justify-center rounded-full p-0 text-[10px]">
              {count > 9 ? "9+" : count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-foreground text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" disabled={count === 0 || markAllRead.isPending} onClick={() => markAllRead.mutate()}>
            Mark all as read
          </Button>
        </div>

        {list.isPending ? (
          <div className="space-y-3 p-4" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-4/5" />
          </div>
        ) : list.isError ? (
          <p role="alert" className="text-danger p-4 text-sm">
            Notifications couldn&apos;t be loaded. Try again in a moment.
          </p>
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="You're all caught up" description="Desk-watch alerts and check-in reminders will appear here." className="py-8" />
        ) : (
          <ul className="max-h-[26rem] overflow-y-auto py-1">
            {items.map((item) => {
              const Icon = TYPE_ICONS[item.type] ?? Bell;
              const isUnread = !item.readAt;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className={cn(
                      "hover:bg-surface-muted focus-visible:bg-surface-muted flex w-full items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none",
                      isUnread && "bg-navy-soft/40",
                    )}
                  >
                    <span className="bg-surface-muted text-navy mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-foreground flex items-center gap-2 text-sm font-medium">
                        {item.title}
                        {isUnread && <span className="sr-only">(unread)</span>}
                      </span>
                      {item.body && <span className="text-muted-foreground mt-0.5 block text-[0.8125rem] leading-5">{item.body}</span>}
                      <span className="text-muted-foreground mt-1 block text-xs">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </span>
                    </span>
                    {isUnread && <span aria-hidden className="bg-cyan mt-2 size-2 shrink-0 rounded-full" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
