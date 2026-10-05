"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/trpc/client";
import { ArrowLeft, PlusCircle, Edit, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FloorForm } from "@/components/admin/floor-form";

export default function FacilityDetailPage() {
  const router = useRouter();
  const params = useParams();
  const siteId = params?.siteId as string;

  const [isCreateFloorOpen, setIsCreateFloorOpen] = useState(false);
  const [isEditFloorOpen, setIsEditFloorOpen] = useState(false);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  const { data: facility, isLoading: facilityLoading } = api.facility.get.useQuery({ siteId });
  const { data: floors = [], refetch: refetchFloors } = api.floor.listForSite.useQuery({ siteId });

  const deleteFloorMutation = api.floor.delete.useMutation({
    onSuccess: () => {
      toast.success("Floor deleted");
      void refetchFloors();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleDeleteFloor = (floorId: string) => {
    if (confirm("Are you sure? This will delete all desks on this floor.")) {
      deleteFloorMutation.mutate({ floorId });
    }
  };

  if (facilityLoading) return <div className="p-8">Loading facility...</div>;
  if (!facility) return <div className="p-8">Facility not found</div>;

  const selectedFloor = floors.find((f) => f.id === selectedFloorId);

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="type-page-title">{facility.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {facility.city}, {facility.country} • {facility.timeZone}
          </p>
        </div>
      </div>

      {/* Facility Details */}
      <Card>
        <CardHeader>
          <CardTitle>Facility Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="font-medium text-muted-foreground">Address</dt>
              <dd>{facility.address || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Postal Code</dt>
              <dd>{facility.postalCode || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Description</dt>
              <dd className="col-span-2">{facility.description || "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Timezone</dt>
              <dd>{facility.timeZone}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Units</dt>
              <dd>{facility.unitSystem}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Show Coworker Bookings</dt>
              <dd>{facility.allowEmployeeSeeBookings ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Floors */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Floors</CardTitle>
            <CardDescription>Manage floors within this facility</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setSelectedFloorId(null);
              setIsCreateFloorOpen(true);
            }}
            className="gap-2"
          >
            <PlusCircle className="size-4" />
            New Floor
          </Button>
        </CardHeader>
        <CardContent>
          {floors.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No floors yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {floors.map((floor, idx) => (
                <div key={floor.id} className="flex items-center justify-between rounded border p-4">
                  <div>
                    <p className="font-medium">{floor.name}</p>
                    <p className="text-sm text-muted-foreground">Floor {idx + 1}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedFloorId(floor.id);
                        setIsEditFloorOpen(true);
                      }}
                    >
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteFloor(floor.id)}
                      disabled={deleteFloorMutation.isPending}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Floor Dialog */}
      <Dialog open={isCreateFloorOpen} onOpenChange={setIsCreateFloorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Floor</DialogTitle>
          </DialogHeader>
          <FloorForm
            mode="create"
            siteId={siteId}
            onSuccess={() => {
              setIsCreateFloorOpen(false);
              void refetchFloors();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Floor Dialog */}
      <Dialog open={isEditFloorOpen} onOpenChange={setIsEditFloorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Floor</DialogTitle>
          </DialogHeader>
          {selectedFloor && (
            <FloorForm
              mode="edit"
              floorId={selectedFloorId || ""}
              initialData={selectedFloor}
              onSuccess={() => {
                setIsEditFloorOpen(false);
                void refetchFloors();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
