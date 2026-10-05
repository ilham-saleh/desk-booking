"use client";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface PublishControlsProps {
  floorId: string;
  draftVersionId?: string;
  onPublishSuccess?: () => void;
}

export function PublishControls({ floorId, draftVersionId, onPublishSuccess }: PublishControlsProps) {
  const publishFloor = api.floor.publishFloorPlan.useMutation({
    onSuccess: () => {
      toast.success("Floor plan published successfully");
      onPublishSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to publish: ${error.message}`);
    },
  });

  const { data: versions } = api.floor.listFloorPlanVersions.useQuery({ floorId });

  const hasLiveVersion = versions?.some((v) => v.status === "LIVE");
  const hasArchivedVersions = versions?.some((v) => v.status === "ARCHIVED");

  return (
    <section className="flex flex-col gap-4 rounded-2xl border p-4" aria-labelledby="floor-plan-status-heading">
      <div>
        <h3 id="floor-plan-status-heading" className="type-card-title">
          Publishing
        </h3>
        <p className="type-helper">Employees see the live version on the Floor Map.</p>
      </div>
      <div className="bg-surface-muted flex items-center justify-between rounded-xl px-3 py-2.5">
        <span className="text-text-secondary text-sm font-medium">Current status</span>
        <div className="flex gap-1.5">
          <Badge variant="outline">Draft</Badge>
          {hasLiveVersion && (
            <Badge variant="success" dot>
              Live
            </Badge>
          )}
        </div>
      </div>

      <Button variant="brand" onClick={() => publishFloor.mutate({ floorId })} disabled={!draftVersionId || publishFloor.isPending} className="w-full">
        {publishFloor.isPending ? "Publishing…" : "Publish to live"}
      </Button>

      {hasArchivedVersions && (
        <div className="space-y-2 border-t pt-3">
          <p className="type-helper">Version history available</p>
          <Button variant="outline" disabled size="sm" className="w-full">
            View previous versions (coming soon)
          </Button>
        </div>
      )}
    </section>
  );
}
