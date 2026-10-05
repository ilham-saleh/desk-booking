"use client";

import { api } from "@/lib/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FloorSelectorProps {
  siteId: string;
  selectedFloorId: string | null;
  onFloorSelect: (floorId: string) => void;
  isLoading?: boolean;
}

export function FloorSelector({ siteId, selectedFloorId, onFloorSelect, isLoading }: FloorSelectorProps) {
  const { data: floors, isPending } = api.floor.listForSite.useQuery({ siteId });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Floor</CardTitle>
        <CardDescription>Choose a floor to edit its floor plan</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Select value={selectedFloorId || ""} onValueChange={onFloorSelect} disabled={isPending || isLoading}>
          <SelectTrigger>
            <SelectValue placeholder="Select a floor..." />
          </SelectTrigger>
          <SelectContent>
            {floors?.map((floor) => (
              <SelectItem key={floor.id} value={floor.id}>
                {floor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {floors && floors.length === 0 && (
          <p className="text-sm text-warning">No floors available. Create a floor first in the Facilities view.</p>
        )}
      </CardContent>
    </Card>
  );
}
