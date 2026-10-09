"use client";

import { Circle, Label, Tag, Text } from "react-konva";

import { MARKER } from "@/components/floor-map/marker-scale";
import { HIT_AREA, HOVER_LABEL, SCREEN_SCALE } from "@/components/floor-map/map-viewport";

/**
 * Konva building blocks for a desk marker group, shared by the Floor Map and
 * the Editing Platform. All sizes are marker units (the group's local space).
 */

export const MARKER_FONT = "Inter, Arial, sans-serif";

/** Invisible click/tap target; the viewport grows it while the marker is small on screen. */
export function MarkerHitArea() {
  // A fill (even transparent) is what puts the circle on Konva's hit canvas.
  return <Circle name={HIT_AREA} radius={MARKER.radius + 1} fill="transparent" perfectDrawEnabled={false} />;
}

const DISC_TEXT_WIDTH = MARKER.innerRadius * 2 - 1.2;
const DISC_FONT_SIZE = 5.4;
const DISC_FONT_MIN = 3.4;
let measureContext: CanvasRenderingContext2D | null | undefined;

/** Largest font (up to the default) at which `text` fits across the disc; longer names are ellipsised. */
function discFontSize(text: string): number {
  measureContext ??= typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!measureContext) return DISC_FONT_SIZE;
  measureContext.font = `700 ${DISC_FONT_SIZE * 10}px ${MARKER_FONT}`;
  const width = measureContext.measureText(text).width / 10;
  // Fit with headroom: Konva re-measures (possibly before the webfont loads) and ellipsises on any overshoot.
  const target = DISC_TEXT_WIDTH * 0.9;
  return width <= target ? DISC_FONT_SIZE : Math.max(DISC_FONT_MIN, (DISC_FONT_SIZE * target) / width);
}

/** The desk number inside the marker's disc, for the "labelled" sprites at close zoom. */
export function DiscNumber({ text, color }: { text: string; color: string }) {
  const size = MARKER.innerRadius * 2;
  return (
    <Text
      x={-DISC_TEXT_WIDTH / 2}
      y={-size / 2}
      width={DISC_TEXT_WIDTH}
      height={size}
      text={text}
      fontSize={discFontSize(text)}
      fontStyle="700"
      fontFamily={MARKER_FONT}
      fill={color}
      align="center"
      verticalAlign="middle"
      wrap="none"
      ellipsis
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

/**
 * A constant-size tag under the pin (desk number on hover while the
 * marker is too small to carry it, or "New desk" while placing).
 */
export function MarkerTag({
  text,
  variant,
  hover = false,
}: {
  text: string;
  variant: "plain" | "selected" | "ghost";
  /** Hidden until the marker is hovered. */
  hover?: boolean;
}) {
  const fill = variant === "plain" ? "#ffffff" : variant === "selected" ? "#00264c" : "#012b30";
  return (
    <Label
      ref={(node) => {
        node?.offsetX(node.width() / 2);
      }}
      name={hover ? `${SCREEN_SCALE} ${HOVER_LABEL}` : SCREEN_SCALE}
      visible={!hover}
      y={MARKER.height - MARKER.anchorY + 1}
      listening={false}
    >
      <Tag fill={fill} stroke={variant === "plain" ? "#d3dbe4" : fill} strokeWidth={1} cornerRadius={5} opacity={0.97} perfectDrawEnabled={false} />
      <Text
        text={text}
        fontSize={10.5}
        fontStyle="600"
        fontFamily={MARKER_FONT}
        padding={3}
        fill={variant === "plain" ? "#0d2137" : "#ffffff"}
        perfectDrawEnabled={false}
      />
    </Label>
  );
}
