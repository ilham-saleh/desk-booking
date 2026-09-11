"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DeskEditForm } from "./desk-edit-form";

interface DesksListProps {
  floorId: string;
  onDesksChange?: () => void;
}

export function DesksList({ floorId, onDesksChange }: DesksListProps) {
  const { data: desks, isPending, refetch } = api.desk.listForFloor.useQuery({ floorId });
  const [editingDeskId, setEditingDeskId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleEditSaved = () => {
    setEditingDeskId(null);
    setShowForm(false);
    void refetch();
    onDesksChange?.();
  };

  if (isPending) {
    return <div className="p-4">Loading desks...</div>;
  }

  return (
    <>
      <div className="space-y-4">
        <Button onClick={() => setShowForm(true)} className="mb-4">
          + New Desk
        </Button>

        <div className="overflow-x-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Position (x, y)</TableHead>
                <TableHead>Space Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {desks?.map((desk) => (
                <TableRow key={desk.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{desk.number}</TableCell>
                  <TableCell>{desk.name || "—"}</TableCell>
                  <TableCell className="text-sm text-gray-600">
                    ({desk.x}, {desk.y})
                  </TableCell>
                  <TableCell className="text-sm">{desk.spaceType || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="default">Active</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      onClick={() => {
                        setEditingDeskId(desk.id);
                        setShowForm(true);
                      }}
                      variant="ghost"
                      size="sm"
                      className="text-blue-600 hover:text-blue-700"
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingDeskId ? "Edit Desk" : "Create Desk"}</DialogTitle>
          </DialogHeader>
          <DeskEditForm
            floorId={floorId}
            deskId={editingDeskId}
            onSaved={() => void handleEditSaved()}
            onCancel={() => setShowForm(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
