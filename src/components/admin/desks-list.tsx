"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { formatDays } from "@/lib/restrictions";
import { describeAssignmentAudience } from "@/lib/restriction-labels";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeskEditModal } from "@/components/admin/desk-edit-modal";

interface DesksListProps {
  floorId: string;
  /** Floor-plan image size, so a desk created from the list lands at the plan centre for the admin to drag later. */
  planWidth?: number | null;
  planHeight?: number | null;
  onDesksChange?: () => void;
}

/** Tabular view of a floor's desks (Facilities → Floor). Editing opens the same modal as the Editing Platform. */
export function DesksList({ floorId, planWidth, planHeight, onDesksChange }: DesksListProps) {
  const utils = api.useUtils();
  const { data: desks, isPending } = api.desk.listForFloor.useQuery({ floorId });
  const [editingDeskId, setEditingDeskId] = useState<string | null>(null);

  const createDesk = api.desk.createDesk.useMutation({
    onSuccess: (desk) => {
      toast.success(`Desk ${desk.number} created at the centre of the plan — drag it into place on the Editing Platform`);
      void utils.desk.listForFloor.invalidate({ floorId });
      onDesksChange?.();
      setEditingDeskId(desk.id);
    },
    onError: (error) => toast.error(error.message),
  });

  if (isPending) {
    return <div className="p-4">Loading desks...</div>;
  }

  return (
    <>
      <div className="space-y-4">
        <Button onClick={() => createDesk.mutate({ floorId, x: (planWidth ?? 1200) / 2, y: (planHeight ?? 800) / 2 })} disabled={createDesk.isPending} className="mb-4">
          {createDesk.isPending ? "Creating…" : "+ New Desk"}
        </Button>

        <div className="overflow-x-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Restrictions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {desks?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground text-center">
                    No desks on this floor yet.
                  </TableCell>
                </TableRow>
              )}
              {desks?.map((desk) => (
                <TableRow key={desk.id} className="hover:bg-surface-muted">
                  <TableCell className="font-medium">{desk.number}</TableCell>
                  <TableCell className="text-sm">
                    {desk.restrictionAssignments.length === 0 ? (
                      <span className="text-muted-foreground">Anyone can book</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {desk.restrictionAssignments.map((a) => (
                          <li key={a.id}>
                            {describeAssignmentAudience(a)} <span className="text-muted-foreground">· {a.shift.name} ({formatDays(a.shift.daysOfWeek)})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={desk.isActive ? "default" : "secondary"}>{desk.isActive ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button onClick={() => setEditingDeskId(desk.id)} variant="ghost" size="sm" className="text-navy hover:text-navy">
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <DeskEditModal
        deskId={editingDeskId}
        open={!!editingDeskId}
        onOpenChange={(open) => !open && setEditingDeskId(null)}
        onSaved={() => {
          void utils.desk.listForFloor.invalidate({ floorId });
          onDesksChange?.();
        }}
      />
    </>
  );
}
