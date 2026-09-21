"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Menu, ChevronDown, Plus, Edit2, Trash2, MousePointer2, Grid3x3, Home } from "lucide-react";

export type EditorObjectType = "desks" | "utilities" | "rooms" | null;
export type EditorAction = "create" | "edit" | "delete" | null;
/** Select = navigate/inspect only; Edit = create, drag, edit, delete. Kept separate so nothing moves by accident. */
export type EditorMode = "select" | "edit";

interface EditorLayoutProps {
  floorName: string;
  children: React.ReactNode;
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
}

export function EditorLayout({
  floorName,
  children,
  mode,
  onModeChange,
  activeObjectType,
  activeAction,
  onToolAction,
  selectionLabel,
  onClearSelection,
  hasFloorPlan,
}: EditorLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showEditorMenu, setShowEditorMenu] = useState(true);

  const toolButton = (
    objectType: Exclude<EditorObjectType, null>,
    action: Exclude<EditorAction, null>,
    label: string,
    Icon: typeof Plus,
  ) => (
    <Button
      variant={activeObjectType === objectType && activeAction === action ? "default" : "ghost"}
      size="sm"
      className="w-full justify-start text-xs"
      aria-pressed={activeObjectType === objectType && activeAction === action}
      onClick={() => onToolAction(objectType, action)}
    >
      <Icon className="mr-2 h-3 w-3" /> {label}
    </Button>
  );

  return (
    <div className="flex h-full bg-gray-50">
      {/* Left Sidebar — Editor Tools */}
      <div className={`flex flex-col border-r bg-white transition-all duration-200 ${sidebarOpen ? "w-64" : "w-16"}`}>
        <div className="border-b p-4">
          <Button variant="ghost" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="w-full justify-start" aria-expanded={sidebarOpen}>
            <Menu className="h-4 w-4" />
            {sidebarOpen && <span className="ml-2">Editor Tools</span>}
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {sidebarOpen && (
            <>
              <Tabs value={mode} onValueChange={(v) => onModeChange(v as EditorMode)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="select" className="flex items-center gap-2">
                    <MousePointer2 className="h-4 w-4" />
                    <span className="text-xs">Select</span>
                  </TabsTrigger>
                  <TabsTrigger value="edit" className="flex items-center gap-2">
                    <Grid3x3 className="h-4 w-4" />
                    <span className="text-xs">Edit</span>
                  </TabsTrigger>
                </TabsList>

                {/* Select mode */}
                <TabsContent value="select" className="mt-4 space-y-2">
                  <Card>
                    <CardContent className="space-y-2 pt-6">
                      <p className="text-sm text-gray-600">Click a desk to inspect it. Nothing can be moved in Select mode.</p>
                      <p className="text-sm font-medium">{selectionLabel ?? "No selection"}</p>
                      <Button size="sm" variant="outline" className="w-full" onClick={onClearSelection} disabled={!selectionLabel}>
                        Clear Selection
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Edit mode — Editors */}
                <TabsContent value="edit" className="mt-4 space-y-2">
                  <Card>
                    <CardContent className="space-y-2 pt-6">
                      <Button variant="outline" size="sm" onClick={() => setShowEditorMenu(!showEditorMenu)} className="w-full justify-between" aria-expanded={showEditorMenu}>
                        <span>Editors</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${showEditorMenu ? "rotate-180" : ""}`} />
                      </Button>

                      {showEditorMenu && (
                        <div className="space-y-2 border-t pt-2">
                          <div className="space-y-1">
                            <p className="px-2 text-xs font-semibold text-gray-600">Seats</p>
                            <div className="space-y-1">
                              {toolButton("desks", "create", "Create", Plus)}
                              {toolButton("desks", "edit", "Edit", Edit2)}
                              {toolButton("desks", "delete", "Delete", Trash2)}
                            </div>
                          </div>

                          <div className="space-y-1 border-t pt-2">
                            <p className="px-2 text-xs font-semibold text-gray-600">Utilities</p>
                            <div className="space-y-1">
                              {toolButton("utilities", "create", "Create", Plus)}
                              {toolButton("utilities", "delete", "Delete", Trash2)}
                            </div>
                          </div>

                          <div className="space-y-1 border-t pt-2">
                            <p className="px-2 text-xs font-semibold text-gray-600">Neighbourhoods</p>
                            <p className="px-2 text-xs text-gray-400">Not available yet</p>
                          </div>

                          <div className="space-y-1 border-t pt-2">
                            <p className="px-2 text-xs font-semibold text-gray-600">Rooms &amp; Spaces</p>
                            <div className="space-y-1">
                              {toolButton("rooms", "create", "Create", Home)}
                              {toolButton("rooms", "delete", "Delete", Trash2)}
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="space-y-2 pt-4">
                      <p className="text-xs text-gray-600">Selected</p>
                      <p className="text-sm font-medium">{selectionLabel ?? "Nothing selected"}</p>
                      {selectionLabel && (
                        <Button size="sm" variant="outline" className="w-full" onClick={onClearSelection}>
                          Clear Selection
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-4">
                  <p className="text-xs text-blue-700">
                    <strong>Tip:</strong>{" "}
                    {!hasFloorPlan
                      ? "Upload a floor plan below the map to get started."
                      : mode === "select"
                        ? "Switch to Edit to create, move or delete desks."
                        : activeAction === "create" && activeObjectType === "desks"
                          ? "Click anywhere on the floor plan to place the new desk. Press Esc to cancel."
                          : "Drag a desk to move it (saved on drop). Double-click a desk to edit it."}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="border-b bg-white p-4">
          <h2 className="font-semibold">{floorName} Editor</h2>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
