"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { PlusCircle, Edit, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RestrictionForm } from "@/components/admin/restriction-form";
import { toast } from "sonner";

export default function RestrictionsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedRestrictionId, setSelectedRestrictionId] = useState<string | null>(null);

  const { data: restrictions = [], refetch } = api.restriction.listRestrictions.useQuery();
  const { data: selectedRestriction } = api.restriction.getRestriction.useQuery(
    { restrictionId: selectedRestrictionId! },
    { enabled: !!selectedRestrictionId && isEditOpen },
  );

  const deleteMutation = api.restriction.deleteRestriction.useMutation({
    onSuccess: () => {
      toast.success("Restriction deleted");
      void refetch();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleDelete = (restrictionId: string) => {
    if (confirm("Delete this restriction?")) {
      deleteMutation.mutate({ restrictionId });
    }
  };

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Booking Restrictions</h1>
          <p className="mt-2 text-gray-600">Create reusable restriction groups to control desk booking eligibility.</p>
        </div>
        <Button
          onClick={() => {
            setSelectedRestrictionId(null);
            setIsCreateOpen(true);
          }}
          className="gap-2"
        >
          <PlusCircle className="size-4" />
          New Restriction
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Restrictions</CardTitle>
          <CardDescription>Reusable restriction groups used by desk availability shifts</CardDescription>
        </CardHeader>
        <CardContent>
          {restrictions.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No restrictions yet. Create one to control desk booking access.
            </div>
          ) : (
            <div className="space-y-3">
              {restrictions.map((restriction) => (
                <div key={restriction.id} className="flex items-center justify-between rounded border p-4">
                  <div>
                    <p className="font-medium">{restriction.name}</p>
                    <p className="text-sm text-gray-600">{restriction.rules.length} rule(s)</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedRestrictionId(restriction.id);
                        setIsEditOpen(true);
                      }}
                    >
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(restriction.id)}
                      disabled={deleteMutation.isPending}
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

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Booking Restriction</DialogTitle>
          </DialogHeader>
          <RestrictionForm
            mode="create"
            onSuccess={() => {
              setIsCreateOpen(false);
              void refetch();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Booking Restriction</DialogTitle>
          </DialogHeader>
          {selectedRestriction && (
            <RestrictionForm
              mode="edit"
              initialData={{
                id: selectedRestriction.id,
                name: selectedRestriction.name,
                rules: selectedRestriction.rules.map((r) => ({
                  fieldType: r.fieldType,
                  operator: r.operator,
                  value: (r.value as unknown) as string | string[],
                })),
              }}
              onSuccess={() => {
                setIsEditOpen(false);
                void refetch();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
