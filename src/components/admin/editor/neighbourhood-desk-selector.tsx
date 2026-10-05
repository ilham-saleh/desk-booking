"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface Desk {
  id: string;
  number: string;
  x: number;
  y: number;
}

interface NeighbourhoodDeskSelectorProps {
  desks: Desk[];
  onSelectionComplete: (selectedDeskIds: string[]) => void;
  onCancel: () => void;
}

export function NeighbourhoodDeskSelector({ desks, onSelectionComplete, onCancel }: NeighbourhoodDeskSelectorProps) {
  const [selectedDeskIds, setSelectedDeskIds] = useState<Set<string>>(new Set());

  const toggleDesk = (deskId: string) => {
    const newIds = new Set(selectedDeskIds);
    if (newIds.has(deskId)) {
      newIds.delete(deskId);
    } else {
      newIds.add(deskId);
    }
    setSelectedDeskIds(newIds);
  };

  const handleComplete = () => {
    if (selectedDeskIds.size === 0) {
      toast.error("Please select at least one desk");
      return;
    }
    onSelectionComplete(Array.from(selectedDeskIds));
  };

  return (
    <div className="bg-surface animate-in fade-in-0 slide-in-from-right-1 flex max-h-[min(32rem,calc(100dvh-12rem))] w-80 flex-col rounded-2xl border shadow-lg duration-200">
      <div className="space-y-1 border-b px-4 pt-4 pb-3">
        <p className="type-card-title">Select desks for neighbourhood</p>
        <p className="type-helper">
          Choose the desks that belong together. <span className="text-foreground font-semibold tabular-nums">{selectedDeskIds.size}</span> selected
        </p>
      </div>
      <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-3 content-start gap-1.5 overflow-y-auto p-3">
        {desks.length === 0 ? (
          <p className="text-muted-foreground col-span-3 text-sm">No desks available</p>
        ) : (
          desks.map((desk) => {
            const selected = selectedDeskIds.has(desk.id);
            return (
              <button
                key={desk.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleDesk(desk.id)}
                className={`focus-visible:ring-cyan/40 h-9 rounded-lg border text-[0.8125rem] font-medium tabular-nums transition-colors duration-100 outline-none focus-visible:ring-2 ${
                  selected ? "border-navy bg-navy text-white" : "bg-surface text-text-secondary hover:border-navy/30 hover:text-navy"
                }`}
              >
                {desk.number}
              </button>
            );
          })
        )}
      </div>
      <div className="flex gap-2 border-t p-3">
        <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button size="sm" onClick={handleComplete} disabled={selectedDeskIds.size === 0} className="flex-1">
          Continue
        </Button>
      </div>
    </div>
  );
}
