"use client";

import { useState } from "react";
import { api } from "@/lib/trpc/client";

import { PublishControls } from "@/components/admin/editor/publish-controls";
import { FloorCanvasEditor } from "@/components/admin/editor/floor-canvas-editor";
import { FloorPlanUpload } from "@/components/admin/editor/floor-plan-upload";
import { EditorLayout } from "@/components/admin/editor/editor-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AdminEditorPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);

  const { data: sites } = api.facility.list.useQuery();
  const { data: floors = [] } = api.floor.listForSite.useQuery(
    { siteId: selectedSiteId! },
    { enabled: !!selectedSiteId },
  );

  const { data: draftPlan, refetch: refetchDraft } = api.floor.getDraftFloorPlan.useQuery(
    { floorId: selectedFloorId! },
    { enabled: !!selectedFloorId },
  );

  const handlePublishSuccess = () => {
    void refetchDraft();
  };

  const handleUploadSuccess = () => {
    void refetchDraft();
  };

  const selectedFloor = floors.find((f) => f.id === selectedFloorId);

  if (!selectedFloorId || !selectedFloor) {
    return (
      <div className="space-y-6 p-8">
        <div>
          <h1 className="text-3xl font-bold">Editing Platform</h1>
          <p className="mt-2 text-gray-600">Draft and publish floor plans with visual desk placement.</p>
        </div>

        {/* Selection Controls */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Facility</CardTitle>
              <CardDescription>Select a facility</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedSiteId || ""} onValueChange={(val) => {
                setSelectedSiteId(val);
                setSelectedFloorId(null);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select facility..." />
                </SelectTrigger>
                <SelectContent>
                  {sites?.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedSiteId && (
            <Card>
              <CardHeader>
                <CardTitle>Floor</CardTitle>
                <CardDescription>Select a floor</CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={selectedFloorId || ""} onValueChange={setSelectedFloorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select floor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {floors.map((floor) => (
                      <SelectItem key={floor.id} value={floor.id}>
                        {floor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center text-gray-500">
              <p>Select a facility and floor to get started</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <EditorLayout floorName={selectedFloor.name}>
      <div className="flex flex-col gap-4 p-4 overflow-auto">
        {/* Floor Selection & Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Facility</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedSiteId || ""} onValueChange={(val) => {
                setSelectedSiteId(val);
                setSelectedFloorId(null);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select facility..." />
                </SelectTrigger>
                <SelectContent>
                  {sites?.map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Floor</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedFloorId || ""} onValueChange={setSelectedFloorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select floor..." />
                </SelectTrigger>
                <SelectContent>
                  {floors.map((floor) => (
                    <SelectItem key={floor.id} value={floor.id}>
                      {floor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {draftPlan && (
            <PublishControls
              floorId={selectedFloorId}
              draftVersionId={draftPlan.id}
              onPublishSuccess={handlePublishSuccess}
            />
          )}
        </div>

        {/* Floor Plan Upload */}
        {selectedFloorId && (
          <FloorPlanUpload
            floorId={selectedFloorId}
            floorName={selectedFloor.name}
            onUploadSuccess={handleUploadSuccess}
          />
        )}

        {/* Canvas Editor */}
        {selectedFloor && draftPlan ? (
          <FloorCanvasEditor
            floorId={selectedFloorId}
            floorName={selectedFloor.name}
            backgroundImageUrl={draftPlan.renderedImageKey ? `/api/files/${draftPlan.renderedImageKey}` : undefined}
            imageWidth={draftPlan.imageWidth || 1200}
            imageHeight={draftPlan.imageHeight || 800}
          />
        ) : (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center text-gray-500">
                <p>Loading floor plan...</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </EditorLayout>
  );
}
