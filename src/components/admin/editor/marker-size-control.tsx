"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const SAVE_DELAY_MS = 400;

interface MarkerSizeControlProps {
  floorId: string;
  /** Saved size on the draft plan, in plan pixels; null = automatic. */
  savedSize: number | null;
  /** What automatic sizing currently picks for this floor. */
  autoSize: number;
  bounds: { min: number; max: number };
  disabled: boolean;
  /** Live canvas preview while dragging: a size, null for automatic, undefined to show the saved size. */
  onPreview: (size: number | null | undefined) => void;
}

/**
 * Per-floor-plan desk-marker size. The canvas previews every slider move;
 * the value is saved shortly after the admin stops adjusting it.
 */
export function MarkerSizeControl({ floorId, savedSize, autoSize, bounds, disabled, onPreview }: MarkerSizeControlProps) {
  const id = useId();
  const utils = api.useUtils();
  const [value, setValue] = useState<number | null>(savedSize);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; size: number | null } | null>(null);

  const save = api.floor.setMarkerSize.useMutation({
    onSuccess: (updated, input) => {
      utils.floor.getDraftFloorPlan.setData({ floorId: input.floorId }, updated);
      void utils.floor.get.invalidate({ floorId: input.floorId });
    },
    onError: (error) => {
      toast.error(error.message);
      setValue(savedSize);
      onPreview(undefined);
    },
  });
  const { mutate } = save;

  // Don't lose an adjustment that is still waiting to save when the floor changes.
  useEffect(
    () => () => {
      if (!pending.current) return;
      clearTimeout(pending.current.timer);
      mutate({ floorId, markerSize: pending.current.size });
      pending.current = null;
    },
    [floorId, mutate],
  );

  const schedule = (size: number | null) => {
    setValue(size);
    onPreview(size);
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = {
      size,
      timer: setTimeout(() => {
        pending.current = null;
        mutate({ floorId, markerSize: size });
      }, SAVE_DELAY_MS),
    };
  };

  const shown = value ?? autoSize;
  const percent = Math.round((shown / autoSize) * 100);
  const valueText = value === null ? "Automatic" : `${percent}% of automatic size`;

  return (
    <div className={cn("space-y-2 px-2.5 pt-2", disabled && "opacity-50")}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-text-secondary text-[0.8125rem] font-medium">
          Desk marker size
        </label>
        <span className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
          {save.isPending ? "Saving…" : value === null ? "Auto" : `${percent}%`}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={bounds.min}
        max={bounds.max}
        step={(bounds.max - bounds.min) / 100}
        value={Math.min(bounds.max, Math.max(bounds.min, shown))}
        aria-valuetext={valueText}
        disabled={disabled}
        onChange={(e) => schedule(Math.round(Number(e.target.value) * 10) / 10)}
        className="accent-navy w-full cursor-pointer disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="type-helper">{disabled ? "Switch to Edit to adjust." : "Match markers to the desks on this plan."}</p>
        {value !== null && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => schedule(null)}
            className="text-text-secondary hover:text-navy focus-visible:ring-cyan/40 flex shrink-0 items-center gap-1 rounded text-xs font-medium outline-none focus-visible:ring-2"
          >
            <RotateCcw className="size-3" /> Auto
          </button>
        )}
      </div>
    </div>
  );
}
