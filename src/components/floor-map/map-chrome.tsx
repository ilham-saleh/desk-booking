"use client";

import { useEffect, useState } from "react";
import { Maximize, Minus, Plus, ScanSearch } from "lucide-react";

import { cn } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/loading";
import { MarkerSwatch, type MarkerKind } from "@/components/floor-map/desk-markers";
import type { MapViewportControls } from "@/components/floor-map/map-viewport";

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-text-secondary hover:bg-navy-soft hover:text-navy focus-visible:ring-cyan/40 flex size-9 items-center justify-center transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset active:bg-[#d9e2ec]"
    >
      {children}
    </button>
  );
}

/** Compact floating zoom cluster. Subscribes to zoom changes itself so the map never re-renders for them. */
export function MapControls({
  viewport,
  className,
  fullscreenTarget,
}: {
  viewport: MapViewportControls;
  className?: string;
  /** Element to make fullscreen; omit to hide the fullscreen control. */
  fullscreenTarget?: React.RefObject<HTMLElement | null>;
}) {
  const [percent, setPercent] = useState(100);
  useEffect(() => viewport.subscribeZoom(setPercent), [viewport]);

  return (
    <div
      className={cn(
        "bg-surface/95 border-border-control shadow-float pointer-events-auto flex flex-col overflow-hidden rounded-xl border backdrop-blur",
        className,
      )}
      role="group"
      aria-label="Map zoom"
    >
      <ControlButton label="Zoom in" onClick={viewport.zoomIn}>
        <Plus className="size-4" />
      </ControlButton>
      <span
        className="text-muted-foreground border-y py-1 text-center text-[0.625rem] font-semibold tabular-nums"
        aria-live="polite"
      >
        {percent}%
      </span>
      <ControlButton label="Zoom out" onClick={viewport.zoomOut}>
        <Minus className="size-4" />
      </ControlButton>
      <span className="bg-border h-px" />
      <ControlButton label="Fit floor to screen" onClick={() => viewport.fit()}>
        <ScanSearch className="size-4" />
      </ControlButton>
      {fullscreenTarget && (
        <ControlButton
          label="Full screen"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void fullscreenTarget.current?.requestFullscreen?.();
          }}
        >
          <Maximize className="size-4" />
        </ControlButton>
      )}
    </div>
  );
}

export interface LegendEntry {
  kind: MarkerKind;
  label: string;
}

export function MapLegend({
  entries,
  extra,
  className,
}: {
  entries: LegendEntry[];
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-surface/95 border-border-control shadow-float pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3.5 py-2.5 text-xs backdrop-blur",
        className,
      )}
    >
      {entries.map((entry) => (
        <span key={entry.kind} className="text-text-secondary flex items-center gap-2 font-medium">
          <MarkerSwatch kind={entry.kind} />
          {entry.label}
        </span>
      ))}
      {extra}
    </div>
  );
}

/**
 * Shown over the map while a floor plan loads. Keeps the map's dimensions (no
 * layout jump) and fades out once the plan is drawn.
 */
export function MapLoadingOverlay({
  visible,
  label = "Loading floor plan…",
}: {
  visible: boolean;
  label?: string;
}) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="skeleton absolute inset-8 rounded-3xl opacity-60" />
      <div
        className="bg-surface relative flex w-56 flex-col gap-2.5 overflow-hidden rounded-xl border px-4 py-3 shadow-md"
        role="status"
      >
        <span className="text-text-secondary text-[0.8125rem] font-medium">{label}</span>
        <ProgressBar className="bg-surface-sunken rounded-full" />
      </div>
    </div>
  );
}
