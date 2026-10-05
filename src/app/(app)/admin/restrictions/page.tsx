"use client";

import { useMemo, useState } from "react";
import { PlusCircle, Edit, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { describeRules } from "@/lib/restrictions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Swatch } from "@/components/ui/combobox";
import { RestrictionEditorDialog, type EditableRestriction } from "@/components/admin/restrictions/restriction-editor-dialog";

/** Admin → Restrictions: the same reusable restriction records the Edit Desk modal assigns. */
export default function RestrictionsPage() {
  const utils = api.useUtils();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EditableRestriction | null | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; deskCount: number } | null>(null);

  const { data: restrictions = [], isPending } = api.restriction.listRestrictions.useQuery();
  const userIds = useMemo(
    () => [...new Set(restrictions.flatMap((r) => r.rules.filter((rule) => rule.fieldType === "USER").flatMap((rule) => (Array.isArray(rule.value) ? (rule.value as string[]) : []))))],
    [restrictions],
  );
  const users = api.user.search.useQuery({ ids: userIds }, { enabled: userIds.length > 0 });
  const resolveUser = (id: string) => users.data?.find((u) => u.id === id)?.name;

  const filtered = restrictions.filter((r) => {
    const q = query.trim().toLowerCase();
    return !q || r.name.toLowerCase().includes(q) || describeRules(r.rules, { resolveUser }).toLowerCase().includes(q);
  });

  const deleteMutation = api.restriction.deleteRestriction.useMutation({
    onSuccess: (result) => {
      toast.success(result.removedFromDesks > 0 ? `Restriction deleted and removed from ${result.removedFromDesks} desk(s)` : "Restriction deleted");
      void utils.restriction.listRestrictions.invalidate();
      void utils.desk.invalidate();
      setPendingDelete(null);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="type-page-title">Booking Restrictions</h1>
          <p className="text-muted-foreground mt-1 max-w-[70ch] text-sm leading-6">Reusable rule sets that desk restriction blocks assign to specific days.</p>
        </div>
        <Button onClick={() => setEditing(null)} className="gap-2">
          <PlusCircle className="size-4" />
          New Restriction
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Restrictions</CardTitle>
          <CardDescription>Assign these to desks from the Editing Platform (Edit Desk → Bookings restricted to → Custom restriction).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by restriction name or employee field" aria-label="Search restrictions" className="max-w-md" />
          {isPending ? (
            <p className="text-muted-foreground py-8 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">{query ? "No restrictions match your search." : "No restrictions yet. Create one to control desk booking access."}</div>
          ) : (
            <ul className="space-y-3">
              {filtered.map((restriction) => (
                <li key={restriction.id} className="flex items-start gap-3 rounded border p-4">
                  <Swatch color={restriction.color ?? "#9ca3af"} className="mt-1.5 size-3" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{restriction.name}</p>
                    <p className="text-sm text-muted-foreground">{describeRules(restriction.rules, { resolveUser, maxValues: 12 })}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {restriction.deskCount === 0 ? "Not assigned to any desk" : `Assigned to ${restriction.deskCount} desk(s) on ${restriction.floorCount} floor(s)`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" aria-label={`Edit ${restriction.name}`} onClick={() => setEditing(restriction)}>
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${restriction.name}`}
                      onClick={() => setPendingDelete({ id: restriction.id, name: restriction.name, deskCount: restriction.deskCount })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RestrictionEditorDialog open={editing !== undefined} onOpenChange={(next) => !next && setEditing(undefined)} restriction={editing ?? null} onSaved={() => setEditing(undefined)} />

      <Dialog open={!!pendingDelete} onOpenChange={(next) => !next && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{pendingDelete?.name}”?</DialogTitle>
            <DialogDescription>
              {pendingDelete && pendingDelete.deskCount > 0
                ? `This restriction is currently assigned to ${pendingDelete.deskCount} desk(s). Deleting it removes those restriction blocks from the desks.`
                : "This restriction isn't assigned to any desk."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => pendingDelete && deleteMutation.mutate({ restrictionId: pendingDelete.id, force: pendingDelete.deskCount > 0 })}>
              {deleteMutation.isPending ? "Deleting…" : "Delete restriction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
