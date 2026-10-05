"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, Lock, Monitor, MonitorOff, Plus, UserRound, type LucideIcon } from "lucide-react";

/**
 * Desk map markers, pre-rendered once per session into small bitmaps
 * ("sprites"). The Konva layers then just blit an image per desk — no
 * per-frame vector paths, gradients or shadow blurs — which is what keeps
 * pan/zoom smooth with hundreds of desks. The glyphs are real lucide icons,
 * rendered into a hidden node and serialised into each sprite's SVG.
 *
 * Sprites are drawn in SCREEN pixels: map layers counter-scale each marker
 * against the stage zoom, so a desk is always the same on-screen size.
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
  icon: LucideIcon;
  /** Pin body (outer ring + tail). */
  ring: string;
  /** Inner disc. */
  fill: string;
  glyph: string;
  /** Soft outer halo — the brand light blue, as in the reference markers. */
  halo: string;
  haloOpacity: number;
}

export const MARKER_STYLES: Record<MarkerKind, MarkerStyle> = {
  available: { icon: Monitor, ring: "#148a55", fill: "#e7f6ee", glyph: "#117248", halo: "#bbddff", haloOpacity: 0.7 },
  booked: { icon: UserRound, ring: "#00264c", fill: "#00264c", glyph: "#ffffff", halo: "#bbddff", haloOpacity: 0.7 },
  restricted: { icon: Lock, ring: "#d9692a", fill: "#fff3e8", glyph: "#a8540d", halo: "#ffd6c0", haloOpacity: 0.7 },
  inactive: { icon: Ban, ring: "#a3afbd", fill: "#eef1f4", glyph: "#6b7a8c", halo: "#dfe5eb", haloOpacity: 0.6 },
  "editor-active": { icon: Monitor, ring: "#00264c", fill: "#ffffff", glyph: "#00264c", halo: "#bbddff", haloOpacity: 0.7 },
  "editor-inactive": { icon: MonitorOff, ring: "#a3afbd", fill: "#eef1f4", glyph: "#6b7a8c", halo: "#dfe5eb", haloOpacity: 0.6 },
  ghost: { icon: Plus, ring: "#1dbfc2", fill: "#e3f7f7", glyph: "#012b30", halo: "#1dbfc2", haloOpacity: 0.25 },
};

/** Sprite artwork is drawn in these design units, then displayed at MARKER size. */
const DESIGN = { width: 34, height: 40, anchorX: 17, anchorY: 17, radius: 12 } as const;
const DISPLAY_SCALE = 24 / DESIGN.width;

/**
 * On-screen marker geometry in CSS pixels — fixed at every zoom level (the map
 * counter-scales markers). The disc centre sits exactly on the desk's coordinate.
 */
export const MARKER = {
  width: DESIGN.width * DISPLAY_SCALE,
  height: DESIGN.height * DISPLAY_SCALE,
  anchorX: DESIGN.anchorX * DISPLAY_SCALE,
  anchorY: DESIGN.anchorY * DISPLAY_SCALE,
  radius: DESIGN.radius * DISPLAY_SCALE,
  /** Centre offset (x right, y up) and radius of the small status badge at the pin's top-right. */
  badgeOffset: 7,
  badgeRadius: 3.25,
} as const;
const SELECTED_HALO = "#1dbfc2";
const RASTER_SCALE = 3;

export type SpriteKey = `${MarkerKind}` | `${MarkerKind}:selected`;
export type MarkerSprites = Map<SpriteKey, HTMLCanvasElement>;

let spriteCache: Promise<MarkerSprites> | null = null;

function markerSvg(style: MarkerStyle, iconMarkup: string, selected: boolean): string {
  const { anchorX: cx, anchorY: cy, radius: r } = DESIGN;
  // Teardrop: disc of radius r, tangents meeting at a tail tip below the disc.
  const a = (30 * Math.PI) / 180;
  const lx = (cx - r * Math.sin(a)).toFixed(2);
  const rx = (cx + r * Math.sin(a)).toFixed(2);
  const by = (cy + r * Math.cos(a)).toFixed(2);
  const tip = cy + r + 6;
  const halo = selected ? SELECTED_HALO : style.halo;
  const haloOpacity = selected ? 0.5 : style.haloOpacity;
  const haloR = 15.75; // identical for selected markers: selection never changes a marker's size
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${DESIGN.width}" height="${DESIGN.height}" viewBox="0 0 ${DESIGN.width} ${DESIGN.height}">
<defs><filter id="s" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.3" flood-color="#00264c" flood-opacity="0.3"/></filter></defs>
<circle cx="${cx}" cy="${cy}" r="${haloR}" fill="${halo}" fill-opacity="${haloOpacity}"/>
<path filter="url(#s)" d="M${cx} ${tip} L${lx} ${by} A${r} ${r} 0 1 1 ${rx} ${by} Z" fill="${style.ring}"/>
${selected ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="1.5"/>` : ""}
<circle cx="${cx}" cy="${cy}" r="${r - 2.25}" fill="${style.fill}"/>
<g transform="translate(${cx - 6} ${cy - 6})">${iconMarkup}</g>
</svg>`;
}

function rasterise(svg: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(MARKER.width * RASTER_SCALE);
      canvas.height = Math.round(MARKER.height * RASTER_SCALE);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("2D canvas unavailable"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Marker sprite failed to render"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function buildSprites(iconMarkup: Record<MarkerKind, string>): Promise<MarkerSprites> {
  spriteCache ??= (async () => {
    const sprites: MarkerSprites = new Map();
    const kinds = Object.keys(MARKER_STYLES) as MarkerKind[];
    await Promise.all(
      kinds.flatMap((kind) =>
        [false, true].map(async (selected) => {
          const canvas = await rasterise(markerSvg(MARKER_STYLES[kind], iconMarkup[kind], selected));
          sprites.set(selected ? `${kind}:selected` : kind, canvas);
        }),
      ),
    );
    return sprites;
  })();
  spriteCache.catch(() => {
    spriteCache = null;
  });
  return spriteCache;
}

/**
 * Returns the sprite set once ready, plus a hidden element that must be
 * rendered once (it's where the lucide glyphs are drawn for serialisation).
 */
export function useMarkerSprites(): { sprites: MarkerSprites | null; iconSource: React.ReactNode } {
  const sourceRef = useRef<HTMLSpanElement>(null);
  const [sprites, setSprites] = useState<MarkerSprites | null>(null);

  useEffect(() => {
    const root = sourceRef.current;
    if (!root) return;
    const markup = {} as Record<MarkerKind, string>;
    for (const kind of Object.keys(MARKER_STYLES) as MarkerKind[]) {
      markup[kind] = root.querySelector(`[data-marker="${kind}"]`)?.innerHTML ?? "";
    }
    let cancelled = false;
    buildSprites(markup)
      .then((result) => !cancelled && setSprites(result))
      .catch((error: unknown) => console.error("[floor-map] marker sprites", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const iconSource = (
    <span ref={sourceRef} hidden aria-hidden>
      {(Object.entries(MARKER_STYLES) as Array<[MarkerKind, MarkerStyle]>).map(([kind, style]) => {
        const Icon = style.icon;
        return (
          <span key={kind} data-marker={kind}>
            <Icon width={12} height={12} color={style.glyph} strokeWidth={2.75} />
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
        boxShadow: `inset 0 0 0 2px ${style.ring}, 0 0 0 3px ${style.halo}${Math.round(style.haloOpacity * 255)
          .toString(16)
          .padStart(2, "0")}`,
        flexShrink: 0,
      }}
    >
      <Icon width={11} height={11} color={style.glyph} strokeWidth={2.5} />
    </span>
  );
}
