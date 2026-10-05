"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Confirmation for Seats → Delete. The server decides between hard delete
 * (no bookings), archive (booking history) and refusal (upcoming bookings);
 * a refusal is shown here with a route to deactivate the desk instead.
 */
export function DeleteDeskDialog({
  desk,
  open,
  onOpenChange,
  onDeleted,
  onOpenDeskEditor,
}: {
  desk: { id: string; number: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (deskId: string) => void;
  onOpenDeskEditor: (deskId: string) => void;
}) {
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const utils = api.useUtils();

  const deleteDesk = api.desk.deleteDesk.useMutation({
    onSuccess: (result) => {
      toast.success(result.mode === "archived" ? `Desk ${result.number} removed from the floor (booking history kept)` : `Desk ${result.number} deleted`);
      void utils.desk.listForFloor.invalidate();
      void utils.floor.get.invalidate();
      onDeleted(result.deskId);
      onOpenChange(false);
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") setBlockedMessage(error.message);
      else toast.error(error.message);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setBlockedMessage(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Desk {desk?.number}?</DialogTitle>
          <DialogDescription>
            This will remove the desk from this floor. If the desk has past bookings it is archived so the booking history stays intact.
          </DialogDescription>
        </DialogHeader>

        {blockedMessage && (
          <div role="alert" className="rounded-md border border-[#f5d2b3] bg-warning-soft p-3 text-sm text-[#6b3608]">
            <p className="font-medium">This desk can&apos;t be deleted yet</p>
            <p className="mt-1">{blockedMessage}</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {blockedMessage ? (
            <Button
              onClick={() => {
                if (desk) onOpenDeskEditor(desk.id);
                onOpenChange(false);
              }}
            >
              Open desk to mark it inactive
            </Button>
          ) : (
            <Button variant="destructive" disabled={!desk || deleteDesk.isPending} onClick={() => desk && deleteDesk.mutate({ deskId: desk.id })}>
              {deleteDesk.isPending ? "Deleting…" : "Delete Desk"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
