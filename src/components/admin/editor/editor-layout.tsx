"use client";

import { useState } from "react";
import {
  Armchair,
  ChevronsLeft,
  ChevronsRight,
  DoorOpen,
  Edit2,
  Hexagon,
  ImageUp,
  MapPinned,
  MousePointer2,
  PencilRuler,
  Plus,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type EditorObjectType = "desks" | "utilities" | "rooms" | "neighbourhoods" | null;
export type EditorAction = "create" | "edit" | "delete" | null;
/** Select = navigate/inspect only; Edit = create, drag, edit, delete. Kept separate so nothing moves by accident. */
export type EditorMode = "select" | "edit";

interface EditorLayoutProps {
  children: React.ReactNode;
  /** Site/floor pickers and selection actions, shown in the editor's top bar. */
  toolbar: React.ReactNode;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  activeObjectType: EditorObjectType;
  activeAction: EditorAction;
  /** Sidebar tool clicks — the page decides what they do given the current selection. */
  onToolAction: (objectType: Exclude<EditorObjectType, null>, action: Exclude<EditorAction, null>) => void;
  /** Label of the currently selected object (e.g. "Desk 2.21"), for the sidebar status card. */
  selectionLabel: string | null;
  onClearSelection: () => void;
  hasFloorPlan: boolean;
  /** False until a floor is chosen — tools are shown but disabled. */
  floorSelected: boolean;
  onOpenFloorPlan: () => void;
}

interface ToolDef {
  action: Exclude<EditorAction, null>;
  label: string;
  icon: LucideIcon;
}

const GROUPS: Array<{ type: Exclude<EditorObjectType, null>; label: string; icon: LucideIcon; tools: ToolDef[] }> = [
  {
    type: "desks",
    label: "Seats",
    icon: Armchair,
    tools: [
      { action: "create", label: "Create", icon: Plus },
      { action: "edit", label: "Edit", icon: Edit2 },
      { action: "delete", label: "Delete", icon: Trash2 },
    ],
  },
  {
    type: "neighbourhoods",
    label: "Neighbourhoods",
    icon: Hexagon,
    tools: [
      { action: "create", label: "Create", icon: Plus },
      { action: "edit", label: "Edit", icon: Edit2 },
      { action: "delete", label: "Delete", icon: Trash2 },
    ],
  },
  {
    type: "utilities",
    label: "Utilities",
    icon: MapPinned,
    tools: [
      { action: "create", label: "Create", icon: Plus },
      { action: "delete", label: "Delete", icon: Trash2 },
    ],
  },
  {
    type: "rooms",
    label: "Rooms & spaces",
    icon: DoorOpen,
    tools: [
      { action: "create", label: "Create", icon: Plus },
      { action: "delete", label: "Delete", icon: Trash2 },
    ],
  },
];

/**
 * Visual editor frame: tool rail on the left, a slim context bar on top, and
 * the floor-plan canvas filling everything else (the page must be rendered in
 * a positioned, full-height parent — the app shell's `main`).
 */
export function EditorLayout({
  children,
  toolbar,
  mode,
  onModeChange,
  activeObjectType,
  activeAction,
  onToolAction,
  selectionLabel,
  onClearSelection,
  hasFloorPlan,
  floorSelected,
  onOpenFloorPlan,
}: EditorLayoutProps) {
  const [railOpen, setRailOpen] = useState(true);

  const tip = !floorSelected
    ? "Choose a site and floor to start editing."
    : !hasFloorPlan
      ? "Upload a floor plan image to get started — desks can still be placed on a blank plan."
      : mode === "select"
        ? "Select mode is read-only. Pick a tool, or switch to Edit, to create, move or delete."
        : activeAction === "create" && activeObjectType === "desks"
          ? "Click anywhere on the floor plan to place the new desk. Press Esc to cancel."
          : "Drag a desk to move it — it saves on drop. Double-click a desk to edit it.";

  return (
    <div className="absolute inset-0 flex">
      {/* Tool rail */}
      <aside
        className={cn(
          "bg-surface flex shrink-0 flex-col border-r transition-[width] duration-200 ease-out",
          railOpen ? "w-60" : "w-[60px]",
        )}
        aria-label="Editor tools"
      >
        <div className={cn("flex h-14 shrink-0 items-center border-b", railOpen ? "justify-between px-4" : "justify-center")}>
          {railOpen && (
            <span className="text-navy flex items-center gap-2 text-sm font-semibold">
              <PencilRuler className="text-cyan size-4" /> Editor tools
            </span>
          )}
          <button
            type="button"
            onClick={() => setRailOpen((v) => !v)}
            aria-expanded={railOpen}
            aria-label={railOpen ? "Collapse editor tools" : "Expand editor tools"}
            className="text-muted-foreground hover:bg-navy-soft hover:text-navy focus-visible:ring-cyan/40 flex size-8 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2"
          >
            {railOpen ? <ChevronsLeft className="size-4" /> : <ChevronsRight className="size-4" />}
          </button>
        </div>

        <div className="scroll-quiet flex-1 space-y-4 overflow-y-auto p-3">
          {/* Mode */}
          <div className={cn("bg-surface-sunken grid gap-1 rounded-full p-1", railOpen ? "grid-cols-2" : "grid-cols-1 rounded-2xl")} role="radiogroup" aria-label="Editor mode">
            {(
              [
                ["select", "Select", MousePointer2],
                ["edit", "Edit", PencilRuler],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                title={label}
                disabled={!floorSelected}
                onClick={() => onModeChange(value)}
                className={cn(
                  "focus-visible:ring-cyan/40 flex h-8 items-center justify-center gap-1.5 rounded-full text-[0.8125rem] font-semibold transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-2 disabled:opacity-45",
                  mode === value ? "bg-surface text-navy shadow-sm" : "text-muted-foreground hover:text-navy",
                )}
              >
                <Icon className="size-3.5" />
                {railOpen && label}
              </button>
            ))}
          </div>

          {GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <div key={group.type} className="space-y-1">
                {railOpen ? (
                  <p className="type-overline flex items-center gap-2 px-1 pb-1">
                    <GroupIcon className="size-3.5" />
                    {group.label}
                  </p>
                ) : (
                  <span aria-hidden className="bg-border mx-auto mb-1 block h-px w-6" />
                )}
                <div className={cn(railOpen ? "grid grid-cols-3 gap-1" : "space-y-1")}>
                  {group.tools.map((tool) => {
                    const active = activeObjectType === group.type && activeAction === tool.action;
                    const ToolIcon = tool.icon;
                    return (
                      <button
                        key={tool.action}
                        type="button"
                        aria-pressed={active}
                        aria-label={`${group.label}: ${tool.label}`}
                        title={`${group.label}: ${tool.label}`}
                        disabled={!floorSelected}
                        onClick={() => onToolAction(group.type, tool.action)}
                        className={cn(
                          "focus-visible:ring-cyan/40 flex w-full items-center justify-center rounded-lg text-[0.75rem] font-medium transition-colors duration-150 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40",
                          railOpen ? "h-[3.25rem] flex-col gap-1 border" : "h-9",
                          active
                            ? tool.action === "delete"
                              ? "border-danger/30 bg-danger-soft text-danger"
                              : "border-navy bg-navy text-white"
                            : "border-border text-text-secondary hover:border-navy/25 hover:bg-navy-soft hover:text-navy",
                        )}
                      >
                        <ToolIcon className="size-4" />
                        {railOpen && tool.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="space-y-1">
            {railOpen ? (
              <p className="type-overline flex items-center gap-2 px-2 pb-0.5">
                <ImageUp className="size-3.5" />
                Floor plan
              </p>
            ) : (
              <span aria-hidden className="bg-border mx-auto mb-1 block h-px w-6" />
            )}
            <button
              type="button"
              disabled={!floorSelected}
              title={railOpen ? undefined : "Upload & publish floor plan"}
              onClick={onOpenFloorPlan}
              className={cn(
                "focus-visible:ring-cyan/40 text-text-secondary hover:bg-navy-soft hover:text-navy flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40",
                !railOpen && "justify-center px-0",
              )}
            >
              <ImageUp className="size-4" />
              {railOpen && (
                <span className="flex flex-1 items-center justify-between gap-2">
                  Upload &amp; publish
                  {floorSelected && !hasFloorPlan && (
                    <span className="bg-warning-soft text-warning rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold">None</span>
                  )}
                </span>
              )}
            </button>
          </div>
        </div>

        {railOpen && (
          <div className="space-y-3 border-t p-3">
            <div className="bg-surface-muted flex items-center justify-between gap-2 rounded-xl px-3 py-2.5">
              <div className="min-w-0">
                <p className="type-overline">Selected</p>
                <p className="text-foreground truncate text-sm font-semibold">{selectionLabel ?? "Nothing selected"}</p>
              </div>
              {selectionLabel && (
                <button
                  type="button"
                  onClick={onClearSelection}
                  aria-label="Clear selection"
                  className="text-muted-foreground hover:bg-navy-soft hover:text-navy flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <p className="type-helper px-1">{tip}</p>
          </div>
        )}
      </aside>

      {/* Canvas column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="bg-surface flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">{toolbar}</div>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
