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
  onClose: () => void;
  onSuccess: () => void;
}

const COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#FFA07A",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E2",
];

export function NeighbourhoodEditorDialog({ open, neighbourhood, floorId, desks, onClose, onSuccess }: NeighbourhoodEditorDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [description, setDescription] = useState("");
  const [captain, setCaptain] = useState("");
  const [selectedDeskIds, setSelectedDeskIds] = useState<Set<string>>(new Set());
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
    } else {
      setName("");
      setColor(COLORS[0]);
      setDescription("");
      setCaptain("");
      setSelectedDeskIds(new Set());
    }
  }, [neighbourhood, open]);

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
        if (JSON.stringify(new Set(neighbourhood.desks.map((d) => d.deskId))) !== JSON.stringify(selectedDeskIds)) {
          await updateDesksMutation.mutateAsync({
            neighbourhoodId: neighbourhood.id,
            deskIds: Array.from(selectedDeskIds),
          });
        }
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

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{neighbourhood ? "Edit Neighbourhood" : "Create Neighbourhood"}</DialogTitle>
          <DialogDescription>Configure the neighbourhood details and assign desks.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="nh-name">Name *</Label>
            <Input
              id="nh-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Technology, Finance, Consulting"
            />
          </div>

          {/* Color */}
          <div className="space-y-2">
            <Label>Colour *</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded border-2 ${color === c ? "border-gray-900" : "border-gray-300"}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="nh-description">Description</Label>
            <Textarea
              id="nh-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={2}
            />
          </div>

          {/* Captain */}
          <div className="space-y-2">
            <Label htmlFor="nh-captain">Captain</Label>
            <Input
              id="nh-captain"
              value={captain}
              onChange={(e) => setCaptain(e.target.value)}
              placeholder="Neighbourhood lead or manager (optional)"
            />
          </div>

          {/* Assigned Desks */}
          <div className="space-y-2">
            <Label>Assigned Desks *</Label>
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
          </div>
        </div>

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
