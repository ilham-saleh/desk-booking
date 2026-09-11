"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";
import { FloorSelector } from "@/components/admin/editor/floor-selector";
import { PublishControls } from "@/components/admin/editor/publish-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminEditorPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  const { data: sites } = api.facility.list.useQuery();

  const { data: draftPlan, refetch: refetchDraft } = api.floor.getDraftFloorPlan.useQuery(
    { floorId: selectedFloorId! },
    { enabled: !!selectedFloorId },
  );

  const handleFloorSelect = (floorId: string) => {
    setSelectedFloorId(floorId);
  };

  const handlePublishSuccess = () => {
    void refetchDraft();
  };

  if (!draftPlan && selectedFloorId) {
    return <div className="space-y-6 p-8">Loading floor plan...</div>;
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Editing Platform</h1>
        <p className="mt-2 text-gray-600">Draft and publish floor plans with desks, rooms, and utilities.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Sidebar */}
        <div className="space-y-4 lg:col-span-1">
          {/* Site Selector */}
          <Card>
            <CardHeader>
              <CardTitle>Select Facility</CardTitle>
              <CardDescription>Choose a facility to edit floors</CardDescription>
            </CardHeader>
            <CardContent>
              <select
                value={selectedSiteId || ""}
                onChange={(e) => {
                  setSelectedSiteId(e.target.value);
                  setSelectedFloorId(null);
                }}
                className="w-full rounded border p-2"
              >
                <option value="">Select a facility...</option>
                {sites?.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </CardContent>
          </Card>

          {/* Floor Selector */}
          {selectedSiteId && (
            <FloorSelector
              siteId={selectedSiteId}
              selectedFloorId={selectedFloorId}
              onFloorSelect={handleFloorSelect}
            />
          )}

          {/* Publish Controls */}
          {selectedFloorId && draftPlan && (
            <PublishControls
              floorId={selectedFloorId}
              draftVersionId={draftPlan.id}
              onPublishSuccess={handlePublishSuccess}
            />
          )}
        </div>

        {/* Main Content - Canvas Area */}
        <div className="lg:col-span-3">
          {selectedFloorId && draftPlan ? (
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Floor Plan Canvas</CardTitle>
                <CardDescription>Drag to place desks, rooms, and utilities. Canvas editor implementation coming in Phase 4.7.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center" style={{ minHeight: "600px" }}>
                {draftPlan.renderedImageKey ? (
                  <div className="text-center text-gray-500">
                    <p className="mb-2">Floor plan loaded</p>
                    <p className="text-sm">Canvas dimensions: {draftPlan.imageWidth} × {draftPlan.imageHeight}px</p>
                    <p className="text-sm mt-4">Interactive editor with Konva canvas coming next.</p>
                  </div>
                ) : (
                  <div className="text-center text-gray-500">
                    <p>No floor plan uploaded yet</p>
                    <p className="text-sm mt-2">Upload a PDF or image to get started</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="h-full">
              <CardContent className="flex items-center justify-center" style={{ minHeight: "600px" }}>
                <div className="text-center text-gray-500">
                  <p>Select a facility and floor to begin editing</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
