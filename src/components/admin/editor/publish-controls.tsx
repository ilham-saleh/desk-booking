"use client";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle>Floor Plan Status</CardTitle>
        <CardDescription>Manage floor plan versions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Current Status:</span>
          <div className="flex gap-2">
            <Badge variant="outline">Draft</Badge>
            {hasLiveVersion && <Badge variant="secondary">Live Published</Badge>}
          </div>
        </div>

        <div className="space-y-2">
          <Button
            onClick={() => publishFloor.mutate({ floorId })}
            disabled={!draftVersionId || publishFloor.isPending}
            className="w-full"
          >
            {publishFloor.isPending ? "Publishing..." : "Publish to Live"}
          </Button>

          {hasArchivedVersions && (
            <div className="border-t pt-4">
              <p className="text-sm text-gray-600 mb-2">Version history available</p>
              <Button variant="outline" disabled size="sm" className="w-full">
                View Previous Versions (coming soon)
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
