"use client";

import { useEffect, useRef, useState } from "react";
import Konva from "konva";
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
  /** False when the signed-in viewer can't book this desk on the selected date (restriction/shift/window). */
  eligibleForViewer?: boolean;
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

export interface FloorCanvasNeighbourhood {
  id: string;
  name: string;
  color: string;
  deskIds: string[];
}

const DESK_COLORS: Record<DeskState, string> = {
  [DeskState.AVAILABLE]: "#22c55e",
  [DeskState.BOOKED]: "#ef4444",
  [DeskState.SCHEDULED]: "#f59e0b",
  [DeskState.INACTIVE]: "#9ca3af",
};

const RESTRICTED_STROKE = "#7c3aed";
const FOCUS_STROKE = "#2563eb";
const DESK_RADIUS = 14;

/**
 * Read-only employee floor map: select + inspect only. Desk coordinates are
 * floor-plan image pixels; the stage scales to the container width so the
 * markers stay aligned at any viewport size.
 */
export function FloorCanvas({
  renderedImageKey,
  imageWidth,
  imageHeight,
  desks,
  rooms,
  utilities,
  neighbourhoods = [],
  selectedDeskId,
  onSelectDesk,
  /** When set, only desks free for the slot and eligible for the occupant are interactive/highlighted — the "Book a Desk" flow. */
  highlightMode = false,
  /** A desk to draw attention to with a pulsing ring — e.g. "locate on map" from My Bookings. */
  focusDeskId = null,
}: {
  renderedImageKey: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  desks: FloorCanvasDesk[];
  rooms: FloorCanvasRoom[];
  utilities: FloorCanvasUtility[];
  neighbourhoods?: FloorCanvasNeighbourhood[];
  selectedDeskId: string | null;
  onSelectDesk: (deskId: string) => void;
  highlightMode?: boolean;
  focusDeskId?: string | null;
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

          {neighbourhoods.map((neighbourhood) => {
            const neighbourhoodDesks = desks.filter((d) => neighbourhood.deskIds.includes(d.id));
            if (neighbourhoodDesks.length === 0) return null;

            const xs = neighbourhoodDesks.map((d) => d.x);
            const ys = neighbourhoodDesks.map((d) => d.y);
            const minX = Math.min(...xs) - 25;
            const maxX = Math.max(...xs) + 25;
            const minY = Math.min(...ys) - 25;
            const maxY = Math.max(...ys) + 25;

            return (
              <Rect
                key={neighbourhood.id}
                x={minX}
                y={minY}
                width={maxX - minX}
                height={maxY - minY}
                fill={neighbourhood.color}
                opacity={0.1}
                stroke={neighbourhood.color}
                strokeWidth={1.5}
                listening={false}
              />
            );
          })}

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
            const eligible = !highlightMode || (desk.freeForRequestedSlot === true && desk.eligibleForViewer !== false);
            const isSelected = desk.id === selectedDeskId;
            const restricted = desk.eligibleForViewer === false && desk.state !== DeskState.INACTIVE;
            const stroke = isSelected ? "#111827" : restricted ? RESTRICTED_STROKE : desk.requiresCheckIn ? "#ffffff" : undefined;
            const strokeWidth = isSelected ? 3 : restricted ? 2.5 : desk.requiresCheckIn ? 2 : 0;
            return (
              <Circle
                key={desk.id}
                x={desk.x}
                y={desk.y}
                radius={DESK_RADIUS}
                fill={DESK_COLORS[desk.state]}
                opacity={eligible ? (restricted ? 0.75 : 1) : 0.25}
                shadowColor="#000"
                shadowBlur={isSelected ? 8 : 3}
                shadowOpacity={isSelected ? 0.35 : 0.15}
                stroke={stroke}
                strokeWidth={strokeWidth}
                dash={restricted && !isSelected ? [4, 3] : undefined}
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
          {desks
            .filter((desk) => desk.eligibleForViewer === false && desk.state !== DeskState.INACTIVE)
            .map((desk) => (
              <Circle
                key={`${desk.id}-restricted-badge`}
                x={desk.x - DESK_RADIUS + 3}
                y={desk.y - DESK_RADIUS + 3}
                radius={4}
                fill={RESTRICTED_STROKE}
                stroke="#ffffff"
                strokeWidth={1}
                listening={false}
              />
            ))}
          {desks
            .filter((desk) => desk.id === focusDeskId)
            .map((desk) => (
              <PulseRing key={`${desk.id}-focus`} x={desk.x} y={desk.y} />
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

/**
 * Expanding, fading ring around a desk — animated on the Konva layer (not React
 * state) so it costs no re-renders. Runs until the desk loses focus.
 */
function PulseRing({ x, y }: { x: number; y: number }) {
  const ref = useRef<Konva.Circle>(null);
  useEffect(() => {
    const node = ref.current;
    const layer = node?.getLayer();
    if (!node || !layer) return;
    const PERIOD_MS = 1400;
    const animation = new Konva.Animation((frame) => {
      const t = ((frame?.time ?? 0) % PERIOD_MS) / PERIOD_MS;
      node.radius(DESK_RADIUS + 4 + t * 22);
      node.opacity(1 - t);
      node.strokeWidth(4 - t * 2.5);
    }, layer);
    animation.start();
    return () => {
      animation.stop();
    };
  }, []);
  return <Circle ref={ref} x={x} y={y} radius={DESK_RADIUS + 4} stroke={FOCUS_STROKE} strokeWidth={4} listening={false} />;
}

function FloorLegend({ className }: { className?: string }) {
  // SCHEDULED is a legacy enum value the server no longer produces — a desk is
  // only "Booked" while a booking overlaps the selected time window.
  const entries: Array<[DeskState, string]> = [
    [DeskState.AVAILABLE, "Available for selected time"],
    [DeskState.BOOKED, "Booked for selected time"],
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
      <span className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-full border-2 border-dashed" style={{ borderColor: RESTRICTED_STROKE }} />
        Restricted for you on this date
      </span>
    </div>
  );
}
