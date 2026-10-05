"use client";

import { memo, useEffect, useLayoutEffect, useRef } from "react";
import Konva from "konva";
import { Circle, Group, Image as KonvaImage, Label, Layer, Rect, Stage, Tag, Text } from "react-konva";
import useImage from "use-image";
import { MapPinOff } from "lucide-react";

import { DeskState } from "@/generated/prisma/enums";
import { floorPlanImageUrl } from "@/lib/floor-plan-url";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { MARKER, useMarkerSprites, type MarkerKind, type MarkerSprites } from "@/components/floor-map/desk-markers";
import { MapControls, MapLegend, MapLoadingOverlay, type LegendEntry } from "@/components/floor-map/map-chrome";
import { COUNTER_SCALE, LABEL_NAME, useMapViewport, type MapViewportControls } from "@/components/floor-map/map-viewport";

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

export const CHECK_IN_BADGE = "#1dbfc2";
export const MAP_BACKGROUND = "bg-surface";

// Wrapped so the static Konva easing isn't passed around unbound.
const easeOut = (t: number, b: number, c: number, d: number): number => (Konva.Easings.EaseOut as (...args: number[]) => number)(t, b, c, d);

const DEFAULT_LEGEND: LegendEntry[] = [
  { kind: "available", label: "Available" },
  { kind: "booked", label: "Booked" },
  { kind: "restricted", label: "Restricted for you" },
  { kind: "inactive", label: "Inactive" },
];

export function markerKind(desk: FloorCanvasDesk): Extract<MarkerKind, "available" | "booked" | "restricted" | "inactive"> {
  if (desk.state === DeskState.INACTIVE) return "inactive";
  if (desk.eligibleForViewer === false) return "restricted";
  if (desk.state === DeskState.BOOKED || desk.state === DeskState.SCHEDULED) return "booked";
  return "available";
}

/**
 * Read-only employee floor map: select + inspect only. The map fills its
 * parent (give the parent a height) and fits the floor plan into it; pan by
 * dragging, zoom with the wheel/pinch or the floating controls. Desk
 * coordinates are floor-plan image pixels; markers keep a constant on-screen
 * size at any zoom.
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
  /** Data for the floor is still loading (keeps the map frame and shows the loading overlay). */
  loading = false,
  legend = DEFAULT_LEGEND,
  /** Floating content in the map's top-left corner (e.g. floor switcher). */
  topLeft,
  className,
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
  loading?: boolean;
  legend?: LegendEntry[] | null;
  topLeft?: React.ReactNode;
  className?: string;
}) {
  const hasPlan = !!imageWidth && !!imageHeight;

  return (
    <div className={cn("relative h-full min-h-0 w-full overflow-hidden", MAP_BACKGROUND, className)}>
      {hasPlan || loading ? (
        <FloorStage
          key={renderedImageKey ?? "none"}
          renderedImageKey={renderedImageKey}
          imageWidth={imageWidth ?? 1200}
          imageHeight={imageHeight ?? 800}
          desks={desks}
          rooms={rooms}
          utilities={utilities}
          neighbourhoods={neighbourhoods}
          selectedDeskId={selectedDeskId}
          onSelectDesk={onSelectDesk}
          highlightMode={highlightMode}
          focusDeskId={focusDeskId}
          loading={loading}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-6">
          <EmptyState
            icon={MapPinOff}
            title="No floor plan yet"
            description="This floor doesn't have a published floor plan. An administrator can upload one in the Editing Platform."
            className="bg-surface max-w-sm rounded-2xl border shadow-sm"
          />
        </div>
      )}

      {topLeft && <div className="pointer-events-none absolute top-4 left-4 z-10 flex flex-wrap gap-2">{topLeft}</div>}

      {legend && hasPlan && (
        <MapLegend
          entries={legend}
          className="absolute bottom-4 left-4 z-10 max-w-[calc(100%-6rem)]"
          extra={
            <span className="text-text-secondary flex items-center gap-2 font-medium">
              <span aria-hidden className="size-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: CHECK_IN_BADGE }} />
              Check-in required
            </span>
          }
        />
      )}
    </div>
  );
}

function FloorStage({
  renderedImageKey,
  imageWidth,
  imageHeight,
  desks,
  rooms,
  utilities,
  neighbourhoods,
  selectedDeskId,
  onSelectDesk,
  highlightMode,
  focusDeskId,
  loading,
}: {
  renderedImageKey: string | null;
  imageWidth: number;
  imageHeight: number;
  desks: FloorCanvasDesk[];
  rooms: FloorCanvasRoom[];
  utilities: FloorCanvasUtility[];
  neighbourhoods: FloorCanvasNeighbourhood[];
  selectedDeskId: string | null;
  onSelectDesk: (deskId: string) => void;
  highlightMode: boolean;
  focusDeskId: string | null;
  loading: boolean;
}) {
  const { containerRef, stageRef, size, stageHandlers, controls } = useMapViewport({ contentWidth: imageWidth, contentHeight: imageHeight });
  const { refresh, focusOn } = controls;
  const [image, imageStatus] = useImage(renderedImageKey ? floorPlanImageUrl(renderedImageKey) : "");
  const { sprites, iconSource } = useMarkerSprites();
  const planLayerRef = useRef<Konva.Layer>(null);
  const markerLayerRef = useRef<Konva.Layer>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const revealedRef = useRef(false);

  const planReady = !renderedImageKey || imageStatus === "loaded" || imageStatus === "failed";
  const ready = planReady && !!sprites && !loading && size.width > 0;

  // Fade the plan in, then the markers — no abrupt blank-to-content swap.
  useEffect(() => {
    if (!ready || revealedRef.current) return;
    const plan = planLayerRef.current;
    const markers = markerLayerRef.current;
    if (!plan || !markers) return;
    revealedRef.current = true;
    plan.to({ opacity: 1, duration: 0.25, easing: easeOut });
    markers.to({ opacity: 1, duration: 0.25, easing: easeOut });
  }, [ready]);

  // Deep-linked desk: glide to it once the map is ready.
  useEffect(() => {
    if (!ready || !focusDeskId) return;
    const desk = desks.find((d) => d.id === focusDeskId);
    if (desk) focusOn(desk.x, desk.y);
    // Only when the target (or readiness) changes, not on every availability refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusDeskId, focusOn]);

  // New/changed nodes (rooms, utilities, desks) start unscaled — re-apply before paint.
  useLayoutEffect(() => {
    refresh();
  });

  return (
    <div ref={wrapperRef} className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" data-testid="floor-canvas">
        {size.width > 0 && (
          <Stage ref={stageRef} width={size.width} height={size.height} draggable {...stageHandlers}
          >
            <Layer ref={planLayerRef} listening={false} opacity={0}>
              <Rect width={imageWidth} height={imageHeight} fill="#ffffff" listening={false} />
              {image && <KonvaImage image={image} width={imageWidth} height={imageHeight} perfectDrawEnabled={false} />}

              {neighbourhoods.map((neighbourhood) => {
                const members = desks.filter((d) => neighbourhood.deskIds.includes(d.id));
                if (members.length === 0) return null;
                const xs = members.map((d) => d.x);
                const ys = members.map((d) => d.y);
                const minX = Math.min(...xs) - 25;
                const minY = Math.min(...ys) - 25;
                return (
                  <Rect
                    key={neighbourhood.id}
                    x={minX}
                    y={minY}
                    width={Math.max(...xs) + 25 - minX}
                    height={Math.max(...ys) + 25 - minY}
                    fill={neighbourhood.color}
                    opacity={0.12}
                    stroke={neighbourhood.color}
                    strokeWidth={1.5}
                    strokeScaleEnabled={false}
                    cornerRadius={10}
                    perfectDrawEnabled={false}
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
                  fill="rgba(0, 38, 76, 0.05)"
                  stroke="rgba(0, 38, 76, 0.35)"
                  strokeWidth={1}
                  strokeScaleEnabled={false}
                  cornerRadius={3}
                  perfectDrawEnabled={false}
                />
              ))}
            </Layer>

            <Layer ref={markerLayerRef} opacity={0}>
              {rooms.map((room) => (
                <Group key={`${room.id}-label`} x={room.x} y={room.y} name={COUNTER_SCALE} listening={false}>
                  <Text x={6} y={5} text={room.name} fontSize={11} fontStyle="600" fontFamily="Inter, Arial, sans-serif" fill="#43546a" />
                </Group>
              ))}

              {utilities.map((utility) => (
                <Group key={utility.id} x={utility.x} y={utility.y} name={COUNTER_SCALE} listening={false}>
                  <Circle radius={5.5} fill="#0e7c86" stroke="#ffffff" strokeWidth={2} />
                  <Text
                    name={LABEL_NAME}
                    x={10}
                    y={-6}
                    text={utility.label ?? utility.type}
                    fontSize={11}
                    fontStyle="500"
                    fontFamily="Inter, Arial, sans-serif"
                    fill="#0e5a61"
                  />
                </Group>
              ))}

              {sprites && (
                <DeskMarkers
                  desks={desks}
                  sprites={sprites}
                  selectedDeskId={selectedDeskId}
                  onSelectDesk={onSelectDesk}
                  highlightMode={highlightMode}
                  focusDeskId={focusDeskId}
                  viewport={controls}
                />
              )}
            </Layer>
          </Stage>
        )}
      </div>

      <MapLoadingOverlay visible={!ready} label={loading ? "Loading floor…" : "Loading floor plan…"} />
      {imageStatus === "failed" && (
        <p role="alert" className="bg-surface text-danger absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-medium shadow-md">
          The floor plan image couldn&apos;t be loaded. Desks are shown on a blank plan.
        </p>
      )}

      <MapControls viewport={controls} className="absolute right-4 bottom-4 z-10" fullscreenTarget={wrapperRef} />
      {iconSource}
    </div>
  );
}

interface DeskMarkersProps {
  desks: FloorCanvasDesk[];
  sprites: MarkerSprites;
  selectedDeskId: string | null;
  onSelectDesk: (deskId: string) => void;
  highlightMode: boolean;
  focusDeskId: string | null;
  viewport: MapViewportControls;
}

const DeskMarkers = memo(function DeskMarkers({
  desks,
  sprites,
  selectedDeskId,
  onSelectDesk,
  highlightMode,
  focusDeskId,
  viewport,
}: DeskMarkersProps) {
  const onSelectRef = useRef(onSelectDesk);
  useEffect(() => {
    onSelectRef.current = onSelectDesk;
  });

  const { labelsVisible, refresh } = viewport;

  useLayoutEffect(() => {
    refresh();
  });


  // Render order: selected marker last so it sits above its neighbours.
  const ordered = selectedDeskId ? [...desks.filter((d) => d.id !== selectedDeskId), ...desks.filter((d) => d.id === selectedDeskId)] : desks;

  return (
    <>
      {ordered.map((desk) => {
        const kind = markerKind(desk);
        const interactive = !highlightMode || (desk.freeForRequestedSlot === true && desk.eligibleForViewer !== false);
        const selected = desk.id === selectedDeskId;
        const sprite = sprites.get(selected ? `${kind}:selected` : kind);
        return (
          <Group
            key={desk.id}
            x={desk.x}
            y={desk.y}
            name={COUNTER_SCALE}
            opacity={interactive ? 1 : 0.32}
            listening={interactive}
            onClick={() => onSelectRef.current(desk.id)}
            onTap={() => onSelectRef.current(desk.id)}
            // Hover shows the desk number; the marker itself never changes size.
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = "pointer";
              (e.currentTarget as Konva.Group).findOne(`.${LABEL_NAME}`)?.visible(true);
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = "";
              if (!selected && !labelsVisible()) (e.currentTarget as Konva.Group).findOne(`.${LABEL_NAME}`)?.visible(false);
            }}
          >
            {sprite && (
              <KonvaImage
                image={sprite}
                x={-MARKER.anchorX}
                y={-MARKER.anchorY}
                width={MARKER.width}
                height={MARKER.height}
                perfectDrawEnabled={false}
              />
            )}
            {desk.requiresCheckIn && kind !== "inactive" && (
              <Circle
                x={MARKER.badgeOffset}
                y={-MARKER.badgeOffset}
                radius={MARKER.badgeRadius}
                fill={CHECK_IN_BADGE}
                stroke="#ffffff"
                strokeWidth={1.5}
                listening={false}
                perfectDrawEnabled={false}
              />
            )}
            <Label
              ref={(node) => {
                node?.offsetX(node.width() / 2);
              }}
              name={selected ? undefined : LABEL_NAME}
              y={MARKER.height - MARKER.anchorY + 2}
              listening={false}
            >
              <Tag
                fill={selected ? "#00264c" : "#ffffff"}
                stroke={selected ? "#00264c" : "#d3dbe4"}
                strokeWidth={1}
                cornerRadius={5}
                opacity={0.97}
                perfectDrawEnabled={false}
              />
              <Text
                text={desk.number}
                fontSize={10.5}
                fontStyle="600"
                fontFamily="Inter, Arial, sans-serif"
                padding={3}
                fill={selected ? "#ffffff" : "#0d2137"}
                perfectDrawEnabled={false}
              />
            </Label>
            {desk.id === focusDeskId && <PulseRing />}
          </Group>
        );
      })}
    </>
  );
});

/**
 * Expanding, fading ring around a desk — animated on the Konva layer (not React
 * state) so it costs no re-renders. Runs until the desk loses focus. Lives
 * inside the counter-scaled marker group, so its size is in screen pixels.
 */
function PulseRing() {
  const ref = useRef<Konva.Circle>(null);
  useEffect(() => {
    const node = ref.current;
    const layer = node?.getLayer();
    if (!node || !layer) return;
    const PERIOD_MS = 1500;
    const animation = new Konva.Animation((frame) => {
      const t = ((frame?.time ?? 0) % PERIOD_MS) / PERIOD_MS;
      node.radius(MARKER.radius + 4 + t * 22);
      node.opacity(1 - t);
      node.strokeWidth(3.5 - t * 2.5);
    }, layer);
    animation.start();
    return () => {
      animation.stop();
    };
  }, []);
  return <Circle ref={ref} radius={MARKER.radius + 4} stroke="#1dbfc2" strokeWidth={3.5} listening={false} />;
}
