"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface FloorsListProps {
  siteId: string;
  onFloorsChange?: () => void;
}

export function FloorsList({ siteId, onFloorsChange }: FloorsListProps) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [newFloorName, setNewFloorName] = useState("");

  const { data: floors, refetch, isPending } = api.floor.listForSite.useQuery({ siteId });
  const createFloor = api.floor.create.useMutation({
    onSuccess: async () => {
      toast.success("Floor created");
      setNewFloorName("");
      setIsCreating(false);
      await refetch();
      onFloorsChange?.();
    },
    onError: (error) => {
      toast.error(`Failed to create floor: ${error.message}`);
    },
  });

  const deleteFloor = api.floor.delete.useMutation({
    onSuccess: async () => {
      toast.success("Floor deleted");
      await refetch();
      onFloorsChange?.();
    },
    onError: (error) => {
      toast.error(`Failed to delete floor: ${error.message}`);
    },
  });

  const handleCreateFloor = () => {
    if (!newFloorName.trim()) {
      toast.error("Floor name is required");
      return;
    }

    createFloor.mutate({
      siteId,
      name: newFloorName,
    });
  };

  const handleDeleteFloor = (floorId: string) => {
    if (confirm("Are you sure you want to delete this floor? All desks will be deleted.")) {
      deleteFloor.mutate({ floorId });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Associated Floors</CardTitle>
        <CardDescription>Manage floors for this facility</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isCreating && (
          <Button
            onClick={() => setIsCreating(true)}
            variant="outline"
            size="sm"
            className="w-full"
          >
            + New Floor
          </Button>
        )}

        {isCreating && (
          <div className="flex gap-2">
            <Input
              placeholder="Floor name (e.g., Level 5)"
              value={newFloorName}
              onChange={(e) => setNewFloorName(e.target.value)}
              disabled={createFloor.isPending}
              autoFocus
            />
            <Button
              onClick={handleCreateFloor}
              size="sm"
              disabled={createFloor.isPending || !newFloorName.trim()}
            >
              {createFloor.isPending ? "Creating..." : "Create"}
            </Button>
            <Button
              onClick={() => {
                setIsCreating(false);
                setNewFloorName("");
              }}
              variant="outline"
              size="sm"
              disabled={createFloor.isPending}
            >
              Cancel
            </Button>
          </div>
        )}

        {isPending ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Loading floors...</div>
        ) : floors && floors.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">No floors yet</div>
        ) : (
          <div className="space-y-2">
            {floors?.map((floor) => (
              <div
                key={floor.id}
                className="flex items-center justify-between rounded border p-3 hover:bg-accent"
              >
                <span className="font-medium">{floor.name}</span>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const href = "/admin/floors/" + floor.id;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      router.push(href as any);
                    }}
                    variant="ghost"
                    size="sm"
                    className="text-navy hover:text-navy"
                  >
                    Manage Desks
                  </Button>
                  <Button
                    onClick={() => handleDeleteFloor(floor.id)}
                    variant="ghost"
                    size="sm"
                    disabled={deleteFloor.isPending}
                    className="text-danger hover:text-danger"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
