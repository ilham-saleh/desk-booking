"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, Upload } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PublishControls } from "@/components/admin/editor/publish-controls";
import { FloorCanvasEditor, type EditorDesk } from "@/components/admin/editor/floor-canvas-editor";
import { FloorPlanUpload } from "@/components/admin/editor/floor-plan-upload";
import { EditorLayout, type EditorAction, type EditorMode, type EditorObjectType } from "@/components/admin/editor/editor-layout";
import { DeleteDeskDialog } from "@/components/admin/editor/delete-desk-dialog";
import { DeskEditModal } from "@/components/admin/desk-edit-modal";

const DEFAULT_PLAN_WIDTH = 1200;
const DEFAULT_PLAN_HEIGHT = 800;

export default function AdminEditorPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedFloorId, setSelectedFloorId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("select");
  const [activeObjectType, setActiveObjectType] = useState<EditorObjectType>(null);
  const [activeAction, setActiveAction] = useState<EditorAction>(null);
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [editingDeskId, setEditingDeskId] = useState<string | null>(null);
  const [deletingDeskId, setDeletingDeskId] = useState<string | null>(null);
  const [showFloorPlanTools, setShowFloorPlanTools] = useState(false);

  const utils = api.useUtils();
  const { data: sites } = api.facility.list.useQuery();
  const { data: floors = [] } = api.floor.listForSite.useQuery({ siteId: selectedSiteId! }, { enabled: !!selectedSiteId });
  const { data: draftPlan, isPending: planPending } = api.floor.getDraftFloorPlan.useQuery(
    { floorId: selectedFloorId! },
    { enabled: !!selectedFloorId },
  );
  const { data: floorDesks = [], isPending: desksPending } = api.desk.listForFloor.useQuery(
    { floorId: selectedFloorId! },
    { enabled: !!selectedFloorId },
  );

  const selectedFloor = floors.find((f) => f.id === selectedFloorId);
  const selectedSite = sites?.find((s) => s.id === selectedSiteId);

  const desks: EditorDesk[] = useMemo(
    () =>
      floorDesks.map((d) => ({
        id: d.id,
        number: d.number,
        x: d.x,
        y: d.y,
        isActive: d.isActive,
        requiresCheckIn: d.requiresCheckIn,
        restrictionCount: d.restrictionAssignments.length,
      })),
    [floorDesks],
  );
  const selectedDesk = desks.find((d) => d.id === selectedDeskId) ?? null;
  const deletingDesk = desks.find((d) => d.id === deletingDeskId) ?? null;

  const clearAction = useCallback(() => {
    setActiveObjectType(null);
    setActiveAction(null);
  }, []);

  const changeFloor = (floorId: string | null) => {
    setSelectedFloorId(floorId);
    setSelectedDeskId(null);
    setEditingDeskId(null);
    setDeletingDeskId(null);
    clearAction();
  };

  const createDesk = api.desk.createDesk.useMutation({
    onSuccess: (desk) => {
      void utils.desk.listForFloor.invalidate({ floorId: desk.floorId });
      void utils.floor.get.invalidate({ floorId: desk.floorId });
      toast.success(`Desk ${desk.number} created`);
      setSelectedDeskId(desk.id);
      setEditingDeskId(desk.id);
      clearAction();
    },
    onError: (error) => toast.error(error.message),
  });

  const handleToolAction = (objectType: Exclude<EditorObjectType, null>, action: Exclude<EditorAction, null>) => {
    setMode("edit");
    if (objectType === "desks" && action === "edit" && selectedDeskId) {
      setEditingDeskId(selectedDeskId);
      return;
    }
    if (objectType === "desks" && action === "delete" && selectedDeskId) {
      setDeletingDeskId(selectedDeskId);
      return;
    }
    if (activeObjectType === objectType && activeAction === action) {
      clearAction();
      return;
    }
    setActiveObjectType(objectType);
    setActiveAction(action);
  };

  const placingDesk = mode === "edit" && activeObjectType === "desks" && activeAction === "create";
  const planWidth = draftPlan?.imageWidth ?? DEFAULT_PLAN_WIDTH;
  const planHeight = draftPlan?.imageHeight ?? DEFAULT_PLAN_HEIGHT;
  const hasFloorPlan = !!draftPlan?.renderedImageKey;

  const selectors = (
    <div className="flex flex-wrap items-end gap-4">
      <div className="grid min-w-56 gap-1.5">
        <Label htmlFor="editor-site">Site</Label>
        <Select
          value={selectedSiteId ?? ""}
          onValueChange={(val) => {
            setSelectedSiteId(val);
            changeFloor(null);
          }}
        >
          <SelectTrigger id="editor-site" className="w-full">
            <SelectValue placeholder="Select a site…" />
          </SelectTrigger>
          <SelectContent>
            {sites?.map((site) => (
              <SelectItem key={site.id} value={site.id}>
                {site.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid min-w-56 gap-1.5">
        <Label htmlFor="editor-floor">Floor</Label>
        <Select value={selectedFloorId ?? ""} onValueChange={(val) => changeFloor(val)} disabled={!selectedSiteId}>
          <SelectTrigger id="editor-floor" className="w-full">
            <SelectValue placeholder={selectedSiteId ? (floors.length ? "Select a floor…" : "No floors on this site") : "Select a site first"} />
          </SelectTrigger>
          <SelectContent>
            {floors.map((floor) => (
              <SelectItem key={floor.id} value={floor.id}>
                {floor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (!selectedFloorId || !selectedFloor) {
    return (
      <div className="space-y-6 p-8">
        <div>
          <h1 className="text-3xl font-bold">Editing Platform</h1>
          <p className="mt-2 text-gray-600">Choose a site and floor to load its floor plan and desks.</p>
        </div>
        <Card>
          <CardContent className="pt-6">{selectors}</CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-center text-gray-500">Select a site and floor to get started</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <EditorLayout
      floorName={`${selectedSite?.name ?? ""} · ${selectedFloor.name}`}
      mode={mode}
      onModeChange={(next) => {
        setMode(next);
        if (next === "select") clearAction();
      }}
      activeObjectType={mode === "edit" ? activeObjectType : null}
      activeAction={mode === "edit" ? activeAction : null}
      onToolAction={handleToolAction}
      selectionLabel={selectedDesk ? `Desk ${selectedDesk.number}` : null}
      onClearSelection={() => setSelectedDeskId(null)}
      hasFloorPlan={hasFloorPlan}
    >
      <div className="flex flex-col gap-4 p-4">
        {/* Site / Floor selectors stay visible while editing */}
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-white p-3">
          {selectors}
          <div className="flex items-center gap-2">
            <Button
              variant={mode === "edit" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setMode(mode === "edit" ? "select" : "edit");
                clearAction();
              }}
            >
              {mode === "edit" ? "Editing" : "Enter Edit mode"}
            </Button>
            {selectedDesk && mode === "edit" && (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditingDeskId(selectedDesk.id)}>
                  Edit Desk {selectedDesk.number}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeletingDeskId(selectedDesk.id)}>
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>

        {planPending || desksPending ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-center text-gray-500" role="status">
                Loading floor plan and desks…
              </p>
            </CardContent>
          </Card>
        ) : (
          <FloorCanvasEditor
            key={selectedFloorId}
            floorId={selectedFloorId}
            backgroundImageUrl={draftPlan?.renderedImageKey ? `/api/files/${draftPlan.renderedImageKey}` : null}
            imageWidth={planWidth}
            imageHeight={planHeight}
            desks={desks}
            mode={mode}
            activeObjectType={activeObjectType}
            activeAction={activeAction}
            selectedDeskId={selectedDeskId}
            onSelectDesk={setSelectedDeskId}
            placingDesk={placingDesk}
            onPlaceDesk={(x, y) => {
              if (createDesk.isPending) return;
              createDesk.mutate({ floorId: selectedFloorId, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
            }}
            onOpenDesk={(deskId) => {
              setSelectedDeskId(deskId);
              setEditingDeskId(deskId);
              if (activeAction === "edit") clearAction();
            }}
            onRequestDeleteDesk={(deskId) => {
              setSelectedDeskId(deskId);
              setDeletingDeskId(deskId);
              if (activeAction === "delete") clearAction();
            }}
            onCancelAction={clearAction}
          />
        )}

        {/* Floor plan upload / publish — kept, but out of the way of desk editing */}
        <div className="rounded-xl border bg-white">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
            onClick={() => setShowFloorPlanTools((v) => !v)}
            aria-expanded={showFloorPlanTools}
          >
            <span className="flex items-center gap-2">
              <Upload className="size-4" /> Floor plan image &amp; publishing
              {!hasFloorPlan && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">No floor plan uploaded</span>}
            </span>
            <ChevronDown className={`size-4 transition-transform ${showFloorPlanTools ? "rotate-180" : ""}`} />
          </button>
          {showFloorPlanTools && (
            <div className="grid gap-4 border-t p-4 md:grid-cols-2">
              <FloorPlanUpload
                floorId={selectedFloorId}
                floorName={selectedFloor.name}
                onUploadSuccess={() => void utils.floor.getDraftFloorPlan.invalidate({ floorId: selectedFloorId })}
              />
              <PublishControls
                floorId={selectedFloorId}
                draftVersionId={draftPlan?.id}
                onPublishSuccess={() => {
                  void utils.floor.getDraftFloorPlan.invalidate({ floorId: selectedFloorId });
                  void utils.floor.get.invalidate({ floorId: selectedFloorId });
                }}
              />
            </div>
          )}
        </div>
      </div>

      <DeskEditModal
        deskId={editingDeskId}
        open={!!editingDeskId}
        onOpenChange={(open) => !open && setEditingDeskId(null)}
        onSaved={() => {
          void utils.desk.listForFloor.invalidate({ floorId: selectedFloorId });
          void utils.floor.get.invalidate({ floorId: selectedFloorId });
        }}
      />

      <DeleteDeskDialog
        desk={deletingDesk}
        open={!!deletingDeskId}
        onOpenChange={(open) => !open && setDeletingDeskId(null)}
        onDeleted={(deskId) => {
          if (selectedDeskId === deskId) setSelectedDeskId(null);
        }}
        onOpenDeskEditor={(deskId) => setEditingDeskId(deskId)}
      />
    </EditorLayout>
  );
}
