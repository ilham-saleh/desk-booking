"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Neighbourhood {
  id: string;
  name: string;
  color: string;
  description: string | null;
  captain: string | null;
  desks: Array<{ deskId: string }>;
  members: Array<{ userId: string }>;
  rules: Array<Record<string, unknown>>;
}

interface NeighbourhoodEditorDialogProps {
  open: boolean;
  neighbourhood: Neighbourhood | null;
  floorId: string;
  desks: Array<{ id: string; number: string }>;
  preSelectedDeskIds?: string[];
  onClose: () => void;
  onSuccess: () => void;
}

const COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A",
  "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E2",
  "#F8B739", "#2ECC71", "#3498DB", "#9B59B6",
];

type MemberRule = {
  fieldType: "DEPARTMENT" | "EMAIL" | "USER";
  operator: "IS" | "IS_NOT" | "IS_ANY_OF" | "IS_NOT_ANY_OF" | "IS_EMPTY" | "IS_NOT_EMPTY";
  value: string[];
};

type Shift = {
  name: string;
  daysOfWeek: number[];
};

export function NeighbourhoodEditorDialogV2({
  open,
  neighbourhood,
  floorId,
  desks,
  preSelectedDeskIds = [],
  onClose,
  onSuccess,
}: NeighbourhoodEditorDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [description, setDescription] = useState("");
  const [captain, setCaptain] = useState("");
  const [selectedDeskIds, setSelectedDeskIds] = useState<Set<string>>(new Set());
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [memberRules, setMemberRules] = useState<MemberRule[]>([]);
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!open) return;
    if (neighbourhood) {
      setName(neighbourhood.name);
      setColor(neighbourhood.color);
      setDescription(neighbourhood.description || "");
      setCaptain(neighbourhood.captain || "");
      setSelectedDeskIds(new Set(neighbourhood.desks.map((d) => d.deskId)));
      setSelectedMembers(new Set(neighbourhood.members.map((m) => m.userId)));
    } else {
      setName("");
      setColor(COLORS[0]);
      setDescription("");
      setCaptain("");
      setSelectedDeskIds(new Set(preSelectedDeskIds));
      setSelectedMembers(new Set());
      setMemberRules([]);
      setSelectedShifts(new Set());
    }
  }, [neighbourhood, open, preSelectedDeskIds]);

  const createMutation = api.neighbourhood.create.useMutation({
    onSuccess: () => {
      toast.success("Neighbourhood created");
      onSuccess();
      onClose();
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setSaving(false),
  });

  const updateMutation = api.neighbourhood.update.useMutation({
    onSuccess: () => {
      toast.success("Neighbourhood updated");
      onSuccess();
      onClose();
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => setSaving(false),
  });

  const updateDesksMutation = api.neighbourhood.updateDesks.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const updateMembersMutation = api.neighbourhood.updateMembers.useMutation({
    onError: (error) => toast.error(error.message),
  });

  const updateRulesMutation = api.neighbourhood.updateRules.useMutation({
    onError: (error) => toast.error(error.message),
  });

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Neighbourhood name is required");
      return;
    }
    if (selectedDeskIds.size === 0) {
      toast.error("At least one desk must be assigned");
      return;
    }

    setSaving(true);

    try {
      if (neighbourhood) {
        const desc = description.trim();
        const cap = captain.trim();
        await updateMutation.mutateAsync({
          neighbourhoodId: neighbourhood.id,
          name: name.trim(),
          color: color as string,
          description: desc ? desc : undefined,
          captain: cap ? cap : undefined,
        });

        // Update desks if changed
        if (JSON.stringify(new Set(neighbourhood.desks.map((d) => d.deskId))) !== JSON.stringify(selectedDeskIds)) {
          await updateDesksMutation.mutateAsync({
            neighbourhoodId: neighbourhood.id,
            deskIds: Array.from(selectedDeskIds),
          });
        }

        // Update members
        await updateMembersMutation.mutateAsync({
          neighbourhoodId: neighbourhood.id,
          userIds: Array.from(selectedMembers),
        });

        // Update rules
        await updateRulesMutation.mutateAsync({
          neighbourhoodId: neighbourhood.id,
          rules: memberRules,
        });
      } else {
        const desc = description.trim();
        const cap = captain.trim();
        await createMutation.mutateAsync({
          floorId,
          name: name.trim(),
          color: color as string,
          description: desc ? desc : undefined,
          captain: cap ? cap : undefined,
          deskIds: Array.from(selectedDeskIds),
          members: {
            userIds: Array.from(selectedMembers),
            rules: memberRules,
          },
        });
      }
    } catch {
      // Error handled by mutation callbacks
    }
  }

  const toggleDesk = (deskId: string) => {
    const newIds = new Set(selectedDeskIds);
    if (newIds.has(deskId)) {
      newIds.delete(deskId);
    } else {
      newIds.add(deskId);
    }
    setSelectedDeskIds(newIds);
  };

  const toggleMember = (userId: string) => {
    const newIds = new Set(selectedMembers);
    if (newIds.has(userId)) {
      newIds.delete(userId);
    } else {
      newIds.add(userId);
    }
    setSelectedMembers(newIds);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{neighbourhood ? "Edit Neighbourhood" : "Create Neighbourhood"}</DialogTitle>
          <DialogDescription>Configure neighbourhood details, desks, members, and access rules.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="desks">Desks</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="nh-name">Name *</Label>
              <Input
                id="nh-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Technology, Finance, Consulting"
              />
            </div>

            <div className="space-y-2">
              <Label>Colour *</Label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`h-8 w-8 rounded border-2 transition-all ${color === c ? "border-navy ring-2 ring-offset-2" : "border-border-strong hover:border-border-strong"}`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nh-description">Description</Label>
              <Textarea
                id="nh-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of this neighbourhood"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nh-captain">Captain/Lead</Label>
              <Input
                id="nh-captain"
                value={captain}
                onChange={(e) => setCaptain(e.target.value)}
                placeholder="Neighbourhood lead or manager (optional)"
              />
            </div>
          </TabsContent>

          {/* Desks Tab */}
          <TabsContent value="desks" className="space-y-4 py-4">
            <div className="text-sm text-muted-foreground">
              {selectedDeskIds.size} desk(s) selected
            </div>
            {preSelectedDeskIds.length > 0 && !neighbourhood ? (
              <div className="rounded border border-success/25 bg-success-soft p-4">
                <p className="mb-3 text-sm font-medium text-success">Pre-selected Desks</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(selectedDeskIds)
                    .map((id) => desks.find((d) => d.id === id))
                    .filter(Boolean)
                    .map((desk) => (
                      <Badge key={desk!.id} variant="secondary">
                        Desk {desk!.number}
                      </Badge>
                    ))}
                </div>
              </div>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded border p-3">
                {desks.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No desks available</p>
                ) : (
                  desks.map((desk) => (
                    <div key={desk.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`desk-${desk.id}`}
                        checked={selectedDeskIds.has(desk.id)}
                        onCheckedChange={() => toggleDesk(desk.id)}
                      />
                      <label htmlFor={`desk-${desk.id}`} className="cursor-pointer text-sm">
                        Desk {desk.number}
                      </label>
                    </div>
                  ))
                )}
              </div>
            )}
          </TabsContent>

          {/* Members Tab */}
          <TabsContent value="members" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Manual Member Selection</Label>
              <p className="text-xs text-muted-foreground">Add specific employees to this neighbourhood</p>
              <div className="rounded border p-3">
                <p className="text-xs text-muted-foreground">
                  Member selection will be enhanced in the next phase with employee search and filtering.
                </p>
                <p className="mt-2 text-sm font-medium">{selectedMembers.size} member(s) selected</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Rule-Based Members</Label>
              <p className="text-xs text-muted-foreground">Automatically include employees matching these criteria</p>
              <div className="rounded border p-3">
                <p className="text-xs text-muted-foreground">
                  Rule-based member selection will be enhanced in the next phase with department, title, and custom field matching.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Rules Tab */}
          <TabsContent value="rules" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Access Schedule</Label>
              <p className="text-xs text-muted-foreground">Define when neighbourhood members can book desks</p>
              <div className="rounded border p-3">
                <div className="space-y-2 text-sm">
                  <p>Shift configuration will be available in the next phase:</p>
                  <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
                    <li>Monday - Friday (full week)</li>
                    <li>Specific days only (e.g., Mon + Fri)</li>
                    <li>Time windows (e.g., 9AM - 5PM)</li>
                    <li>Advance booking window (e.g., 2 weeks ahead)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Important Notes</Label>
              <div className="rounded border border-[#f5d2b3] bg-warning-soft p-3">
                <p className="text-xs text-[#6b3608]">
                  ℹ️ Neighbourhood membership determines who can see the neighbourhood, but desk access is still controlled by desk-level restrictions.
                  Members can only book desks if they also meet the desk's booking restrictions.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : neighbourhood ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
