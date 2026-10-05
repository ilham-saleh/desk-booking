"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MapPinIcon, SearchIcon, UserIcon } from "lucide-react";

import { api } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DeskSearchHit {
  id: string;
  number: string;
  name: string | null;
  isActive: boolean;
  floor: { id: string; name: string; site: { id: string; name: string } };
}

export interface PersonSearchHit {
  id: string;
  name: string;
  email: string;
  department: string | null;
  title: string | null;
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Global search (top bar): type a desk number (any site) or a colleague's name
 * and pick a result to locate the desk on the Floor Map or open the person's
 * card. Results come from a bounded server-side search — the directory never
 * ships whole. Presentation-agnostic: the caller decides what a pick does.
 */
export function GlobalSearch({
  onPickDesk,
  onPickPerson,
  className,
  inputClassName,
  label = "Search",
  hideLabel = false,
  placeholder = "Search desks or people…",
}: {
  onPickDesk: (desk: DeskSearchHit) => void;
  onPickPerson: (person: PersonSearchHit) => void;
  className?: string;
  inputClassName?: string;
  label?: string;
  /** Keep the label for screen readers only (compact placements such as the top bar). */
  hideLabel?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const debounced = useDebounced(query.trim(), 200);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const inputId = `${listId}-input`;

  const results = api.search.global.useQuery(
    { query: debounced },
    { enabled: debounced.length > 0, placeholderData: (prev) => prev },
  );
  const desks = debounced ? (results.data?.desks ?? []) : [];
  const people = debounced ? (results.data?.people ?? []) : [];
  const items: Array<
    { kind: "desk"; desk: DeskSearchHit } | { kind: "person"; person: PersonSearchHit }
  > = [
    ...desks.map((desk) => ({ kind: "desk" as const, desk })),
    ...people.map((person) => ({ kind: "person" as const, person })),
  ];

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function pick(index: number) {
    const item = items[index];
    if (!item) return;
    if (item.kind === "desk") onPickDesk(item.desk);
    else onPickPerson(item.person);
    setOpen(false);
    setQuery("");
  }

  const showList = open && debounced.length > 0;

  return (
    <div ref={rootRef} className={cn("relative grid gap-1.5", className)}>
      <Label
        htmlFor={inputId}
        className={cn(
          "text-muted-foreground text-xs tracking-wide uppercase",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </Label>
      <div className="relative">
        <SearchIcon
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            showList && items[activeIndex] ? `${listId}-${activeIndex}` : undefined
          }
          autoComplete="off"
          className={cn("bg-surface-muted focus-visible:bg-surface h-9 rounded-full border-transparent pl-9 shadow-none hover:border-border-strong", inputClassName)}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && showList) {
              e.preventDefault();
              pick(activeIndex);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
      </div>

      {showList && (
        <div className="bg-popover text-popover-foreground animate-in fade-in-0 slide-in-from-top-1 absolute top-full left-0 z-40 mt-1.5 w-full min-w-80 overflow-hidden rounded-xl border shadow-lg duration-150">
          <ul id={listId} role="listbox" className="scroll-quiet max-h-96 overflow-y-auto p-1.5 text-sm">
            {items.length === 0 && (
              <li className="text-muted-foreground px-3 py-4 text-center">
                {results.isFetching ? "Searching…" : `No desk or person matches “${debounced}”`}
              </li>
            )}
            {desks.length > 0 && <GroupLabel>Desks</GroupLabel>}
            {desks.map((desk, i) => (
              <ResultRow
                key={desk.id}
                id={`${listId}-${i}`}
                active={i === activeIndex}
                onPick={() => pick(i)}
                onHover={() => setActiveIndex(i)}
              >
                <MapPinIcon aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    Desk {desk.number}
                    {desk.name ? ` · ${desk.name}` : ""}
                    {!desk.isActive ? " (inactive)" : ""}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {desk.floor.site.name} · {desk.floor.name}
                  </span>
                </span>
              </ResultRow>
            ))}
            {people.length > 0 && <GroupLabel>People</GroupLabel>}
            {people.map((person, j) => {
              const i = desks.length + j;
              return (
                <ResultRow
                  key={person.id}
                  id={`${listId}-${i}`}
                  active={i === activeIndex}
                  onPick={() => pick(i)}
                  onHover={() => setActiveIndex(i)}
                >
                  <UserIcon aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{person.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[person.title, person.department, person.email].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </ResultRow>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <li
      role="presentation"
      className="type-overline px-2.5 pt-2 pb-1"
    >
      {children}
    </li>
  );
}

function ResultRow({
  id,
  active,
  onPick,
  onHover,
  children,
}: {
  id: string;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
  children: React.ReactNode;
}) {
  return (
    <li id={id} role="option" aria-selected={active}>
      <button
        type="button"
        className={cn(
          "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors duration-100",
          active && "bg-navy-soft text-navy",
        )}
        onMouseEnter={onHover}
        onClick={onPick}
      >
        {children}
      </button>
    </li>
  );
}
