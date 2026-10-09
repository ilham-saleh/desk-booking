"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import Konva from "konva";
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import useImage from "use-image";
import { MapPinOff } from "lucide-react";

import { DeskState } from "@/generated/prisma/enums";
import { floorPlanImageUrl } from "@/lib/floor-plan-url";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { MARKER, MARKER_STYLES, spriteKey, useMarkerSprites, type MarkerKind, type MarkerSprites } from "@/components/floor-map/desk-markers";
import { MapControls, MapLegend, MapLoadingOverlay, type LegendEntry } from "@/components/floor-map/map-chrome";
import { DiscNumber, MARKER_FONT, MarkerHitArea, MarkerTag } from "@/components/floor-map/marker-parts";
import { markerPlanScale, roomLabelFontSize } from "@/components/floor-map/marker-scale";
import { HOVER_LABEL, MARKER_SCALE, PLAN_TEXT, useMapViewport, useMarkerLevel, type MapViewportControls } from "@/components/floor-map/map-viewport";

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
 * coordinates are floor-plan image pixels; markers are sized on the plan and
 * zoom with it, carrying their desk number once they're large enough.
 */
export function FloorCanvas({
  renderedImageKey,
  imageWidth,
  imageHeight,
  markerSize = null,
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
  /** Admin-chosen marker footprint in plan pixels (FloorPlanVersion.markerSize); null = automatic. */
  markerSize?: number | null;
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
          markerSize={markerSize}
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
  markerSize,
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
  markerSize: number | null;
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
  const planScale = useMemo(() => markerPlanScale(desks, imageWidth, imageHeight, markerSize), [desks, imageWidth, imageHeight, markerSize]);
  const { containerRef, stageRef, size, stageHandlers, controls } = useMapViewport({
    contentWidth: imageWidth,
    contentHeight: imageHeight,
    markerPlanScale: planScale,
  });
  const { refresh, focusOn } = controls;
  const level = useMarkerLevel(controls);
  const [image, imageStatus] = useImage(renderedImageKey ? floorPlanImageUrl(renderedImageKey) : "");
  const { sprites, iconSource } = useMarkerSprites(level.tier);
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
                const pad = MARKER.width * planScale * 0.75;
                const minX = Math.min(...xs) - pad;
                const minY = Math.min(...ys) - pad;
                return (
                  <Rect
                    key={neighbourhood.id}
                    x={minX}
                    y={minY}
                    width={Math.max(...xs) + pad - minX}
                    height={Math.max(...ys) + pad - minY}
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
                <RoomName key={`${room.id}-label`} room={room} planScale={planScale} fill="#43546a" />
              ))}

              {utilities.map((utility) => (
                <Group key={utility.id} x={utility.x} y={utility.y} name={MARKER_SCALE} listening={false}>
                  <Circle radius={4.5} fill="#0e7c86" stroke="#ffffff" strokeWidth={1.5} />
                  {level.labelled && (
                    <Text x={6.5} y={-3.5} text={utility.label ?? utility.type} fontSize={7} fontStyle="500" fontFamily={MARKER_FONT} fill="#0e5a61" />
                  )}
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
                  labelled={level.labelled}
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
  /** Markers are large enough on screen to carry their desk number. */
  labelled: boolean;
  viewport: MapViewportControls;
}

const DeskMarkers = memo(function DeskMarkers({
  desks,
  sprites,
  selectedDeskId,
  onSelectDesk,
  highlightMode,
  focusDeskId,
  labelled,
  viewport,
}: DeskMarkersProps) {
  const onSelectRef = useRef(onSelectDesk);
  useEffect(() => {
    onSelectRef.current = onSelectDesk;
  });

  const { refresh } = viewport;

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
        const sprite = sprites.get(spriteKey(kind, selected, labelled));
        return (
          <Group
            key={desk.id}
            x={desk.x}
            y={desk.y}
            name={MARKER_SCALE}
            opacity={interactive ? 1 : 0.32}
            listening={interactive}
            onClick={() => onSelectRef.current(desk.id)}
            onTap={() => onSelectRef.current(desk.id)}
            // Hover shows the desk number while it isn't drawn in the disc; the marker itself never changes size.
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = "pointer";
              (e.currentTarget as Konva.Group).findOne(`.${HOVER_LABEL}`)?.visible(true);
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = "";
              (e.currentTarget as Konva.Group).findOne(`.${HOVER_LABEL}`)?.visible(false);
            }}
          >
            <MarkerHitArea />
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
            {labelled ? (
              <DiscNumber text={desk.number} color={MARKER_STYLES[kind].glyph} />
            ) : (
              <MarkerTag text={desk.number} variant={selected ? "selected" : "plain"} hover />
            )}
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
 * inside the marker group, so it is sized in marker units.
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

/** A room's name, sized to fit the room on the plan; hidden by the viewport while too small to read. */
export function RoomName({ room, planScale, fill }: { room: FloorCanvasRoom; planScale: number; fill: string }) {
  const fontSize = roomLabelFontSize(room.name, room.width, room.height, planScale);
  return (
    <Text
      name={PLAN_TEXT}
      x={room.x + fontSize * 0.5}
      y={room.y + fontSize * 0.4}
      width={Math.max(1, room.width - fontSize)}
      text={room.name}
      fontSize={fontSize}
      fontStyle="600"
      fontFamily={MARKER_FONT}
      fill={fill}
      wrap="none"
      ellipsis
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}
