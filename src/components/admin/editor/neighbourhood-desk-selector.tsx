"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle>Select Desks for Neighbourhood</CardTitle>
        <CardDescription>
          Click on desks in the list below to select them. Shift+Click on the map to select desks (if available).
          Selected: {selectedDeskIds.size}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-64 space-y-2 overflow-y-auto rounded border border-blue-200 bg-white p-3">
          {desks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No desks available</p>
          ) : (
            desks.map((desk) => (
              <button
                key={desk.id}
                onClick={() => toggleDesk(desk.id)}
                className={`block w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                  selectedDeskIds.has(desk.id)
                    ? "bg-blue-500 text-white"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                Desk {desk.number}
              </button>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleComplete} disabled={selectedDeskIds.size === 0} className="flex-1">
            Continue ({selectedDeskIds.size} selected)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
