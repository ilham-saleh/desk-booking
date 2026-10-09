"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Edit2, Layers, PencilRuler, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import {
  pickValidId,
  useLastFloorLocation,
  useSaveLastFloorLocation,
  useSyncedQueryParams,
} from "@/lib/use-floor-location";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PublishControls } from "@/components/admin/editor/publish-controls";
import { FloorCanvasEditor, type EditorDesk } from "@/components/admin/editor/floor-canvas-editor";
import { FloorPlanUpload } from "@/components/admin/editor/floor-plan-upload";
import {
  EditorLayout,
  type EditorAction,
  type EditorMode,
  type EditorObjectType,
} from "@/components/admin/editor/editor-layout";
import { DeleteDeskDialog } from "@/components/admin/editor/delete-desk-dialog";
import { NeighbourhoodEditorDialogV2 } from "@/components/admin/editor/neighbourhood-editor-dialog-v2";
import { NeighbourhoodDeskSelector } from "@/components/admin/editor/neighbourhood-desk-selector";
import { DeskEditModal } from "@/components/admin/desk-edit-modal";
import { MAP_BACKGROUND } from "@/components/floor-map/floor-canvas";
import { MapLoadingOverlay } from "@/components/floor-map/map-chrome";
import { MarkerSizeControl } from "@/components/admin/editor/marker-size-control";
import { autoMarkerFootprint, markerFootprintBounds } from "@/components/floor-map/marker-scale";

const DEFAULT_PLAN_WIDTH = 1200;
const DEFAULT_PLAN_HEIGHT = 800;

export default function AdminEditorPage() {
  const searchParams = useSearchParams();
  const [linked] = useState(() => ({
    siteId: searchParams.get("site"),
    floorId: searchParams.get("floor"),
  }));
  const lastViewed = useLastFloorLocation();
  /** Explicit picks in this visit; null falls back to the URL, then the last floor viewed. */
  const [siteChoice, setSelectedSiteId] = useState<string | null>(null);
  const [floorChoice, setSelectedFloorId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("select");
  const [activeObjectType, setActiveObjectType] = useState<EditorObjectType>(null);
  const [activeAction, setActiveAction] = useState<EditorAction>(null);
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [editingDeskId, setEditingDeskId] = useState<string | null>(null);
  const [deletingDeskId, setDeletingDeskId] = useState<string | null>(null);
  const [editingNeighbourhoodId, setEditingNeighbourhoodId] = useState<string | null>(null);
  const [selectingNeighbourhoodDesks, setSelectingNeighbourhoodDesks] = useState(false);
  const [selectedNeighbourhoodDeskIds, setSelectedNeighbourhoodDeskIds] = useState<string[]>([]);
  const [showFloorPlanTools, setShowFloorPlanTools] = useState(false);
  /** Unsaved marker size shown on the canvas while the slider moves, tied to one plan image. */
  const [markerPreview, setMarkerPreview] = useState<{ planKey: string; size: number | null } | null>(null);
  /** Re-uploads keep the same storage key, so count them to reset the marker-size control. */
  const [planUploads, setPlanUploads] = useState(0);

  const utils = api.useUtils();
  const { data: sites } = api.facility.list.useQuery();
  // Restored ids are only used once they're confirmed against what this admin can manage.
  const selectedSiteId =
    siteChoice ??
    (sites
      ? (pickValidId(
          [linked.siteId, lastViewed?.siteId],
          sites.map((s) => s.id),
        ) ?? null)
      : null);
  const { data: floorList } = api.floor.listForSite.useQuery(
    { siteId: selectedSiteId! },
    { enabled: !!selectedSiteId },
  );
  const floors = floorList ?? [];
  const selectedFloorId =
    floorChoice ??
    (floorList
      ? (pickValidId(
          [
            linked.siteId === selectedSiteId ? linked.floorId : null,
            lastViewed?.siteId === selectedSiteId ? lastViewed.floorId : null,
          ],
          floorList.map((f) => f.id),
        ) ?? null)
      : null);
  useSaveLastFloorLocation(selectedSiteId, selectedFloorId);
  useSyncedQueryParams(
    { site: selectedSiteId, floor: selectedFloorId },
    !!sites && (!selectedSiteId || !!floorList),
  );
  const { data: draftPlan, isPending: planPending } = api.floor.getDraftFloorPlan.useQuery(
    { floorId: selectedFloorId! },
    { enabled: !!selectedFloorId },
  );
  const { data: floorDesks = [], isPending: desksPending } = api.desk.listForFloor.useQuery(
    { floorId: selectedFloorId! },
    { enabled: !!selectedFloorId },
  );
  const { data: neighbourhoods = [] } = api.neighbourhood.listForFloor.useQuery(
    { floorId: selectedFloorId! },
    { enabled: !!selectedFloorId },
  );

  const selectedFloor = floors.find((f) => f.id === selectedFloorId);
  const editingNeighbourhood = neighbourhoods.find((n) => n.id === editingNeighbourhoodId) ?? null;

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

  const handleToolAction = (
    objectType: Exclude<EditorObjectType, null>,
    action: Exclude<EditorAction, null>,
  ) => {
    setMode("edit");
    if (objectType === "desks" && action === "edit" && selectedDeskId) {
      setEditingDeskId(selectedDeskId);
      return;
    }
    if (objectType === "desks" && action === "delete" && selectedDeskId) {
      setDeletingDeskId(selectedDeskId);
      return;
    }
    if (objectType === "neighbourhoods" && action === "create") {
      setSelectingNeighbourhoodDesks(true);
      setSelectedNeighbourhoodDeskIds([]);
      return;
    }
    if (objectType === "neighbourhoods" && action === "edit" && editingNeighbourhood) {
      // neighbourhoodId is already in editingNeighbourhoodId state; just open the dialog
      return;
    }
    if (objectType === "neighbourhoods" && action === "delete") {
      // Implement delete in a later phase
      toast.error("Delete not yet implemented");
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
  const planKey = draftPlan ? `${draftPlan.id}:${draftPlan.renderedImageKey ?? ""}:${planUploads}` : "";
  const markerSize =
    markerPreview && markerPreview.planKey === planKey ? markerPreview.size : (draftPlan?.markerSize ?? null);
  const autoMarkerSize = useMemo(() => autoMarkerFootprint(desks, planWidth, planHeight), [desks, planWidth, planHeight]);

  const selectors = (
    <>
      <Label htmlFor="editor-site" className="sr-only">
        Site
      </Label>
      <Select
        value={selectedSiteId ?? ""}
        onValueChange={(val) => {
          setSelectedSiteId(val);
          changeFloor(null);
        }}
      >
        <SelectTrigger id="editor-site" className="w-48">
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="text-muted-foreground size-4" />
            <SelectValue placeholder="Select a site…" />
          </span>
        </SelectTrigger>
        <SelectContent>
          {sites?.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor="editor-floor" className="sr-only">
        Floor
      </Label>
      <Select
        value={selectedFloorId ?? ""}
        onValueChange={(val) => changeFloor(val)}
        disabled={!selectedSiteId}
      >
        <SelectTrigger id="editor-floor" className="w-44">
          <span className="flex min-w-0 items-center gap-2">
            <Layers className="text-muted-foreground size-4" />
            <SelectValue
              placeholder={
                selectedSiteId
                  ? floors.length
                    ? "Select a floor…"
                    : "No floors on this site"
                  : "Select a site first"
              }
            />
          </span>
        </SelectTrigger>
        <SelectContent>
          {floors.map((floor) => (
            <SelectItem key={floor.id} value={floor.id}>
              {floor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );

  const floorReady = !!selectedFloorId && !!selectedFloor;

  const toolbar = (
    <>
      <h1 className="sr-only">Editing Platform</h1>
      {selectors}
      {floorReady && (
        <Badge variant={mode === "edit" ? "brand" : "muted"} dot className="ml-1">
          {mode === "edit" ? "Editing" : "View only"}
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-2">
        {selectedDesk && mode === "edit" && (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditingDeskId(selectedDesk.id)}>
              <Edit2 /> Edit desk {selectedDesk.number}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => setDeletingDeskId(selectedDesk.id)}
            >
              <Trash2 /> Delete
            </Button>
          </>
        )}
        {floorReady && (
          <Button
            size="sm"
            variant={mode === "edit" ? "secondary" : "default"}
            onClick={() => {
              setMode(mode === "edit" ? "select" : "edit");
              clearAction();
            }}
          >
            {mode === "edit" ? "Done editing" : "Enter edit mode"}
          </Button>
        )}
      </div>
    </>
  );

  return (
    <EditorLayout
      toolbar={toolbar}
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
      floorSelected={floorReady}
      onOpenFloorPlan={() => setShowFloorPlanTools(true)}
      floorPlanSettings={
        floorReady && hasFloorPlan && draftPlan && selectedFloorId ? (
          <MarkerSizeControl
            key={planKey}
            floorId={selectedFloorId}
            savedSize={draftPlan.markerSize}
            autoSize={autoMarkerSize}
            bounds={markerFootprintBounds(planWidth, planHeight)}
            disabled={mode !== "edit"}
            onPreview={(size) => setMarkerPreview(size === undefined ? null : { planKey, size })}
          />
        ) : null
      }
    >
      {!floorReady || !selectedFloorId || !selectedFloor ? (
        <div className={`flex h-full items-center justify-center p-6 ${MAP_BACKGROUND}`}>
          <EmptyState
            icon={PencilRuler}
            title="Choose a floor to edit"
            description="Pick a site and floor in the bar above to load its floor plan, desks, rooms and utilities."
            className="bg-surface max-w-sm rounded-2xl border shadow-sm"
          />
        </div>
      ) : planPending || desksPending ? (
        <div className={`relative h-full ${MAP_BACKGROUND}`}>
          <MapLoadingOverlay visible label="Loading floor plan and desks…" />
        </div>
      ) : (
        <FloorCanvasEditor
          key={selectedFloorId}
          floorId={selectedFloorId}
          backgroundImageUrl={
            draftPlan?.renderedImageKey ? `/api/files/${draftPlan.renderedImageKey}` : null
          }
          imageWidth={planWidth}
          imageHeight={planHeight}
          markerSize={markerSize}
          desks={desks}
          mode={mode}
          activeObjectType={activeObjectType}
          activeAction={activeAction}
          selectedDeskId={selectedDeskId}
          onSelectDesk={setSelectedDeskId}
          placingDesk={placingDesk}
          onPlaceDesk={(x, y) => {
            if (createDesk.isPending) return;
            createDesk.mutate({
              floorId: selectedFloorId,
              x: Math.round(x * 100) / 100,
              y: Math.round(y * 100) / 100,
            });
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
          overlay={
            selectingNeighbourhoodDesks ? (
              <NeighbourhoodDeskSelector
                desks={floorDesks.map((d) => ({ id: d.id, number: d.number, x: d.x, y: d.y }))}
                onSelectionComplete={(deskIds) => {
                  setSelectedNeighbourhoodDeskIds(deskIds);
                  setSelectingNeighbourhoodDesks(false);
                  setEditingNeighbourhoodId("__new__");
                }}
                onCancel={() => {
                  setSelectingNeighbourhoodDesks(false);
                  setSelectedNeighbourhoodDeskIds([]);
                  clearAction();
                }}
              />
            ) : undefined
          }
        />
      )}

      {selectedFloorId && selectedFloor && (
        <Dialog open={showFloorPlanTools} onOpenChange={setShowFloorPlanTools}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Floor plan · {selectedFloor.name}</DialogTitle>
              <DialogDescription>
                Upload a new floor plan image as a draft, then publish it to the live Floor Map.
                Replacing a plan can misalign existing desks — check their positions after
                publishing.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <FloorPlanUpload
                floorId={selectedFloorId}
                floorName={selectedFloor.name}
                onUploadSuccess={() => {
                  // A new image resets the saved size to automatic on the server.
                  setMarkerPreview(null);
                  setPlanUploads((n) => n + 1);
                  void utils.floor.getDraftFloorPlan.invalidate({ floorId: selectedFloorId });
                }}
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
          </DialogContent>
        </Dialog>
      )}

      {selectedFloorId && (
        <>
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

          <NeighbourhoodEditorDialogV2
            open={!!editingNeighbourhoodId}
            neighbourhood={editingNeighbourhoodId === "__new__" ? null : editingNeighbourhood}
            floorId={selectedFloorId}
            desks={floorDesks.map((d) => ({ id: d.id, number: d.number }))}
            preSelectedDeskIds={
              editingNeighbourhoodId === "__new__" ? selectedNeighbourhoodDeskIds : []
            }
            onClose={() => {
              setEditingNeighbourhoodId(null);
              setSelectedNeighbourhoodDeskIds([]);
            }}
            onSuccess={() => {
              void utils.neighbourhood.listForFloor.invalidate({ floorId: selectedFloorId });
              void utils.floor.get.invalidate({ floorId: selectedFloorId });
              setSelectedNeighbourhoodDeskIds([]);
            }}
          />
        </>
      )}
    </EditorLayout>
  );
}
