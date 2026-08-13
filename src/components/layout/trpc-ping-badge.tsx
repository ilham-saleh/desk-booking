"use client";

import { api } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";

export function TrpcPingBadge() {
  const { data, isPending, isError } = api.health.ping.useQuery();

  if (isPending) return <Badge variant="secondary">tRPC: checking…</Badge>;
  if (isError) return <Badge variant="destructive">tRPC: unreachable</Badge>;

  return <Badge variant="outline">tRPC ok · {data.timestamp.toLocaleTimeString()}</Badge>;
}
