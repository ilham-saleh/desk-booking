"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { WEEKDAY_SHORT, formatDays } from "@/lib/restrictions";
import { shiftCreateInputSchema } from "@/lib/schemas/restriction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Manage reusable availability shifts: create a named weekday set, and delete
 * unwanted or duplicated ones. Deleting is refused server-side while any desk
 * block still uses the shift, and the list shows that usage up front.
 */
export function ManageShiftsDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lets the desk modal auto-select a shift created from here. */
  onCreated?: (shift: { id: string; name: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
        {open && <ShiftsPanel onCreated={onCreated} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** Backwards-compatible alias for callers that only create. */
export const ShiftEditorDialog = ManageShiftsDialog;

function ShiftsPanel({ onCreated, onClose }: { onCreated?: (shift: { id: string; name: string }) => void; onClose: () => void }) {
  const utils = api.useUtils();
  const [name, setName] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const shifts = api.shift.list.useQuery();

  const create = api.shift.create.useMutation({
    onSuccess: (shift) => {
      toast.success(`Shift "${shift.name}" created`);
      void utils.shift.list.invalidate();
      setName("");
      setDays([]);
      onCreated?.(shift);
    },
    onError: (err) => setError(err.message),
  });
  const remove = api.shift.delete.useMutation({
    onSuccess: (_, variables) => {
      toast.success("Shift deleted");
      void utils.shift.list.invalidate();
      setPendingDelete(null);
      void variables;
    },
    onError: (err) => {
      toast.error(err.message);
      setPendingDelete(null);
    },
  });

  const toggle = (day: number) => setDays((c) => (c.includes(day) ? c.filter((d) => d !== day) : [...c, day].sort((a, b) => a - b)));
  const duplicateOf = shifts.data?.find((s) => s.daysOfWeek.length === days.length && s.daysOfWeek.every((d) => days.includes(d)));

  const submit = () => {
    setError(null);
    const parsed = shiftCreateInputSchema.safeParse({ name: name.trim() || formatDays(days), daysOfWeek: days });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Availability shifts</DialogTitle>
        <DialogDescription>Named sets of weekdays you can reuse on any desk, e.g. “Mon + Fri”. Deleting a shift is only possible when no desk uses it.</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 rounded-lg border p-4">
        <p className="text-sm font-medium">New shift</p>
        <div className="grid gap-1.5">
          <Label>Days</Label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdays">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <Button key={day} type="button" size="sm" variant={days.includes(day) ? "default" : "outline"} aria-pressed={days.includes(day)} onClick={() => toggle(day)}>
                {WEEKDAY_SHORT[day]}
              </Button>
            ))}
          </div>
          {duplicateOf && days.length > 0 && (
            <p className="text-xs text-amber-800">
              “{duplicateOf.name}” already covers exactly these days — you can reuse it instead of creating a duplicate.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="shift-name">Name</Label>
            <Input id="shift-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={days.length ? formatDays(days) : "e.g. Wednesday Only"} maxLength={80} />
          </div>
          <Button type="button" onClick={submit} disabled={create.isPending || days.length === 0}>
            {create.isPending ? "Saving…" : "Create shift"}
          </Button>
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>

      <div className="max-h-[40vh] overflow-y-auto rounded-lg border">
        {shifts.isPending && <p className="text-muted-foreground p-4 text-center text-sm">Loading shifts…</p>}
        {shifts.data?.length === 0 && <p className="text-muted-foreground p-4 text-center text-sm">No shifts yet.</p>}
        <ul className="divide-y">
          {shifts.data?.map((shift) => (
            <li key={shift.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{shift.name}</p>
                <p className="text-muted-foreground text-xs">
                  {formatDays(shift.daysOfWeek)} · {shift.assignmentCount === 0 ? "not used by any desk" : `used by ${shift.assignmentCount} desk block${shift.assignmentCount === 1 ? "" : "s"}`}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete shift ${shift.name}`}
                disabled={shift.assignmentCount > 0}
                title={shift.assignmentCount > 0 ? "In use — change those desks first" : "Delete shift"}
                onClick={() => setPendingDelete({ id: shift.id, name: shift.name })}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>

      <Dialog open={!!pendingDelete} onOpenChange={(next) => !next && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete shift “{pendingDelete?.name}”?</DialogTitle>
            <DialogDescription>It will no longer appear in the shift dropdown. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => pendingDelete && remove.mutate({ shiftId: pendingDelete.id })}>
              {remove.isPending ? "Deleting…" : "Delete shift"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
