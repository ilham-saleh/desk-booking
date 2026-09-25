import { auth } from "@/server/auth";
import { SLOT_MINUTES } from "@/lib/time-slots";
import { FloorMapView, type FloorMapInitialState } from "@/components/floor-map/floor-map-view";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Only well-formed values are forwarded; anything else falls back to the map's defaults. */
function parseInitialState(params: SearchParams): FloorMapInitialState {
  const id = (value: string | undefined) => (value && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : undefined);
  const date = first(params.date);
  const slot = (value: string | undefined) => {
    const minutes = Number(value);
    return Number.isInteger(minutes) && minutes >= 0 && minutes <= 24 * 60 && minutes % SLOT_MINUTES === 0 ? minutes : undefined;
  };
  return {
    siteId: id(first(params.site)),
    floorId: id(first(params.floor)),
    deskId: id(first(params.desk)),
    personId: id(first(params.person)),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    startMinutes: slot(first(params.start)),
    endMinutes: slot(first(params.end)),
  };
}

export default async function FloorMapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  const initial = parseInitialState(await searchParams);
  // Keyed by the deep link so a new search result (e.g. from the top bar while already on this
  // page) re-initialises the map instead of being ignored by the mounted view's state.
  return (
    <FloorMapView
      key={JSON.stringify(initial)}
      currentUserId={session!.user.id}
      currentUserRole={session!.user.role}
      initial={initial}
    />
  );
}
