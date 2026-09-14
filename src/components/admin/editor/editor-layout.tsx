"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Menu,
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  MousePointer2,
  Grid3x3,
  Home,
} from "lucide-react";

type ObjectType = "desks" | "utilities" | "rooms" | null;
type ActionType = "create" | "edit" | "delete" | null;
type EditorTab = "multi-select" | "seats" | "utilities" | "neighbourhoods" | "rooms";

interface EditorLayoutProps {
  floorName: string;
  children: React.ReactNode;
  activeObjectType?: ObjectType;
  onObjectTypeChange?: (type: ObjectType) => void;
  activeAction?: ActionType;
  onActionChange?: (action: ActionType) => void;
}

export function EditorLayout({
  floorName,
  children,
  activeObjectType = null,
  onObjectTypeChange,
  activeAction = null,
  onActionChange,
}: EditorLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<EditorTab>("multi-select");
  const [showEditorMenu, setShowEditorMenu] = useState(false);
  // activeAction is used in the JSX for conditional styling

  return (
    <div className="flex h-full bg-gray-50">
      {/* Left Sidebar */}
      <div
        className={`border-r bg-white transition-all duration-200 ${
          sidebarOpen ? "w-64" : "w-16"
        } flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="w-full justify-start"
          >
            <Menu className="h-4 w-4" />
            {sidebarOpen && <span className="ml-2">Editor Tools</span>}
          </Button>
        </div>

        {/* Sidebar Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {sidebarOpen && (
            <>
              {/* Tools Tabs */}
              <Tabs
                value={activeTab}
                onValueChange={(v) => {
                  setActiveTab(v as EditorTab);
                  setShowEditorMenu(false);
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="multi-select" className="flex items-center gap-2">
                    <MousePointer2 className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">Select</span>
                  </TabsTrigger>
                  <TabsTrigger value="seats" className="flex items-center gap-2">
                    <Grid3x3 className="h-4 w-4" />
                    <span className="hidden sm:inline text-xs">Edit</span>
                  </TabsTrigger>
                </TabsList>

                {/* Multi-Select Tab */}
                <TabsContent value="multi-select" className="space-y-2 mt-4">
                  <Card>
                    <CardContent className="pt-6 space-y-2">
                      <p className="text-sm text-gray-600">
                        Hold Shift and drag to select multiple desks
                      </p>
                      <Button size="sm" className="w-full">
                        Clear Selection
                      </Button>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Editors Tab */}
                <TabsContent value="seats" className="space-y-2 mt-4">
                  <Card>
                    <CardContent className="pt-6 space-y-2">
                      {/* Editors Menu Toggle */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowEditorMenu(!showEditorMenu)}
                        className="w-full justify-between"
                      >
                        <span>Editors</span>
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            showEditorMenu ? "rotate-180" : ""
                          }`}
                        />
                      </Button>

                      {/* Editors Sub-Menu */}
                      {showEditorMenu && (
                        <div className="space-y-2 pt-2 border-t">
                          {/* Seats */}
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-gray-600 px-2">Seats</p>
                            <div className="space-y-1">
                              <Button
                                variant={activeObjectType === "desks" && activeAction === "create" ? "default" : "ghost"}
                                size="sm"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                  onObjectTypeChange?.("desks");
                                  onActionChange?.("create");
                                }}
                              >
                                <Plus className="h-3 w-3 mr-2" /> Create
                              </Button>
                              <Button
                                variant={activeObjectType === "desks" && activeAction === "edit" ? "default" : "ghost"}
                                size="sm"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                  onObjectTypeChange?.("desks");
                                  onActionChange?.("edit");
                                }}
                              >
                                <Edit2 className="h-3 w-3 mr-2" /> Edit
                              </Button>
                              <Button
                                variant={activeObjectType === "desks" && activeAction === "delete" ? "default" : "ghost"}
                                size="sm"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                  onObjectTypeChange?.("desks");
                                  onActionChange?.("delete");
                                }}
                              >
                                <Trash2 className="h-3 w-3 mr-2" /> Delete
                              </Button>
                            </div>
                          </div>

                          {/* Utilities */}
                          <div className="space-y-1 border-t pt-2">
                            <p className="text-xs font-semibold text-gray-600 px-2">Utilities</p>
                            <div className="space-y-1">
                              <Button
                                variant={activeObjectType === "utilities" && activeAction === "create" ? "default" : "ghost"}
                                size="sm"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                  onObjectTypeChange?.("utilities");
                                  onActionChange?.("create");
                                }}
                              >
                                <Plus className="h-3 w-3 mr-2" /> Create
                              </Button>
                              <Button
                                variant={activeObjectType === "utilities" && activeAction === "edit" ? "default" : "ghost"}
                                size="sm"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                  onObjectTypeChange?.("utilities");
                                  onActionChange?.("edit");
                                }}
                              >
                                <Edit2 className="h-3 w-3 mr-2" /> Edit
                              </Button>
                              <Button
                                variant={activeObjectType === "utilities" && activeAction === "delete" ? "default" : "ghost"}
                                size="sm"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                  onObjectTypeChange?.("utilities");
                                  onActionChange?.("delete");
                                }}
                              >
                                <Trash2 className="h-3 w-3 mr-2" /> Delete
                              </Button>
                            </div>
                          </div>

                          {/* Neighbourhoods */}
                          <div className="space-y-1 border-t pt-2">
                            <p className="text-xs font-semibold text-gray-600 px-2">
                              Neighbourhoods
                            </p>
                            <div className="space-y-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-xs"
                              >
                                <Plus className="h-3 w-3 mr-2" /> Create
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-xs"
                              >
                                <Edit2 className="h-3 w-3 mr-2" /> Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-xs"
                              >
                                <Trash2 className="h-3 w-3 mr-2" /> Delete
                              </Button>
                            </div>
                          </div>

                          {/* Rooms & Spaces */}
                          <div className="space-y-1 border-t pt-2">
                            <p className="text-xs font-semibold text-gray-600 px-2">
                              Rooms & Spaces
                            </p>
                            <div className="space-y-1">
                              <Button
                                variant={activeObjectType === "rooms" && activeAction === "create" ? "default" : "ghost"}
                                size="sm"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                  onObjectTypeChange?.("rooms");
                                  onActionChange?.("create");
                                }}
                              >
                                <Home className="h-3 w-3 mr-2" /> Create
                              </Button>
                              <Button
                                variant={activeObjectType === "rooms" && activeAction === "edit" ? "default" : "ghost"}
                                size="sm"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                  onObjectTypeChange?.("rooms");
                                  onActionChange?.("edit");
                                }}
                              >
                                <Edit2 className="h-3 w-3 mr-2" /> Edit
                              </Button>
                              <Button
                                variant={activeObjectType === "rooms" && activeAction === "delete" ? "default" : "ghost"}
                                size="sm"
                                className="w-full justify-start text-xs"
                                onClick={() => {
                                  onObjectTypeChange?.("rooms");
                                  onActionChange?.("delete");
                                }}
                              >
                                <Trash2 className="h-3 w-3 mr-2" /> Delete
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Info Card */}
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-4">
                  <p className="text-xs text-blue-700">
                    <strong>Tip:</strong> Upload a floor plan to get started editing
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="border-b bg-white p-4">
          <h2 className="font-semibold">{floorName} Editor</h2>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
