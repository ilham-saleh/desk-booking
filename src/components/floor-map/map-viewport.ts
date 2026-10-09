"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type Konva from "konva";

import {
  MARKER,
  MIN_HIT_PX,
  MIN_PLAN_TEXT_PX,
  markerGroupScale,
  markerLevel,
  type MarkerLevel,
} from "@/components/floor-map/marker-scale";

/**
 * Pan/zoom for a Konva floor-plan stage, shared by the employee Floor Map and
 * the admin Editing Platform.
 *
 * - Content (the floor plan, desks, rooms) lives in FLOOR-PLAN IMAGE PIXELS.
 *   The stage transform maps it to the screen; nothing is persisted in
 *   viewport pixels.
 * - Zoom/pan are applied imperatively to the Konva stage, never through React
 *   state, so a wheel tick or drag costs one canvas redraw and zero React
 *   renders.
 * - Markers are sized on the plan and zoom with it (see marker-scale.ts). On
 *   every change the viewport updates the few zoom-dependent nodes, found by
 *   name:
 *   - `MARKER_SCALE` groups (desks, utilities) get the floor's marker scale,
 *     floored so they never shrink below a legible on-screen size;
 *   - `SCREEN_SCALE` nodes inside them (hover/selection tags) cancel the
 *     group's total scale and keep a constant on-screen size;
 *   - `HIT_AREA` circles grow so a small marker is still easy to click/tap;
 *   - `PLAN_TEXT` (room names) hides while too small to read.
 * - The marker "level" (sprite resolution, whether markers carry their desk
 *   number) changes only at thresholds; components subscribe to it with
 *   `useMarkerLevel`, so React re-renders markers only when it changes.
 */

export const MARKER_SCALE = "marker-scale";
export const SCREEN_SCALE = "screen-scale";
export const HIT_AREA = "marker-hit";
export const PLAN_TEXT = "plan-text";
/** Desk-number tags shown on hover while markers are too small to carry the number. */
export const HOVER_LABEL = "hover-label";

const MIN_ZOOM = 0.5; // relative to the default view
const MAX_ZOOM = 8;
const FIT_PADDING = 40;
/**
 * The default view sits slightly closer than "whole plan with padding": floor
 * plans carry their own white margins, so this fills the frame with the floor.
 */
const DEFAULT_ZOOM = 1.08;
const ANIMATION_MS = 220;

/** Ref-free imperative API — safe to pass to child components and call from handlers/effects. */
export interface MapViewportControls {
  /** Current marker level; a stable object until the level changes. */
  getMarkerLevel: () => MarkerLevel;
  subscribeMarkerLevel: (listener: () => void) => () => void;
  /**
   * Re-apply zoom-dependent sizing to every node. Call from a layout effect
   * after rendering new markers so they're correct before paint.
   */
  refresh: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: (animate?: boolean) => void;
  /** Centre a plan point, zooming in to at least `zoom`× the default view. */
  focusOn: (x: number, y: number, zoom?: number) => void;
  /** Zoom as a percentage of the default view; subscribe for display without re-rendering the map. */
  subscribeZoom: (listener: (percent: number) => void) => () => void;
}

export interface MapViewport {
  containerRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<Konva.Stage | null>;
  /** Container size in CSS pixels; 0×0 until measured. */
  size: { width: number; height: number };
  stageHandlers: {
    onWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void;
    onDragStart: () => void;
    onTouchMove: (e: Konva.KonvaEventObject<TouchEvent>) => void;
    onTouchEnd: () => void;
    dragBoundFunc: (pos: Konva.Vector2d) => Konva.Vector2d;
  };
  controls: MapViewportControls;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const devicePixelRatio = () => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);

export function useMapViewport({
  contentWidth,
  contentHeight,
  markerPlanScale,
}: {
  contentWidth: number;
  contentHeight: number;
  /** Marker-group scale for this floor, from `markerPlanScale()`. */
  markerPlanScale: number;
}): MapViewport {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const scaleRef = useRef(1);
  const fitScaleRef = useRef(1);
  const userMovedRef = useRef(false);
  const animationRef = useRef<number | null>(null);
  const listenersRef = useRef(new Set<(percent: number) => void>());
  const pinchRef = useRef<{ distance: number; center: Konva.Vector2d } | null>(null);
  const planScaleRef = useRef(markerPlanScale);
  const levelRef = useRef<MarkerLevel>(markerLevel(MARKER.width, devicePixelRatio()));
  const levelListenersRef = useRef(new Set<() => void>());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const width = Math.round(entry.contentRect.width);
      const height = Math.round(entry.contentRect.height);
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const computeFit = useCallback((): View => {
    const { width, height } = size;
    const padding = Math.min(FIT_PADDING, width * 0.05, height * 0.05);
    const scale = DEFAULT_ZOOM * Math.max(0.01, Math.min((width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight));
    return { scale, x: (width - contentWidth * scale) / 2, y: (height - contentHeight * scale) / 2 };
  }, [size, contentWidth, contentHeight]);

  const apply = useCallback((view: View) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scale({ x: view.scale, y: view.scale });
    stage.position({ x: view.x, y: view.y });
    scaleRef.current = view.scale;

    const group = markerGroupScale(planScaleRef.current, view.scale);
    const markerPx = group * view.scale; // screen pixels per marker unit
    for (const node of stage.find(`.${MARKER_SCALE}`)) node.scale({ x: group, y: group });
    for (const node of stage.find(`.${SCREEN_SCALE}`)) node.scale({ x: 1 / markerPx, y: 1 / markerPx });
    for (const node of stage.find(`.${HIT_AREA}`)) {
      const grow = Math.max(1, MIN_HIT_PX / 2 / ((node as Konva.Circle).radius() * markerPx));
      node.scale({ x: grow, y: grow });
    }
    for (const node of stage.find(`.${PLAN_TEXT}`)) node.visible((node as Konva.Text).fontSize() * view.scale >= MIN_PLAN_TEXT_PX);
    stage.batchDraw();

    const percent = Math.round((view.scale / fitScaleRef.current) * 100);
    for (const listener of listenersRef.current) listener(percent);
    const level = markerLevel(MARKER.width * markerPx, devicePixelRatio());
    if (level.tier !== levelRef.current.tier || level.labelled !== levelRef.current.labelled) {
      levelRef.current = level;
      for (const listener of levelListenersRef.current) listener();
    }
  }, []);

  const currentView = useCallback((): View => {
    const stage = stageRef.current;
    return stage ? { scale: stage.scaleX(), x: stage.x(), y: stage.y() } : { scale: 1, x: 0, y: 0 };
  }, []);

  const cancelAnimation = () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  };

  const animateTo = useCallback(
    (target: View) => {
      cancelAnimation();
      const from = currentView();
      const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return apply(target);
      const start = performance.now();
      const step = (now: number) => {
        const t = easeOutCubic(Math.min(1, (now - start) / ANIMATION_MS));
        apply({
          scale: from.scale + (target.scale - from.scale) * t,
          x: from.x + (target.x - from.x) * t,
          y: from.y + (target.y - from.y) * t,
        });
        animationRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      animationRef.current = requestAnimationFrame(step);
    },
    [apply, currentView],
  );

  const clampScale = useCallback(
    (scale: number) => Math.min(fitScaleRef.current * MAX_ZOOM, Math.max(fitScaleRef.current * MIN_ZOOM, scale)),
    [],
  );

  /** The view after zooming by `factor` around a screen point. */
  const zoomedView = useCallback(
    (factor: number, point: Konva.Vector2d, from: View = currentView()): View => {
      const scale = clampScale(from.scale * factor);
      const ratio = scale / from.scale;
      return { scale, x: point.x - (point.x - from.x) * ratio, y: point.y - (point.y - from.y) * ratio };
    },
    [currentView, clampScale],
  );

  // Fit on first measure and whenever the container resizes before the viewer has moved the map.
  useLayoutEffect(() => {
    if (size.width === 0 || size.height === 0) return;
    const fitView = computeFit();
    fitScaleRef.current = fitView.scale;
    if (!userMovedRef.current) {
      cancelAnimation();
      apply(fitView);
    } else {
      apply(currentView());
    }
  }, [size, computeFit, apply, currentView]);

  useEffect(() => cancelAnimation, []);

  // The floor's marker size follows its desks (e.g. an admin moving one); re-apply when it changes.
  useLayoutEffect(() => {
    if (planScaleRef.current === markerPlanScale) return;
    planScaleRef.current = markerPlanScale;
    if (stageRef.current) apply(currentView());
  }, [markerPlanScale, apply, currentView]);

  const zoomIn = useCallback(() => {
    userMovedRef.current = true;
    animateTo(zoomedView(1.5, { x: size.width / 2, y: size.height / 2 }));
  }, [animateTo, zoomedView, size]);

  const zoomOut = useCallback(() => {
    userMovedRef.current = true;
    animateTo(zoomedView(1 / 1.5, { x: size.width / 2, y: size.height / 2 }));
  }, [animateTo, zoomedView, size]);

  const fit = useCallback(
    (animate = true) => {
      userMovedRef.current = false;
      const fitView = computeFit();
      if (animate) animateTo(fitView);
      else apply(fitView);
    },
    [computeFit, animateTo, apply],
  );

  const focusOn = useCallback(
    (x: number, y: number, zoom = 2.2) => {
      if (size.width === 0) return;
      userMovedRef.current = true;
      const scale = clampScale(Math.max(currentView().scale, fitScaleRef.current * zoom));
      animateTo({ scale, x: size.width / 2 - x * scale, y: size.height / 2 - y * scale });
    },
    [animateTo, currentView, clampScale, size],
  );

  const onWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      const pointer = stage?.getPointerPosition();
      if (!stage || !pointer) return;
      cancelAnimation();
      userMovedRef.current = true;
      const pixels = e.evt.deltaMode === 1 ? e.evt.deltaY * 16 : e.evt.deltaY;
      // Trackpad pinch arrives as ctrl+wheel with small deltas; give it a higher gain.
      const factor = Math.exp(-pixels * (e.evt.ctrlKey ? 0.012 : 0.0018));
      apply(zoomedView(factor, pointer));
    },
    [apply, zoomedView],
  );

  const onTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      const stage = stageRef.current;
      if (touches.length !== 2 || !stage) return;
      e.evt.preventDefault();
      stage.stopDrag();
      const rect = stage.container().getBoundingClientRect();
      const [a, b] = [touches[0]!, touches[1]!];
      const center = { x: (a.clientX + b.clientX) / 2 - rect.left, y: (a.clientY + b.clientY) / 2 - rect.top };
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const previous = pinchRef.current;
      pinchRef.current = { distance, center };
      if (!previous) return;
      userMovedRef.current = true;
      const view = zoomedView(distance / previous.distance, center);
      apply({ ...view, x: view.x + center.x - previous.center.x, y: view.y + center.y - previous.center.y });
    },
    [apply, zoomedView],
  );

  const onTouchEnd = useCallback(() => {
    pinchRef.current = null;
  }, []);

  const onDragStart = useCallback(() => {
    cancelAnimation();
    userMovedRef.current = true;
  }, []);

  /** Keep at least a quarter of the plan on screen so it can't be lost off an edge. */
  const dragBoundFunc = useCallback(
    (pos: Konva.Vector2d) => {
      const scale = scaleRef.current;
      const w = contentWidth * scale;
      const h = contentHeight * scale;
      const keepX = Math.min(w, size.width) * 0.25;
      const keepY = Math.min(h, size.height) * 0.25;
      return {
        x: Math.min(size.width - keepX, Math.max(keepX - w, pos.x)),
        y: Math.min(size.height - keepY, Math.max(keepY - h, pos.y)),
      };
    },
    [contentWidth, contentHeight, size],
  );

  const subscribeZoom = useCallback((listener: (percent: number) => void) => {
    listenersRef.current.add(listener);
    listener(Math.round((scaleRef.current / fitScaleRef.current) * 100));
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getMarkerLevel = useCallback(() => levelRef.current, []);
  const subscribeMarkerLevel = useCallback((listener: () => void) => {
    levelListenersRef.current.add(listener);
    return () => {
      levelListenersRef.current.delete(listener);
    };
  }, []);
  const refresh = useCallback(() => {
    if (stageRef.current) apply(currentView());
  }, [apply, currentView]);

  const controls = useMemo<MapViewportControls>(
    () => ({ getMarkerLevel, subscribeMarkerLevel, refresh, zoomIn, zoomOut, fit, focusOn, subscribeZoom }),
    [getMarkerLevel, subscribeMarkerLevel, refresh, zoomIn, zoomOut, fit, focusOn, subscribeZoom],
  );
  const stageHandlers = useMemo(
    () => ({ onWheel, onDragStart, onTouchMove, onTouchEnd, dragBoundFunc }),
    [onWheel, onDragStart, onTouchMove, onTouchEnd, dragBoundFunc],
  );

  return { containerRef, stageRef, size, stageHandlers, controls };
}

/** The current marker level; re-renders only when markers change resolution or start/stop carrying numbers. */
export function useMarkerLevel(controls: MapViewportControls): MarkerLevel {
  return useSyncExternalStore(controls.subscribeMarkerLevel, controls.getMarkerLevel, controls.getMarkerLevel);
}
