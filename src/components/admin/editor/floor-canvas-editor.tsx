"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Label as KonvaLabel, Layer, Rect, Stage, Tag, Text } from "react-konva";
import type Konva from "konva";
import useImage from "use-image";
import { toast } from "sonner";
import { Crosshair, Trash2 } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EditorAction, EditorMode, EditorObjectType } from "@/components/admin/editor/editor-layout";
import { MARKER, useMarkerSprites, type MarkerSprites } from "@/components/floor-map/desk-markers";
import { MapControls, MapLegend, MapLoadingOverlay } from "@/components/floor-map/map-chrome";
import { COUNTER_SCALE, LABEL_NAME, useMapViewport, type MapViewportControls } from "@/components/floor-map/map-viewport";
import { MAP_BACKGROUND } from "@/components/floor-map/floor-canvas";

/**
 * Admin floor-plan canvas. Every object position is stored in FLOOR-PLAN IMAGE
 * PIXELS (the same coordinate system the employee Floor Map renders), never
 * in viewport pixels: pan/zoom live on the stage transform, so a resize, a
 * zoom or a refresh never moves a desk. Pointer positions are converted with
 * Konva's relative pointer position, which accounts for scale + pan. Markers
 * and labels are counter-scaled to a constant on-screen size.
 */

export interface EditorDesk {
  id: string;
  number: string;
  x: number;
  y: number;
  isActive: boolean;
  requiresCheckIn: boolean;
  restrictionCount: number;
}

interface FloorCanvasEditorProps {
  floorId: string;
  backgroundImageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  desks: EditorDesk[];
  mode: EditorMode;
  activeObjectType: EditorObjectType;
  activeAction: EditorAction;
  selectedDeskId: string | null;
  onSelectDesk: (deskId: string | null) => void;
  /** Placement click while Seats → Create is active; coordinates are image pixels. */
  onPlaceDesk: (x: number, y: number) => void;
  onOpenDesk: (deskId: string) => void;
  onRequestDeleteDesk: (deskId: string) => void;
  onCancelAction: () => void;
  placingDesk: boolean;
  /** Floating content in the canvas's top-right corner (e.g. the neighbourhood desk picker). */
  overlay?: React.ReactNode;
}

const RESTRICTION_BADGE = "#d9692a";
const FONT = "Inter, Arial, sans-serif";

export function FloorCanvasEditor({
  floorId,
  backgroundImageUrl,
  imageWidth,
  imageHeight,
  desks,
  mode,
  activeObjectType,
  activeAction,
  selectedDeskId,
  onSelectDesk,
  onPlaceDesk,
  onOpenDesk,
  onRequestDeleteDesk,
  onCancelAction,
  placingDesk,
  overlay,
}: FloorCanvasEditorProps) {
  const utils = api.useUtils();
  const { containerRef, stageRef, size, stageHandlers, controls } = useMapViewport({ contentWidth: imageWidth, contentHeight: imageHeight });
  const { refresh } = controls;
  const [image, imageStatus] = useImage(backgroundImageUrl ?? "");
  const { sprites, iconSource } = useMarkerSprites();
  const ghostRef = useRef<Konva.Group>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [selectedUtilityId, setSelectedUtilityId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [newUtilityType, setNewUtilityType] = useState("");
  const [newUtilityLabel, setNewUtilityLabel] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ kind: "utility" | "room"; id: string; label: string } | null>(null);

  // Local drag positions so a desk doesn't snap back while its move is saving.
  const [dragOverrides, setDragOverrides] = useState<Record<string, { x: number; y: number }>>({});

  const { data: utilities = [] } = api.floor.listUtilities.useQuery({ floorId });
  const { data: rooms = [] } = api.floor.listRooms.useQuery({ floorId });

  const isEdit = mode === "edit";
  const placingUtility = isEdit && activeObjectType === "utilities" && activeAction === "create";
  const placingRoom = isEdit && activeObjectType === "rooms" && activeAction === "create";
  const placing = placingDesk || placingUtility || placingRoom;

  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelAction();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, onCancelAction]);

  const clamp = useCallback(
    (x: number, y: number) => ({
      x: Math.min(Math.max(0, x), imageWidth),
      y: Math.min(Math.max(0, y), imageHeight),
    }),
    [imageWidth, imageHeight],
  );

  const moveDesk = api.desk.moveDesk.useMutation({
    onSuccess: (moved) => {
      utils.desk.listForFloor.setData({ floorId }, (current) => current?.map((d) => (d.id === moved.id ? { ...d, x: moved.x, y: moved.y } : d)));
      setDragOverrides((current) => {
        const next = { ...current };
        delete next[moved.id];
        return next;
      });
      toast.success(`Desk ${moved.number} moved`);
    },
    onError: (error, variables) => {
      setDragOverrides((current) => {
        const next = { ...current };
        delete next[variables.deskId];
        return next;
      });
      toast.error(error.message);
    },
  });

  const createUtility = api.floor.createUtility.useMutation({
    onSuccess: (utility) => {
      void utils.floor.listUtilities.invalidate({ floorId });
      toast.success(`Utility ${utility.label ?? utility.type} placed`);
      setNewUtilityType("");
      setNewUtilityLabel("");
      onCancelAction();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateUtility = api.floor.updateUtility.useMutation({
    onSuccess: () => void utils.floor.listUtilities.invalidate({ floorId }),
    onError: (error) => {
      toast.error(error.message);
      void utils.floor.listUtilities.invalidate({ floorId });
    },
  });
  const deleteUtility = api.floor.deleteUtility.useMutation({
    onSuccess: () => {
      void utils.floor.listUtilities.invalidate({ floorId });
      setSelectedUtilityId(null);
      toast.success("Utility deleted");
    },
    onError: (error) => toast.error(error.message),
  });
  const createRoom = api.floor.createRoom.useMutation({
    onSuccess: (room) => {
      void utils.floor.listRooms.invalidate({ floorId });
      toast.success(`Room ${room.name} placed`);
      setNewRoomName("");
      onCancelAction();
    },
    onError: (error) => toast.error(error.message),
  });
  const updateRoom = api.floor.updateRoom.useMutation({
    onSuccess: () => void utils.floor.listRooms.invalidate({ floorId }),
    onError: (error) => {
      toast.error(error.message);
      void utils.floor.listRooms.invalidate({ floorId });
    },
  });
  const deleteRoom = api.floor.deleteRoom.useMutation({
    onSuccess: () => {
      void utils.floor.listRooms.invalidate({ floorId });
      setSelectedRoomId(null);
      toast.success("Room deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  /** Image-space pointer position, or null when outside the plan. */
  const pointerInImage = () => {
    const stage = stageRef.current;
    const pos = stage?.getRelativePointerPosition();
    if (!pos) return null;
    if (pos.x < 0 || pos.y < 0 || pos.x > imageWidth || pos.y > imageHeight) return null;
    return pos;
  };

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    const clickedBackground = e.target === stage || e.target.name() === "background";

    if (placing) {
      const pos = pointerInImage();
      if (!pos) return;
      if (placingDesk) onPlaceDesk(pos.x, pos.y);
      else if (placingUtility) {
        if (!newUtilityType.trim()) {
          toast.error("Enter a utility type first");
          return;
        }
        createUtility.mutate({ floorId, type: newUtilityType.trim(), label: newUtilityLabel.trim() || undefined, x: pos.x, y: pos.y });
      } else if (placingRoom) {
        if (!newRoomName.trim()) {
          toast.error("Enter a room name first");
          return;
        }
        createRoom.mutate({ floorId, name: newRoomName.trim(), x: pos.x, y: pos.y, width: Math.round(imageWidth * 0.08), height: Math.round(imageWidth * 0.06) });
      }
      return;
    }

    if (clickedBackground) {
      onSelectDesk(null);
      setSelectedUtilityId(null);
      setSelectedRoomId(null);
    }
  };

  const handleDeskClick = (deskId: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (placing) return; // let the click bubble to the stage and place there
    e.cancelBubble = true;
    onSelectDesk(deskId);
    if (isEdit && activeObjectType === "desks" && activeAction === "delete") onRequestDeleteDesk(deskId);
    else if (isEdit && activeObjectType === "desks" && activeAction === "edit") onOpenDesk(deskId);
  };

  const handleDeskDragEnd = (desk: EditorDesk, e: Konva.KonvaEventObject<DragEvent>) => {
    const next = clamp(e.target.x(), e.target.y());
    e.target.position(next);
    if (next.x === desk.x && next.y === desk.y) return;
    setDragOverrides((current) => ({ ...current, [desk.id]: next }));
    moveDesk.mutate({ deskId: desk.id, x: next.x, y: next.y });
  };

  const cursor = placing ? "crosshair" : isEdit ? "default" : "grab";
  const planReady = !backgroundImageUrl || imageStatus === "loaded" || imageStatus === "failed";
  const ready = planReady && !!sprites && size.width > 0;

  useLayoutEffect(() => {
    refresh();
  });

  /** The placement ghost follows the pointer imperatively — no React render per mouse move. */
  const moveGhost = () => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    const pos = placing ? pointerInImage() : null;
    ghost.visible(!!pos);
    if (pos) ghost.position(pos);
    ghost.getLayer()?.batchDraw();
  };

  const deleteHint =
    isEdit && activeAction === "delete"
      ? activeObjectType === "utilities"
        ? "Click a utility to delete it"
        : activeObjectType === "rooms"
          ? "Click a room to delete it"
          : activeObjectType === "desks"
            ? "Click a desk to delete it"
            : null
      : null;

  return (
    <div ref={wrapperRef} className={cn("relative h-full min-h-0 w-full overflow-hidden", MAP_BACKGROUND)}>
      <div
        ref={containerRef}
        className={cn("absolute inset-0 transition-shadow duration-150", placing && "ring-cyan/70 ring-2 ring-inset")}
        style={{ cursor }}
        data-testid="floor-canvas-editor"
      >
        {size.width > 0 && (
          <Stage
            ref={stageRef}
            width={size.width}
            height={size.height}
            draggable={!placing}
            {...stageHandlers}
            onClick={handleStageClick}
            onTap={handleStageClick}
            onMouseMove={moveGhost}
            onMouseLeave={() => {
              ghostRef.current?.visible(false);
              ghostRef.current?.getLayer()?.batchDraw();
            }}
          >
            <Layer>
              {image ? (
                <>
                  <Rect width={imageWidth} height={imageHeight} fill="#ffffff" listening={false} />
                  <KonvaImage name="background" image={image} width={imageWidth} height={imageHeight} perfectDrawEnabled={false} />
                </>
              ) : (
                <Rect name="background" width={imageWidth} height={imageHeight} fill="#f6f8fa" stroke="#cfd7e0" strokeWidth={1} strokeScaleEnabled={false} dash={[6, 4]} />
              )}

              {rooms.map((room) => {
                const selected = selectedRoomId === room.id;
                return (
                  <Group
                    key={room.id}
                    x={room.x}
                    y={room.y}
                    draggable={isEdit && !placing}
                    onClick={(e) => {
                      if (placing) return;
                      e.cancelBubble = true;
                      setSelectedRoomId(room.id);
                      if (isEdit && activeObjectType === "rooms" && activeAction === "delete") setPendingDelete({ kind: "room", id: room.id, label: room.name });
                    }}
                    onDragEnd={(e) => {
                      e.cancelBubble = true;
                      const next = clamp(e.target.x(), e.target.y());
                      e.target.position(next);
                      updateRoom.mutate({ roomId: room.id, name: room.name, x: next.x, y: next.y, width: room.width, height: room.height });
                    }}
                  >
                    <Rect
                      width={room.width}
                      height={room.height}
                      fill={selected ? "rgba(29, 191, 194, 0.16)" : "rgba(0, 38, 76, 0.07)"}
                      stroke={selected ? "#1dbfc2" : "rgba(0, 38, 76, 0.45)"}
                      strokeWidth={selected ? 2 : 1}
                      strokeScaleEnabled={false}
                      cornerRadius={3}
                    />
                    <Group name={COUNTER_SCALE} listening={false}>
                      <Text x={6} y={5} text={room.name} fontSize={11} fontStyle="600" fontFamily={FONT} fill="#0d2137" />
                    </Group>
                  </Group>
                );
              })}

              {utilities.map((utility) => {
                const selected = selectedUtilityId === utility.id;
                return (
                  <Group
                    key={utility.id}
                    x={utility.x}
                    y={utility.y}
                    name={COUNTER_SCALE}
                    draggable={isEdit && !placing}
                    onClick={(e) => {
                      if (placing) return;
                      e.cancelBubble = true;
                      setSelectedUtilityId(utility.id);
                      if (isEdit && activeObjectType === "utilities" && activeAction === "delete")
                        setPendingDelete({ kind: "utility", id: utility.id, label: utility.label ?? utility.type });
                    }}
                    onDragEnd={(e) => {
                      e.cancelBubble = true;
                      const next = clamp(e.target.x(), e.target.y());
                      e.target.position(next);
                      updateUtility.mutate({ utilityId: utility.id, type: utility.type, label: utility.label ?? undefined, x: next.x, y: next.y });
                    }}
                  >
                    <Circle radius={selected ? 8 : 6.5} fill="#0e7c86" stroke={selected ? "#1dbfc2" : "#ffffff"} strokeWidth={selected ? 3 : 2} />
                    <Text x={11} y={-6} text={utility.label ?? utility.type} fontSize={11} fontStyle="500" fontFamily={FONT} fill="#0e5a61" listening={false} />
                  </Group>
                );
              })}

              {sprites && (
                <EditorDeskMarkers
                  desks={desks}
                  sprites={sprites}
                  dragOverrides={dragOverrides}
                  selectedDeskId={selectedDeskId}
                  draggable={isEdit && !placing}
                  placing={placing}
                  isEdit={isEdit}
                  cursor={cursor}
                  controls={controls}
                  onClick={handleDeskClick}
                  onDblClick={(deskId, e) => {
                    if (placing) return;
                    e.cancelBubble = true;
                    if (isEdit) onOpenDesk(deskId);
                  }}
                  onDragStart={(deskId, e) => {
                    e.cancelBubble = true;
                    onSelectDesk(deskId);
                  }}
                  onDragEnd={handleDeskDragEnd}
                />
              )}

              <Group ref={ghostRef} name={COUNTER_SCALE} visible={false} listening={false} opacity={0.9}>
                {placingDesk && sprites?.get("ghost") && (
                  <>
                    <KonvaImage image={sprites.get("ghost")} x={-MARKER.anchorX} y={-MARKER.anchorY} width={MARKER.width} height={MARKER.height} />
                    <KonvaLabel ref={(node) => { node?.offsetX(node.width() / 2); }} y={MARKER.height - MARKER.anchorY + 2}>
                      <Tag fill="#012b30" cornerRadius={5} />
                      <Text text="New desk" fontSize={10.5} fontStyle="600" fontFamily={FONT} padding={3} fill="#ffffff" />
                    </KonvaLabel>
                  </>
                )}
                {(placingUtility || placingRoom) && <Circle radius={7} fill="rgba(14, 124, 134, 0.55)" stroke="#ffffff" strokeWidth={2} />}
              </Group>
            </Layer>
          </Stage>
        )}
      </div>

      <MapLoadingOverlay visible={!ready} />

      {/* Placement forms for map objects that need a name before placing */}
      {(placingUtility || placingRoom) && (
        <div className="bg-surface animate-in fade-in-0 slide-in-from-top-1 absolute top-4 left-4 z-10 w-72 space-y-3 rounded-2xl border p-4 shadow-lg duration-200">
          <p className="type-card-title">{placingUtility ? "New utility" : "New room or space"}</p>
          {placingUtility ? (
            <>
              <div className="grid gap-1.5">
                <Label htmlFor="new-utility-type">Utility type</Label>
                <Input id="new-utility-type" placeholder="Printer, Kitchen, Lift…" value={newUtilityType} onChange={(e) => setNewUtilityType(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="new-utility-label">Label (optional)</Label>
                <Input id="new-utility-label" value={newUtilityLabel} onChange={(e) => setNewUtilityLabel(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="grid gap-1.5">
              <Label htmlFor="new-room-name">Room name</Label>
              <Input id="new-room-name" placeholder="Meeting Room A" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="type-helper">Then click the floor plan to place it.</p>
            <Button size="sm" variant="outline" onClick={onCancelAction}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {(placingDesk || deleteHint) && (
        <div className="pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2">
          <span
            className={cn(
              "animate-in fade-in-0 slide-in-from-top-1 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.8125rem] font-semibold shadow-md duration-200",
              deleteHint ? "bg-danger text-white" : "bg-navy text-white",
            )}
            role="status"
          >
            {deleteHint ? <Trash2 className="size-4" /> : <Crosshair className="text-cyan size-4" />}
            {deleteHint ?? "Click the floor plan to place the desk"}
            <kbd className="rounded bg-white/15 px-1.5 py-0.5 text-[0.6875rem] font-medium">Esc</kbd>
          </span>
        </div>
      )}

      {overlay && <div className="absolute top-4 right-4 z-10">{overlay}</div>}

      <MapLegend
        className="absolute bottom-4 left-4 z-10 max-w-[calc(100%-6rem)]"
        entries={[
          { kind: "editor-active", label: "Active desk" },
          { kind: "editor-inactive", label: "Inactive desk" },
        ]}
        extra={
          <>
            <span className="text-text-secondary flex items-center gap-2 font-medium">
              <span aria-hidden className="size-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: RESTRICTION_BADGE }} />
              Has restrictions
            </span>
            <span className="text-muted-foreground border-l pl-4 tabular-nums">
              {desks.length} desk{desks.length === 1 ? "" : "s"} · {utilities.length} utilities · {rooms.length} rooms
            </span>
          </>
        }
      />
      <MapControls viewport={controls} className="absolute right-4 bottom-4 z-10" fullscreenTarget={wrapperRef} />
      {iconSource}

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {pendingDelete?.kind} “{pendingDelete?.label}”?
            </DialogTitle>
            <DialogDescription>This removes the {pendingDelete?.kind} from the floor plan. This can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteUtility.isPending || deleteRoom.isPending}
              onClick={() => {
                if (!pendingDelete) return;
                if (pendingDelete.kind === "utility") deleteUtility.mutate({ utilityId: pendingDelete.id });
                else deleteRoom.mutate({ roomId: pendingDelete.id });
                setPendingDelete(null);
                onCancelAction();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface EditorDeskMarkersProps {
  desks: EditorDesk[];
  sprites: MarkerSprites;
  dragOverrides: Record<string, { x: number; y: number }>;
  selectedDeskId: string | null;
  draggable: boolean;
  placing: boolean;
  isEdit: boolean;
  cursor: string;
  controls: MapViewportControls;
  onClick: (deskId: string, e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onDblClick: (deskId: string, e: Konva.KonvaEventObject<MouseEvent>) => void;
  onDragStart: (deskId: string, e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (desk: EditorDesk, e: Konva.KonvaEventObject<DragEvent>) => void;
}

const EditorDeskMarkers = memo(function EditorDeskMarkers({
  desks,
  sprites,
  dragOverrides,
  selectedDeskId,
  draggable,
  placing,
  isEdit,
  cursor,
  controls,
  onClick,
  onDblClick,
  onDragStart,
  onDragEnd,
}: EditorDeskMarkersProps) {
  const { refresh, labelsVisible } = controls;
  useLayoutEffect(() => {
    refresh();
  });

  const ordered = selectedDeskId ? [...desks.filter((d) => d.id !== selectedDeskId), ...desks.filter((d) => d.id === selectedDeskId)] : desks;

  return (
    <>
      {ordered.map((desk) => {
        const position = dragOverrides[desk.id] ?? { x: desk.x, y: desk.y };
        const selected = desk.id === selectedDeskId;
        const kind = desk.isActive ? "editor-active" : "editor-inactive";
        return (
          <Group
            key={desk.id}
            x={position.x}
            y={position.y}
            name={COUNTER_SCALE}
            draggable={draggable}
            onClick={(e) => onClick(desk.id, e)}
            onTap={(e) => onClick(desk.id, e)}
            onDblClick={(e) => onDblClick(desk.id, e)}
            onDragStart={(e) => onDragStart(desk.id, e)}
            onDragEnd={(e) => {
              e.cancelBubble = true;
              onDragEnd(desk, e);
            }}
            // Hover shows the desk number only. The group's scale is owned by the viewport's
            // counter-scaling — animating it here would resize markers mid-zoom.
            onMouseEnter={(e) => {
              if (placing) return;
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = isEdit ? "move" : "pointer";
              (e.currentTarget as Konva.Group).findOne(`.${LABEL_NAME}`)?.visible(true);
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = cursor;
              if (!selected && !labelsVisible()) (e.currentTarget as Konva.Group).findOne(`.${LABEL_NAME}`)?.visible(false);
            }}
          >
            <KonvaImage
              image={sprites.get(selected ? `${kind}:selected` : kind)}
              x={-MARKER.anchorX}
              y={-MARKER.anchorY}
              width={MARKER.width}
              height={MARKER.height}
              perfectDrawEnabled={false}
            />
            {desk.restrictionCount > 0 && (
              <Circle
                x={MARKER.badgeOffset}
                y={-MARKER.badgeOffset}
                radius={MARKER.badgeRadius}
                fill={RESTRICTION_BADGE}
                stroke="#ffffff"
                strokeWidth={1.5}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            <KonvaLabel
              ref={(node) => {
                node?.offsetX(node.width() / 2);
              }}
              name={selected ? undefined : LABEL_NAME}
              y={MARKER.height - MARKER.anchorY + 2}
              listening={false}
            >
              <Tag fill={selected ? "#00264c" : "#ffffff"} stroke={selected ? "#00264c" : "#d3dbe4"} strokeWidth={1} cornerRadius={5} perfectDrawEnabled={false} />
              <Text text={desk.number} fontSize={10.5} fontStyle="600" fontFamily={FONT} padding={3} fill={selected ? "#ffffff" : "#0d2137"} perfectDrawEnabled={false} />
            </KonvaLabel>
          </Group>
        );
      })}
    </>
  );
});

