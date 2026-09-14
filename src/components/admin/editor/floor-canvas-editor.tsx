"use client";

import { useRef, useState, useEffect } from "react";
import { Stage, Layer, Image as KonvaImage, Group, Rect, Text } from "react-konva";
import Konva from "konva";
import { api } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

interface DeskObject {
  id: string;
  number: string;
  name?: string | null;
  x: number;
  y: number;
}

interface UtilityObject {
  id: string;
  type: string;
  label?: string | null;
  x: number;
  y: number;
}

interface RoomObject {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FloorCanvasEditorProps {
  floorId: string;
  floorName: string;
  backgroundImageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  activeObjectType?: "desks" | "utilities" | "rooms" | null;
}

export function FloorCanvasEditor({
  floorId,
  floorName,
  backgroundImageUrl,
  imageWidth = 1200,
  imageHeight = 800,
  activeObjectType = null,
}: FloorCanvasEditorProps) {
  const [desks, setDesks] = useState<DeskObject[]>(() => []);
  const [utilities, setUtilities] = useState<UtilityObject[]>(() => []);
  const [rooms, setRooms] = useState<RoomObject[]>(() => []);
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [selectedUtilityId, setSelectedUtilityId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newDeskNumber, setNewDeskNumber] = useState("");
  const [newUtilityType, setNewUtilityType] = useState("");
  const [newUtilityLabel, setNewUtilityLabel] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [stageScale, setStageScale] = useState(1);
  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Load existing desks, utilities, and rooms
  const { data: existingDesks = [] } = api.desk.listForFloor.useQuery({ floorId });
  const { data: existingUtilities = [] } = api.floor.listUtilities.useQuery({ floorId });
  const { data: existingRooms = [] } = api.floor.listRooms.useQuery({ floorId });

  // Initialize desks, utilities, and rooms from database
  useEffect(() => {
    if (existingDesks.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDesks(
        existingDesks.map((d) => ({
          id: d.id,
          number: d.number,
          name: d.name,
          x: d.x,
          y: d.y,
        })),
      );
    }
  }, [existingDesks]);

  useEffect(() => {
    if (existingUtilities.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUtilities(
        existingUtilities.map((u) => ({
          id: u.id,
          type: u.type,
          label: u.label,
          x: u.x,
          y: u.y,
        })),
      );
    }
  }, [existingUtilities]);

  useEffect(() => {
    if (existingRooms.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRooms(
        existingRooms.map((r) => ({
          id: r.id,
          name: r.name,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        })),
      );
    }
  }, [existingRooms]);

  const [konvaImage, setKonvaImage] = useState<Konva.Image | null>(null);

  // Load background image
  useEffect(() => {
    if (backgroundImageUrl) {
      const img = new window.Image();
      img.onload = () => {
        imageRef.current = img;
        setKonvaImage(img as unknown as Konva.Image);
      };
      img.src = backgroundImageUrl;
    }
  }, [backgroundImageUrl]);

  const createDeskMutation = api.desk.createDesk.useMutation({
    onSuccess: (newDesk) => {
      setDesks((prev) => [
        ...prev,
        {
          id: newDesk.id,
          number: newDesk.number,
          name: newDesk.name,
          x: newDesk.x,
          y: newDesk.y,
        },
      ]);
      toast.success(`Desk ${newDesk.number} created`);
      setNewDeskNumber("");
      setIsCreating(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const updateDeskMutation = api.desk.updateDesk.useMutation({
    onSuccess: () => {
      toast.success("Desk updated");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteDeskMutation = api.desk.deleteDesk.useMutation({
    onSuccess: () => {
      setDesks((prev) => prev.filter((d) => d.id !== selectedDeskId));
      setSelectedDeskId(null);
      toast.success("Desk deleted");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const createUtilityMutation = api.floor.createUtility.useMutation({
    onSuccess: (newUtility) => {
      setUtilities((prev) => [...prev, {
        id: newUtility.id,
        type: newUtility.type,
        label: newUtility.label,
        x: newUtility.x,
        y: newUtility.y,
      }]);
      toast.success(`Utility ${newUtility.type} created`);
      setNewUtilityType("");
      setNewUtilityLabel("");
      setIsCreating(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteUtilityMutation = api.floor.deleteUtility.useMutation({
    onSuccess: () => {
      setUtilities((prev) => prev.filter((u) => u.id !== selectedUtilityId));
      setSelectedUtilityId(null);
      toast.success("Utility deleted");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const createRoomMutation = api.floor.createRoom.useMutation({
    onSuccess: (newRoom) => {
      setRooms((prev) => [...prev, {
        id: newRoom.id,
        name: newRoom.name,
        x: newRoom.x,
        y: newRoom.y,
        width: newRoom.width,
        height: newRoom.height,
      }]);
      toast.success(`Room ${newRoom.name} created`);
      setNewRoomName("");
      setIsCreating(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteRoomMutation = api.floor.deleteRoom.useMutation({
    onSuccess: () => {
      setRooms((prev) => prev.filter((r) => r.id !== selectedRoomId));
      setSelectedRoomId(null);
      toast.success("Room deleted");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleCanvasClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // If clicking on a desk, select it; otherwise deselect
    if (e.target === e.target.getStage()) {
      setSelectedDeskId(null);
    }
  };

  const handleDeskClick = (deskId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    setSelectedDeskId(deskId);
  };

  const handleDeskDragEnd = (deskId: string, e: Konva.KonvaEventObject<DragEvent>) => {
    const desk = desks.find((d) => d.id === deskId);
    if (desk) {
      const newDesk = { ...desk, x: e.target.x(), y: e.target.y() };
      setDesks((prev) => prev.map((d) => (d.id === deskId ? newDesk : d)));
      updateDeskMutation.mutate({
        deskId,
        floorId,
        number: desk.number,
        name: desk.name || undefined,
        x: e.target.x(),
        y: e.target.y(),
      });
    }
  };

  const handleCreateDesk = () => {
    if (!newDeskNumber.trim()) {
      toast.error("Desk number required");
      return;
    }

    // Create desk at center of canvas
    const centerX = stageRef.current?.width() ? stageRef.current.width() / 2 : 600;
    const centerY = stageRef.current?.height() ? stageRef.current.height() / 2 : 400;

    createDeskMutation.mutate({
      floorId,
      number: newDeskNumber,
      x: centerX,
      y: centerY,
    });
  };

  const handleDeleteDesk = () => {
    if (!selectedDeskId) return;
    if (confirm("Delete this desk?")) {
      deleteDeskMutation.mutate({ deskId: selectedDeskId });
    }
  };

  const handleCreateUtility = () => {
    if (!newUtilityType.trim()) {
      toast.error("Utility type required");
      return;
    }

    const centerX = stageRef.current?.width() ? stageRef.current.width() / 2 : 600;
    const centerY = stageRef.current?.height() ? stageRef.current.height() / 2 : 400;

    createUtilityMutation.mutate({
      floorId,
      type: newUtilityType,
      label: newUtilityLabel || undefined,
      x: centerX,
      y: centerY,
    });
  };

  const handleDeleteUtility = () => {
    if (!selectedUtilityId) return;
    if (confirm("Delete this utility?")) {
      deleteUtilityMutation.mutate({ utilityId: selectedUtilityId });
    }
  };

  const handleCreateRoom = () => {
    if (!newRoomName.trim()) {
      toast.error("Room name required");
      return;
    }

    const centerX = stageRef.current?.width() ? stageRef.current.width() / 2 : 600;
    const centerY = stageRef.current?.height() ? stageRef.current.height() / 2 : 400;

    createRoomMutation.mutate({
      floorId,
      name: newRoomName,
      x: centerX,
      y: centerY,
      width: 100,
      height: 100,
    });
  };

  const handleDeleteRoom = () => {
    if (!selectedRoomId) return;
    if (confirm("Delete this room?")) {
      deleteRoomMutation.mutate({ roomId: selectedRoomId });
    }
  };

  const selectedDesk = selectedDeskId ? desks.find((d) => d.id === selectedDeskId) : null;
  const selectedUtility = selectedUtilityId ? utilities.find((u) => u.id === selectedUtilityId) : null;
  const selectedRoom = selectedRoomId ? rooms.find((r) => r.id === selectedRoomId) : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Floor Plan Editor: {floorName}</CardTitle>
          <CardDescription>Click to create desks, drag to move, click to select</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Canvas Controls */}
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => {
                setIsCreating(!isCreating);
                setNewDeskNumber("");
                setNewUtilityType("");
                setNewRoomName("");
              }}
              variant={isCreating ? "default" : "outline"}
            >
              <Plus className="size-4 mr-2" />
              {isCreating ? "Cancel" : "Create"}
            </Button>
            {activeObjectType === "desks" && selectedDesk && (
              <Button size="sm" variant="destructive" onClick={handleDeleteDesk}>
                <Trash2 className="size-4 mr-2" />
                Delete Desk
              </Button>
            )}
            {activeObjectType === "utilities" && selectedUtility && (
              <Button size="sm" variant="destructive" onClick={handleDeleteUtility}>
                <Trash2 className="size-4 mr-2" />
                Delete Utility
              </Button>
            )}
            {activeObjectType === "rooms" && selectedRoom && (
              <Button size="sm" variant="destructive" onClick={handleDeleteRoom}>
                <Trash2 className="size-4 mr-2" />
                Delete Room
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (stageRef.current) {
                  setStageScale(1);
                  stageRef.current.position({ x: 0, y: 0 });
                }
              }}
            >
              Reset View
            </Button>
          </div>

          {/* Creation Input - Desks */}
          {isCreating && activeObjectType === "desks" && (
            <div className="flex gap-2">
              <Input
                placeholder="Desk number (e.g., 5.01)"
                value={newDeskNumber}
                onChange={(e) => setNewDeskNumber(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") handleCreateDesk();
                }}
              />
              <Button size="sm" onClick={handleCreateDesk} disabled={createDeskMutation.isPending}>
                Create
              </Button>
            </div>
          )}

          {/* Creation Input - Utilities */}
          {isCreating && activeObjectType === "utilities" && (
            <div className="flex gap-2">
              <Input
                placeholder="Utility type (printer, kitchen, etc.)"
                value={newUtilityType}
                onChange={(e) => setNewUtilityType(e.target.value)}
              />
              <Input
                placeholder="Label (optional)"
                value={newUtilityLabel}
                onChange={(e) => setNewUtilityLabel(e.target.value)}
              />
              <Button size="sm" onClick={handleCreateUtility} disabled={createUtilityMutation.isPending}>
                Create
              </Button>
            </div>
          )}

          {/* Creation Input - Rooms */}
          {isCreating && activeObjectType === "rooms" && (
            <div className="flex gap-2">
              <Input
                placeholder="Room name (e.g., Meeting Room A)"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
              />
              <Button size="sm" onClick={handleCreateRoom} disabled={createRoomMutation.isPending}>
                Create
              </Button>
            </div>
          )}

          {/* Canvas */}
          <div className="border rounded-lg bg-gray-50 overflow-hidden" style={{ maxHeight: "600px" }}>
            <Stage
              ref={stageRef}
              width={imageWidth}
              height={imageHeight}
              scaleX={stageScale}
              scaleY={stageScale}
              onClick={handleCanvasClick}
              onWheel={(e) => {
                e.evt.preventDefault();
                const scaleBy = 1.1;
                const stage = stageRef.current;
                if (!stage) return;

                const oldScale = stage.scaleX();
                const pointerPos = stage.getPointerPosition();
                if (!pointerPos) return;

                const mousePointTo = {
                  x: pointerPos.x / oldScale - stage.x() / oldScale,
                  y: pointerPos.y / oldScale - stage.y() / oldScale,
                };

                const newScale = e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
                setStageScale(newScale);

                const newPointerPos = stage.getPointerPosition();
                if (!newPointerPos) return;

                const newPos = {
                  x: -(mousePointTo.x - newPointerPos.x / newScale) * newScale,
                  y: -(mousePointTo.y - newPointerPos.y / newScale) * newScale,
                };
                stage.position(newPos);
              }}
            >
              <Layer ref={layerRef}>
                {/* Background Image */}
                {konvaImage && (
                  <KonvaImage image={(konvaImage as unknown) as CanvasImageSource} width={imageWidth} height={imageHeight} />
                )}

                {/* Desks */}
                {desks.map((desk) => (
                  <Group
                    key={desk.id}
                    x={desk.x}
                    y={desk.y}
                    onClick={(e) => handleDeskClick(desk.id, e)}
                    onDragEnd={(e) => handleDeskDragEnd(desk.id, e)}
                    draggable
                    cursor="move"
                  >
                    {/* Desk Rectangle */}
                    <Rect
                      width={50}
                      height={50}
                      fill={selectedDesk?.id === desk.id ? "#3b82f6" : "#10b981"}
                      stroke={selectedDesk?.id === desk.id ? "#1e40af" : "#059669"}
                      strokeWidth={2}
                      cornerRadius={4}
                    />
                    {/* Desk Number Label */}
                    <Text
                      text={desk.number || ""}
                      fontSize={12}
                      fill="white"
                      width={50}
                      height={50}
                      align="center"
                      verticalAlign="middle"
                      fontStyle="bold"
                    />
                  </Group>
                ))}

                {/* Utilities */}
                {utilities.map((utility) => (
                  <Group
                    key={utility.id}
                    x={utility.x}
                    y={utility.y}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      setSelectedUtilityId(utility.id);
                    }}
                    draggable
                    cursor="move"
                  >
                    <Rect
                      width={40}
                      height={40}
                      fill={selectedUtility?.id === utility.id ? "#f59e0b" : "#ec4899"}
                      stroke={selectedUtility?.id === utility.id ? "#d97706" : "#be185d"}
                      strokeWidth={2}
                      cornerRadius={2}
                    />
                    <Text
                      text={utility.type[0]?.toUpperCase() ?? "U"}
                      fontSize={10}
                      fill="white"
                      width={40}
                      height={40}
                      align="center"
                      verticalAlign="middle"
                      fontStyle="bold"
                    />
                  </Group>
                ))}

                {/* Rooms */}
                {rooms.map((room) => (
                  <Group
                    key={room.id}
                    x={room.x}
                    y={room.y}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      setSelectedRoomId(room.id);
                    }}
                    draggable
                    cursor="move"
                  >
                    <Rect
                      width={room.width}
                      height={room.height}
                      fill={selectedRoom?.id === room.id ? "#8b5cf6" : "#6366f1"}
                      stroke={selectedRoom?.id === room.id ? "#7c3aed" : "#4f46e5"}
                      strokeWidth={2}
                      opacity={0.6}
                    />
                    <Text
                      text={room.name}
                      fontSize={12}
                      fill="white"
                      width={room.width}
                      height={room.height}
                      align="center"
                      verticalAlign="middle"
                      fontStyle="bold"
                    />
                  </Group>
                ))}
              </Layer>
            </Stage>
          </div>

          {/* Object Count */}
          <div className="text-sm text-gray-600 flex gap-4">
            <div>
              Total desks: <strong>{desks.length}</strong>
            </div>
            <div>
              Total utilities: <strong>{utilities.length}</strong>
            </div>
            <div>
              Total rooms: <strong>{rooms.length}</strong>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selected Desk Properties */}
      {selectedDesk && (
        <Card>
          <CardHeader>
            <CardTitle>Desk Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="font-medium text-gray-600">Number</dt>
                <dd>{selectedDesk.number}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Name</dt>
                <dd>{selectedDesk.name || "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Position (X, Y)</dt>
                <dd>
                  {selectedDesk.x.toFixed(0)}, {selectedDesk.y.toFixed(0)}
                </dd>
              </div>
            </dl>
            <div className="pt-2">
              <p className="text-xs text-gray-500">Drag the desk to reposition it on the floor plan.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selected Utility Properties */}
      {selectedUtility && (
        <Card>
          <CardHeader>
            <CardTitle>Utility Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="font-medium text-gray-600">Type</dt>
                <dd>{selectedUtility.type}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Label</dt>
                <dd>{selectedUtility.label || "—"}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Position (X, Y)</dt>
                <dd>
                  {selectedUtility.x.toFixed(0)}, {selectedUtility.y.toFixed(0)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      {/* Selected Room Properties */}
      {selectedRoom && (
        <Card>
          <CardHeader>
            <CardTitle>Room Properties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="font-medium text-gray-600">Name</dt>
                <dd>{selectedRoom.name}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Position (X, Y)</dt>
                <dd>
                  {selectedRoom.x.toFixed(0)}, {selectedRoom.y.toFixed(0)}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Size (W × H)</dt>
                <dd>
                  {selectedRoom.width.toFixed(0)} × {selectedRoom.height.toFixed(0)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
