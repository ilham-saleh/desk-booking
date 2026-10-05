"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

/*
 * Keeps the site/floor a viewer is looking at across refreshes and visits.
 *
 * - The address bar carries the current choice (`?site=…&floor=…`), so a refresh or a
 *   shared link reopens the same floor.
 * - The last complete choice is also remembered per browser, so opening the Floor Map,
 *   Book a Desk or the Editing Platform from the sidebar returns to it.
 *
 * Both are hints, never authority: callers re-validate every id against the lists the
 * server returns for this viewer and fall back when one is gone or not visible.
 */

const STORAGE_KEY = "desk-booking:last-floor";

export interface FloorLocation {
  siteId: string;
  floorId: string;
}

export function parseFloorLocation(raw: string | null): FloorLocation | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object") {
      const { siteId, floorId } = value as Record<string, unknown>;
      if (typeof siteId === "string" && siteId && typeof floorId === "string" && floorId)
        return { siteId, floorId };
    }
  } catch {
    // corrupt entry — treat as nothing remembered
  }
  return null;
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
// Deliberately not subscribed to other tabs: switching floors there shouldn't move this map.
const noSubscribe = () => () => {};

/** The last floor this browser viewed. Null during SSR/hydration, so server and client markup agree. */
export function useLastFloorLocation(): FloorLocation | null {
  const raw = useSyncExternalStore(noSubscribe, readStored, () => null);
  return useMemo(() => parseFloorLocation(raw), [raw]);
}

/** Remembers the location once both ids are known (and validated by the caller). */
export function useSaveLastFloorLocation(
  siteId: string | null | undefined,
  floorId: string | null | undefined,
) {
  useEffect(() => {
    if (!siteId || !floorId) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ siteId, floorId }));
    } catch {
      // storage unavailable — the URL still survives a refresh
    }
  }, [siteId, floorId]);
}

/** First candidate that is one of `validIds`. */
export function pickValidId(
  candidates: readonly (string | null | undefined)[],
  validIds: readonly string[],
): string | undefined {
  return candidates.find((id): id is string => !!id && validIds.includes(id));
}

/**
 * Mirrors page state into the query string with history.replaceState — no navigation
 * or server render; Next's router picks the change up. A null/undefined value removes
 * that param; params not listed are left alone.
 */
export function useSyncedQueryParams(
  params: Record<string, string | null | undefined>,
  enabled = true,
) {
  const serialized = JSON.stringify(
    Object.entries(params).map(([key, value]) => [key, value ?? null]),
  );
  useEffect(() => {
    if (!enabled) return;
    const url = new URL(window.location.href);
    for (const [key, value] of JSON.parse(serialized) as [string, string | null][]) {
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, [serialized, enabled]);
}
