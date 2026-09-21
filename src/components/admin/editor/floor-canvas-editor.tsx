"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import type Konva from "konva";
import useImage from "use-image";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EditorAction, EditorMode, EditorObjectType } from "@/components/admin/editor/editor-layout";

/**
 * Admin floor-plan canvas. Every object position is stored in FLOOR-PLAN IMAGE
 * PIXELS (the same coordinate system the employee Floor Map renders), never
 * in viewport pixels: the stage is scaled to the container so a resize, a
 * zoom or a refresh never moves a desk. Pointer positions are converted with
 * Konva's relative pointer position, which accounts for scale + pan.
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
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;

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
}: FloorCanvasEditorProps) {
  const utils = api.useUtils();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [image] = useImage(backgroundImageUrl ?? "");

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
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!placing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelAction();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, onCancelAction]);

  const baseScale = containerWidth > 0 ? containerWidth / imageWidth : 1;
  const scale = baseScale * zoom;
  const stageWidth = containerWidth || imageWidth;
  const stageHeight = Math.round(imageHeight * baseScale);
  const markerRadius = 13 / scale;
  const fontSize = 11 / scale;

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

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const oldScale = stage.scaleX();
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, e.evt.deltaY > 0 ? zoom / 1.1 : zoom * 1.1));
    const newScale = baseScale * nextZoom;
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    setZoom(nextZoom);
    setPan({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
  };

  const cursor = placing ? "crosshair" : isEdit ? "default" : "grab";

  return (
    <div className="space-y-3">
      {/* Placement forms for map objects that need a name before placing */}
      {placingUtility && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border bg-white p-3">
          <div className="grid gap-1">
            <Label htmlFor="new-utility-type">Utility type</Label>
            <Input id="new-utility-type" placeholder="Printer, Kitchen, Lift…" value={newUtilityType} onChange={(e) => setNewUtilityType(e.target.value)} className="w-48" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-utility-label">Label (optional)</Label>
            <Input id="new-utility-label" value={newUtilityLabel} onChange={(e) => setNewUtilityLabel(e.target.value)} className="w-48" />
          </div>
          <p className="text-muted-foreground text-xs">Then click the floor plan to place it.</p>
          <Button size="sm" variant="outline" onClick={onCancelAction}>
            Cancel
          </Button>
        </div>
      )}
      {placingRoom && (
        <div className="flex flex-wrap items-end gap-2 rounded-md border bg-white p-3">
          <div className="grid gap-1">
            <Label htmlFor="new-room-name">Room name</Label>
            <Input id="new-room-name" placeholder="Meeting Room A" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} className="w-56" />
          </div>
          <p className="text-muted-foreground text-xs">Then click the floor plan to place it.</p>
          <Button size="sm" variant="outline" onClick={onCancelAction}>
            Cancel
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {placingDesk && (
          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700" role="status">
            Placing a desk — click the floor plan (Esc to cancel)
          </span>
        )}
        {isEdit && activeObjectType === "utilities" && activeAction === "delete" && (
          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800" role="status">
            Click a utility to delete it
          </span>
        )}
        {isEdit && activeObjectType === "rooms" && activeAction === "delete" && (
          <span className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800" role="status">
            Click a room to delete it
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Zoom {Math.round(zoom * 100)}%</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            Reset View
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className={cn("relative w-full overflow-hidden rounded-lg border bg-gray-100", placing && "ring-2 ring-blue-400")}
        style={{ cursor }}
        data-testid="floor-canvas-editor"
      >
        {containerWidth > 0 && (
          <Stage
            ref={stageRef}
            width={stageWidth}
            height={stageHeight}
            scaleX={scale}
            scaleY={scale}
            x={pan.x}
            y={pan.y}
            draggable={!placing}
            onDragEnd={(e) => {
              if (e.target === e.target.getStage()) setPan({ x: e.target.x(), y: e.target.y() });
            }}
            onClick={handleStageClick}
            onTap={handleStageClick}
            onWheel={handleWheel}
            onMouseMove={() => {
              if (placing) setGhost(pointerInImage());
            }}
            onMouseLeave={() => setGhost(null)}
          >
            <Layer>
              {image ? (
                <KonvaImage name="background" image={image} width={imageWidth} height={imageHeight} />
              ) : (
                <Rect name="background" width={imageWidth} height={imageHeight} fill="#f3f4f6" stroke="#d1d5db" strokeWidth={1 / scale} />
              )}
              {!backgroundImageUrl && (
                <Text
                  text="No floor plan uploaded yet — desks can still be placed on this blank plan"
                  x={imageWidth * 0.1}
                  y={imageHeight / 2 - fontSize}
                  width={imageWidth * 0.8}
                  align="center"
                  fontSize={fontSize * 1.4}
                  fill="#6b7280"
                  listening={false}
                />
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
                      const next = clamp(e.target.x(), e.target.y());
                      e.target.position(next);
                      updateRoom.mutate({ roomId: room.id, name: room.name, x: next.x, y: next.y, width: room.width, height: room.height });
                    }}
                  >
                    <Rect width={room.width} height={room.height} fill="rgba(99, 102, 241, 0.18)" stroke={selected ? "#4338ca" : "#6366f1"} strokeWidth={(selected ? 2 : 1) / scale} />
                    <Text text={room.name} x={4 / scale} y={4 / scale} fontSize={fontSize} fill="#3730a3" listening={false} />
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
                    draggable={isEdit && !placing}
                    onClick={(e) => {
                      if (placing) return;
                      e.cancelBubble = true;
                      setSelectedUtilityId(utility.id);
                      if (isEdit && activeObjectType === "utilities" && activeAction === "delete")
                        setPendingDelete({ kind: "utility", id: utility.id, label: utility.label ?? utility.type });
                    }}
                    onDragEnd={(e) => {
                      const next = clamp(e.target.x(), e.target.y());
                      e.target.position(next);
                      updateUtility.mutate({ utilityId: utility.id, type: utility.type, label: utility.label ?? undefined, x: next.x, y: next.y });
                    }}
                  >
                    <Circle radius={markerRadius * 0.45} fill="#0ea5e9" stroke={selected ? "#0c4a6e" : "#ffffff"} strokeWidth={(selected ? 2 : 1) / scale} />
                    <Text text={utility.label ?? utility.type} x={markerRadius * 0.6} y={-fontSize / 2} fontSize={fontSize * 0.9} fill="#0369a1" listening={false} />
                  </Group>
                );
              })}

              {desks.map((desk) => {
                const position = dragOverrides[desk.id] ?? { x: desk.x, y: desk.y };
                const selected = desk.id === selectedDeskId;
                return (
                  <Group
                    key={desk.id}
                    x={position.x}
                    y={position.y}
                    draggable={isEdit && !placing}
                    onClick={(e) => handleDeskClick(desk.id, e)}
                    onTap={(e) => handleDeskClick(desk.id, e)}
                    onDblClick={(e) => {
                      if (placing) return;
                      e.cancelBubble = true;
                      if (isEdit) onOpenDesk(desk.id);
                    }}
                    onDragStart={() => onSelectDesk(desk.id)}
                    onDragEnd={(e) => handleDeskDragEnd(desk, e)}
                    onMouseEnter={(e) => {
                      if (!placing) e.target.getStage()!.container().style.cursor = isEdit ? "move" : "pointer";
                    }}
                    onMouseLeave={(e) => {
                      e.target.getStage()!.container().style.cursor = cursor;
                    }}
                  >
                    {selected && <Circle radius={markerRadius * 1.5} fill="rgba(59, 130, 246, 0.2)" listening={false} />}
                    <Circle
                      radius={markerRadius}
                      fill={desk.isActive ? "#10b981" : "#9ca3af"}
                      stroke={selected ? "#1d4ed8" : "#ffffff"}
                      strokeWidth={(selected ? 3 : 1.5) / scale}
                      dash={desk.isActive ? undefined : [3 / scale, 3 / scale]}
                      shadowColor="#000"
                      shadowBlur={selected ? 8 / scale : 3 / scale}
                      shadowOpacity={0.25}
                    />
                    {desk.restrictionCount > 0 && (
                      <Circle x={markerRadius * 0.75} y={-markerRadius * 0.75} radius={markerRadius * 0.35} fill="#f59e0b" stroke="#ffffff" strokeWidth={1 / scale} listening={false} />
                    )}
                    <Text
                      text={desk.number}
                      x={-markerRadius * 3}
                      y={markerRadius + 2 / scale}
                      width={markerRadius * 6}
                      align="center"
                      fontSize={fontSize}
                      fontStyle={selected ? "bold" : "normal"}
                      fill="#111827"
                      listening={false}
                    />
                  </Group>
                );
              })}

              {placing && ghost && placingDesk && (
                <Group x={ghost.x} y={ghost.y} listening={false}>
                  <Circle radius={markerRadius} fill="rgba(16, 185, 129, 0.5)" stroke="#047857" strokeWidth={1.5 / scale} dash={[4 / scale, 3 / scale]} />
                  <Text text="New desk" x={-markerRadius * 3} y={markerRadius + 2 / scale} width={markerRadius * 6} align="center" fontSize={fontSize} fill="#047857" />
                </Group>
              )}
              {placing && ghost && (placingUtility || placingRoom) && <Circle x={ghost.x} y={ghost.y} radius={markerRadius * 0.5} fill="rgba(14, 165, 233, 0.5)" listening={false} />}
            </Layer>
          </Stage>
        )}
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-emerald-500" /> Active desk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full border border-dashed border-gray-500 bg-gray-400" /> Inactive desk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full bg-amber-500" /> Has booking restrictions
        </span>
        <span className="ml-auto">
          {desks.length} desk{desks.length === 1 ? "" : "s"} · {utilities.length} utilities · {rooms.length} rooms · Scroll to zoom, drag the background to pan
        </span>
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
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
