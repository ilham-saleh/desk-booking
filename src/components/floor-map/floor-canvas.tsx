"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import useImage from "use-image";

import { DeskState } from "@/generated/prisma/enums";
import { floorPlanImageUrl } from "@/lib/floor-plan-url";
import { cn } from "@/lib/utils";

export interface FloorCanvasDesk {
  id: string;
  number: string;
  name: string | null;
  x: number;
  y: number;
  requiresCheckIn: boolean;
  state: DeskState;
  /** Only set while the "Book a Desk" flow has a specific date/time slot in mind. */
  freeForRequestedSlot?: boolean;
}

export interface FloorCanvasRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FloorCanvasUtility {
  id: string;
  type: string;
  label: string | null;
  x: number;
  y: number;
}

const DESK_COLORS: Record<DeskState, string> = {
  [DeskState.AVAILABLE]: "#22c55e",
  [DeskState.BOOKED]: "#ef4444",
  [DeskState.SCHEDULED]: "#f59e0b",
  [DeskState.INACTIVE]: "#9ca3af",
};

const DESK_RADIUS = 14;

export function FloorCanvas({
  renderedImageKey,
  imageWidth,
  imageHeight,
  desks,
  rooms,
  utilities,
  selectedDeskId,
  onSelectDesk,
  /** When set, only desks with freeForRequestedSlot === true are interactive/highlighted — the "Book a Desk" flow. */
  highlightMode = false,
}: {
  renderedImageKey: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  desks: FloorCanvasDesk[];
  rooms: FloorCanvasRoom[];
  utilities: FloorCanvasUtility[];
  selectedDeskId: string | null;
  onSelectDesk: (deskId: string) => void;
  highlightMode?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [image] = useImage(renderedImageKey ? floorPlanImageUrl(renderedImageKey) : "");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!imageWidth || !imageHeight) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center rounded-md border text-sm">
        No floor plan uploaded for this floor yet.
      </div>
    );
  }

  const scale = containerWidth > 0 ? containerWidth / imageWidth : 1;
  const stageHeight = imageHeight * scale;

  return (
    <div ref={containerRef} className="w-full overflow-hidden rounded-md border">
      <Stage width={containerWidth || imageWidth} height={stageHeight} scaleX={scale} scaleY={scale}>
        <Layer>
          {image && <KonvaImage image={image} width={imageWidth} height={imageHeight} />}

          {rooms.map((room) => (
            <Rect
              key={room.id}
              x={room.x}
              y={room.y}
              width={room.width}
              height={room.height}
              fill="rgba(148, 163, 184, 0.15)"
              stroke="#94a3b8"
              strokeWidth={1}
            />
          ))}
          {rooms.map((room) => (
            <Text key={`${room.id}-label`} x={room.x + 4} y={room.y + 4} text={room.name} fontSize={11} fill="#475569" />
          ))}

          {utilities.map((utility) => (
            <Circle key={utility.id} x={utility.x} y={utility.y} radius={5} fill="#0ea5e9" />
          ))}
          {utilities.map((utility) => (
            <Text
              key={`${utility.id}-label`}
              x={utility.x + 8}
              y={utility.y - 6}
              text={utility.label ?? utility.type}
              fontSize={10}
              fill="#0369a1"
            />
          ))}

          {desks.map((desk) => {
            const eligible = !highlightMode || desk.freeForRequestedSlot;
            const isSelected = desk.id === selectedDeskId;
            return (
              <Circle
                key={desk.id}
                x={desk.x}
                y={desk.y}
                radius={DESK_RADIUS}
                fill={DESK_COLORS[desk.state]}
                opacity={eligible ? 1 : 0.25}
                shadowColor="#000"
                shadowBlur={isSelected ? 8 : 3}
                shadowOpacity={isSelected ? 0.35 : 0.15}
                stroke={isSelected ? "#111827" : desk.requiresCheckIn ? "#ffffff" : undefined}
                strokeWidth={isSelected ? 3 : desk.requiresCheckIn ? 2 : 0}
                onClick={() => eligible && onSelectDesk(desk.id)}
                onTap={() => eligible && onSelectDesk(desk.id)}
                onMouseEnter={(e) => {
                  if (eligible) e.target.getStage()!.container().style.cursor = "pointer";
                }}
                onMouseLeave={(e) => {
                  e.target.getStage()!.container().style.cursor = "default";
                }}
              />
            );
          })}
          {desks
            .filter((desk) => desk.requiresCheckIn)
            .map((desk) => (
              <Circle
                key={`${desk.id}-checkin-badge`}
                x={desk.x + DESK_RADIUS - 3}
                y={desk.y - DESK_RADIUS + 3}
                radius={4}
                fill="#0ea5e9"
                stroke="#ffffff"
                strokeWidth={1}
                listening={false}
              />
            ))}
          {desks.map((desk) => (
            <Text
              key={`${desk.id}-label`}
              x={desk.x - DESK_RADIUS}
              y={desk.y + DESK_RADIUS + 2}
              width={DESK_RADIUS * 2}
              align="center"
              text={desk.number}
              fontSize={10}
              fill="#111827"
            />
          ))}
        </Layer>
      </Stage>

      <FloorLegend className="border-t bg-muted/30 px-4 py-2.5" />
    </div>
  );
}

function FloorLegend({ className }: { className?: string }) {
  const entries: Array<[DeskState, string]> = [
    [DeskState.AVAILABLE, "Available"],
    [DeskState.BOOKED, "Booked"],
    [DeskState.SCHEDULED, "Scheduled"],
    [DeskState.INACTIVE, "Inactive"],
  ];
  return (
    <div className={cn("flex flex-wrap items-center gap-4 text-xs", className)}>
      {entries.map(([state, label]) => (
        <span key={state} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: DESK_COLORS[state] }} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-full bg-sky-500" />
        Requires check-in
      </span>
    </div>
  );
}
