"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { describeRules } from "@/lib/restrictions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Swatch } from "@/components/ui/combobox";
import { RestrictionEditorDialog, type EditableRestriction } from "@/components/admin/restrictions/restriction-editor-dialog";

/**
 * "Manage Custom Restrictions" — searchable list of reusable restrictions
 * with colour, rule summary, usage and Edit / Delete. Opens on top of the
 * Edit Desk modal (and is reused by the admin Restrictions page).
 */
export function ManageRestrictionsDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lets the desk modal auto-select a restriction created from here. */
  onCreated?: (restriction: { id: string; name: string }) => void;
}) {
  const utils = api.useUtils();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EditableRestriction | null | undefined>(undefined); // undefined = editor closed
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; deskCount: number } | null>(null);

  const restrictions = api.restriction.listRestrictions.useQuery(undefined, { enabled: open });
  const userIds = useMemo(
    () => [...new Set((restrictions.data ?? []).flatMap((r) => r.rules.filter((rule) => rule.fieldType === "USER").flatMap((rule) => (Array.isArray(rule.value) ? (rule.value as string[]) : []))))],
    [restrictions.data],
  );
  const users = api.user.search.useQuery({ ids: userIds }, { enabled: open && userIds.length > 0 });
  const userName = (id: string) => users.data?.find((u) => u.id === id)?.name;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = restrictions.data ?? [];
    if (!q) return list;
    return list.filter((r) => r.name.toLowerCase().includes(q) || describeRules(r.rules, { resolveUser: userName }).toLowerCase().includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrictions.data, query, users.data]);

  const remove = api.restriction.deleteRestriction.useMutation({
    onSuccess: (result, variables) => {
      toast.success(result.removedFromDesks > 0 ? `Restriction deleted and removed from ${result.removedFromDesks} desk${result.removedFromDesks === 1 ? "" : "s"}` : "Restriction deleted");
      void utils.restriction.listRestrictions.invalidate();
      void utils.desk.invalidate();
      setPendingDelete(null);
      void variables;
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage Custom Restrictions</DialogTitle>
            <DialogDescription>Reusable rule sets. A restriction can be assigned to many desks; editing it updates them all.</DialogDescription>
          </DialogHeader>

          <div className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by restriction name or employee field" aria-label="Search restrictions" />
            <Button onClick={() => setEditing(null)}>Create new</Button>
          </div>

          <div className="-mx-6 max-h-[50vh] overflow-y-auto border-t px-6">
            {restrictions.isPending && <p className="text-muted-foreground py-6 text-center text-sm">Loading restrictions…</p>}
            {!restrictions.isPending && filtered.length === 0 && (
              <p className="text-muted-foreground py-6 text-center text-sm">{query ? "No restrictions match your search." : "No custom restrictions yet. Create one to get started."}</p>
            )}
            <ul className="divide-y">
              {filtered.map((restriction) => (
                <li key={restriction.id} className="flex items-start gap-3 py-3">
                  <Swatch color={restriction.color ?? "#9ca3af"} className="mt-1.5 size-3" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{restriction.name}</p>
                    <p className="text-muted-foreground text-sm">{describeRules(restriction.rules, { resolveUser: userName, maxValues: 12 })}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {restriction.deskCount === 0 ? "Not assigned to any desk" : `Assigned to ${restriction.deskCount} desk${restriction.deskCount === 1 ? "" : "s"} on ${restriction.floorCount} floor${restriction.floorCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="sm" onClick={() => setEditing(restriction)}>
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPendingDelete({ id: restriction.id, name: restriction.name, deskCount: restriction.deskCount })}>
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RestrictionEditorDialog
        open={editing !== undefined}
        onOpenChange={(next) => !next && setEditing(undefined)}
        restriction={editing ?? null}
        onSaved={(saved) => {
          const wasNew = editing === null;
          setEditing(undefined);
          if (wasNew) onCreated?.(saved);
        }}
      />

      <Dialog open={!!pendingDelete} onOpenChange={(next) => !next && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle>
            <DialogDescription>
              {pendingDelete && pendingDelete.deskCount > 0
                ? `This restriction is currently assigned to ${pendingDelete.deskCount} desk${pendingDelete.deskCount === 1 ? "" : "s"}. Deleting it removes those restriction blocks from the desks, so they may become open to anyone on those days.`
                : "This restriction isn't assigned to any desk. It will be removed from the list."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => pendingDelete && remove.mutate({ restrictionId: pendingDelete.id, force: pendingDelete.deskCount > 0 })}>
              {remove.isPending ? "Deleting…" : pendingDelete && pendingDelete.deskCount > 0 ? `Delete and remove from ${pendingDelete.deskCount} desk${pendingDelete.deskCount === 1 ? "" : "s"}` : "Delete restriction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
