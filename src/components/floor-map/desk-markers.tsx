"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Lock, Plus, UserRound, type LucideIcon } from "lucide-react";

import { DESIGN, MARKER, SPRITE_TIERS, type SpriteTier } from "@/components/floor-map/marker-scale";

export { MARKER };

/**
 * Desk map markers, pre-rendered once per session into small bitmaps
 * ("sprites"). The Konva layers then just blit an image per desk — no
 * per-frame vector paths, gradients or shadow blurs — which is what keeps
 * pan/zoom smooth with hundreds of desks. The glyphs are real lucide icons,
 * rendered into a hidden node and serialised into each sprite's SVG.
 *
 * Markers are sized on the floor plan (see marker-scale.ts), so their
 * on-screen size follows the zoom. Sprites are therefore rasterised at a few
 * resolutions ("tiers") and the map picks the one matching the current zoom.
 * Each kind also has a "labelled" variant for close zoom: the disc is left
 * empty for the desk number and the status glyph moves to a corner badge, so
 * state never relies on colour alone.
 */

export type MarkerKind =
  | "available"
  | "booked"
  | "restricted"
  | "inactive"
  | "editor-active"
  | "editor-inactive"
  | "ghost";

interface MarkerStyle {
  /**
   * Status glyph. Open desks are plain discs; booked/restricted/inactive keep
   * a glyph so their state never relies on colour alone.
   */
  icon: LucideIcon | null;
  /** Pin body (outer ring + tail). */
  ring: string;
  /** Inner disc. */
  fill: string;
  glyph: string;
  /** Soft outer glow — sky blue for open/booked desks, the status tint otherwise. */
  halo: string;
  haloOpacity: number;
  /** Shows the status glyph as a corner badge when the disc holds the desk number. */
  badge?: boolean;
}

/** Glow for open, booked and editor desks — a clear sky blue that reads on white plans. */
const GLOW_BLUE = "#90cdf9";

export const MARKER_STYLES: Record<MarkerKind, MarkerStyle> = {
  available: { icon: null, ring: "#148a55", fill: "#e7f6ee", glyph: "#117248", halo: GLOW_BLUE, haloOpacity: 1 },
  booked: { icon: UserRound, ring: "#00264c", fill: "#00264c", glyph: "#ffffff", halo: GLOW_BLUE, haloOpacity: 1, badge: true },
  restricted: { icon: Lock, ring: "#d9692a", fill: "#fff3e8", glyph: "#a8540d", halo: "#ffd6c0", haloOpacity: 1, badge: true },
  inactive: { icon: Ban, ring: "#a3afbd", fill: "#eef1f4", glyph: "#6b7a8c", halo: "#dfe5eb", haloOpacity: 0.9, badge: true },
  "editor-active": { icon: null, ring: "#00264c", fill: "#ffffff", glyph: "#00264c", halo: GLOW_BLUE, haloOpacity: 1 },
  "editor-inactive": { icon: Ban, ring: "#a3afbd", fill: "#eef1f4", glyph: "#6b7a8c", halo: "#dfe5eb", haloOpacity: 0.9, badge: true },
  ghost: { icon: Plus, ring: "#1dbfc2", fill: "#e3f7f7", glyph: "#012b30", halo: "#1dbfc2", haloOpacity: 0.35 },
};

const SELECTED_HALO = "#1dbfc2";

export type SpriteKey = `${MarkerKind}${"" | ":selected"}${"" | ":labelled"}`;
export type MarkerSprites = Map<SpriteKey, HTMLCanvasElement>;

export function spriteKey(kind: MarkerKind, selected: boolean, labelled = false): SpriteKey {
  return `${kind}${selected ? ":selected" : ""}${labelled ? ":labelled" : ""}`;
}

const spriteCache = new Map<SpriteTier, Promise<MarkerSprites>>();

function markerSvg(style: MarkerStyle, iconMarkup: string, selected: boolean, labelled: boolean, pixelWidth: number, pixelHeight: number): string {
  const { anchorX: cx, anchorY: cy, radius: r, glowRadius: glowR } = DESIGN;
  // Round marker with a small point at the bottom: tangents from the tip meet the disc.
  const tipDistance = r + DESIGN.tail;
  const a = Math.acos(r / tipDistance);
  const lx = (cx - r * Math.sin(a)).toFixed(2);
  const rx = (cx + r * Math.sin(a)).toFixed(2);
  const by = (cy + r * Math.cos(a)).toFixed(2);
  const tip = cy + tipDistance;
  const glow = selected ? SELECTED_HALO : style.halo;
  const glowOpacity = selected ? 1 : style.haloOpacity;
  const ringEdge = (r / glowR).toFixed(3); // glow radius is identical for selected markers: selection never changes a marker's size
  let content = iconMarkup ? `<g transform="translate(${cx - 5} ${cy - 5}) scale(${10 / 12})">${iconMarkup}</g>` : "";
  if (labelled) {
    // The disc is left for the desk number; the status glyph becomes a white-on-ring corner badge.
    const bx = cx - 9.9;
    const by = cy - 9.9;
    const white = iconMarkup.replaceAll(`stroke="${style.glyph}"`, 'stroke="#ffffff"');
    content = style.badge && iconMarkup
      ? `<circle cx="${bx}" cy="${by}" r="4.9" fill="${style.ring}" stroke="#ffffff" stroke-width="1.1"/>
<g transform="translate(${bx - 3.3} ${by - 3.3}) scale(0.55)">${white}</g>`
      : "";
  }
  // Explicit pixel size so the browser rasterises the vector at the tier's resolution.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${DESIGN.width} ${DESIGN.height}">
<defs>
<filter id="s" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="0.8" stdDeviation="0.9" flood-color="#00264c" flood-opacity="0.25"/></filter>
<radialGradient id="g" cx="${cx}" cy="${cy}" r="${glowR}" gradientUnits="userSpaceOnUse">
<stop offset="${ringEdge}" stop-color="${glow}" stop-opacity="${glowOpacity}"/>
<stop offset="0.95" stop-color="${glow}" stop-opacity="${glowOpacity}"/>
<stop offset="1" stop-color="${glow}" stop-opacity="0"/>
</radialGradient>
</defs>
<circle cx="${cx}" cy="${cy}" r="${glowR}" fill="url(#g)"/>
<path filter="url(#s)" d="M${cx} ${tip} L${lx} ${by} A${r} ${r} 0 1 1 ${rx} ${by} Z" fill="${style.ring}"/>
${selected ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="1.5"/>` : ""}
<circle cx="${cx}" cy="${cy}" r="${r - DESIGN.ring}" fill="${style.fill}"/>
${content}
</svg>`;
}

function rasterise(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("2D canvas unavailable"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Marker sprite failed to render"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function buildSprites(iconMarkup: Record<MarkerKind, string>, tier: SpriteTier): Promise<MarkerSprites> {
  let build = spriteCache.get(tier);
  if (build) return build;
  build = (async () => {
    const width = Math.round(MARKER.width * tier);
    const height = Math.round(MARKER.height * tier);
    const sprites: MarkerSprites = new Map();
    const kinds = Object.keys(MARKER_STYLES) as MarkerKind[];
    await Promise.all(
      kinds.flatMap((kind) =>
        [false, true].flatMap((selected) =>
          [false, true].map(async (labelled) => {
            const svg = markerSvg(MARKER_STYLES[kind], iconMarkup[kind], selected, labelled, width, height);
            sprites.set(spriteKey(kind, selected, labelled), await rasterise(svg, width, height));
          }),
        ),
      ),
    );
    return sprites;
  })();
  spriteCache.set(tier, build);
  build.catch(() => spriteCache.delete(tier));
  return build;
}

/**
 * Returns the sprite set for `tier` once ready (keeping the previous tier's
 * set on screen meanwhile), plus a hidden element that must be rendered once
 * (it's where the lucide glyphs are drawn for serialisation).
 */
export function useMarkerSprites(tier: SpriteTier = SPRITE_TIERS[0]): { sprites: MarkerSprites | null; iconSource: React.ReactNode } {
  const sourceRef = useRef<HTMLSpanElement>(null);
  const markupRef = useRef<Record<MarkerKind, string> | null>(null);
  const [sprites, setSprites] = useState<MarkerSprites | null>(null);

  useEffect(() => {
    if (!markupRef.current) {
      const root = sourceRef.current;
      if (!root) return;
      const markup = {} as Record<MarkerKind, string>;
      for (const kind of Object.keys(MARKER_STYLES) as MarkerKind[]) {
        markup[kind] = root.querySelector(`[data-marker="${kind}"]`)?.innerHTML ?? "";
      }
      markupRef.current = markup;
    }
    let cancelled = false;
    buildSprites(markupRef.current, tier)
      .then((result) => !cancelled && setSprites(result))
      .catch((error: unknown) => console.error("[floor-map] marker sprites", error));
    return () => {
      cancelled = true;
    };
  }, [tier]);

  const iconSource = (
    <span ref={sourceRef} hidden aria-hidden>
      {(Object.entries(MARKER_STYLES) as Array<[MarkerKind, MarkerStyle]>).map(([kind, style]) => {
        const Icon = style.icon;
        return (
          <span key={kind} data-marker={kind}>
            {Icon && <Icon width={12} height={12} color={style.glyph} strokeWidth={2.75} />}
          </span>
        );
      })}
    </span>
  );

  return { sprites, iconSource };
}

/** Small HTML version of a marker, for legends — same colours and glyphs as the map. */
export function MarkerSwatch({ kind, className }: { kind: MarkerKind; className?: string }) {
  const style = MARKER_STYLES[kind];
  const Icon = style.icon;
  return (
    <span
      aria-hidden
      className={className}
      style={{
        display: "inline-flex",
        width: 20,
        height: 20,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        background: style.fill,
        boxShadow: `inset 0 0 0 2px ${style.ring}, 0 0 3px 2px ${style.halo}${Math.round(style.haloOpacity * 255)
          .toString(16)
          .padStart(2, "0")}`,
        flexShrink: 0,
      }}
    >
      {Icon && <Icon width={11} height={11} color={style.glyph} strokeWidth={2.5} />}
    </span>
  );
}
