"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DesksList } from "@/components/admin/desks-list";
import { Button } from "@/components/ui/button";

interface FloorDetailPageProps {
  params: Promise<{ floorId: string }>;
}

export default function FloorDetailPage({ params }: FloorDetailPageProps) {
  const router = useRouter();
  const { floorId } = use(params);
  const { data: floor, isPending } = api.floor.get.useQuery({ floorId });

  if (isPending) {
    return <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">Loading floor...</div>;
  }

  if (!floor) {
    return <div className="p-8 text-muted-foreground">Floor not found</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="type-page-title">{floor.name}</h1>
          <p className="text-muted-foreground mt-1 max-w-[70ch] text-sm leading-6">Manage desks and availability on this floor</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            const href = "/admin/sites/" + floor.siteId;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            router.push(href as any);
          }}
        >
          Back to Facility
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Desks</CardTitle>
        </CardHeader>
        <CardContent>
          <DesksList floorId={floorId} planWidth={floor.livePlanVersion?.imageWidth} planHeight={floor.livePlanVersion?.imageHeight} />
        </CardContent>
      </Card>
    </div>
  );
}
