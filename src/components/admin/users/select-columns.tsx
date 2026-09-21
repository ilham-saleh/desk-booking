"use client";

import { useEffect, useState } from "react";
import { Columns3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Every column the Users table can show. Name is locked so a row is always identifiable. */
export const USER_COLUMNS = [
  { key: "name", label: "Name", locked: true, defaultVisible: true },
  { key: "email", label: "Email", defaultVisible: true },
  { key: "title", label: "Title", defaultVisible: true },
  { key: "department", label: "Department", defaultVisible: true },
  { key: "role", label: "Role", defaultVisible: true },
  { key: "permissions", label: "Permissions", defaultVisible: true },
  { key: "location", label: "Location", defaultVisible: false },
  { key: "lastActivity", label: "Last Activity", defaultVisible: false },
  { key: "status", label: "Status", defaultVisible: false },
] as const;

export type UserColumnKey = (typeof USER_COLUMNS)[number]["key"];

const STORAGE_KEY = "admin.users.visibleColumns";
const DEFAULT_VISIBLE = USER_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key);

/**
 * Column visibility is a per-viewer table preference (not data), so it lives in
 * localStorage. Reads/writes are guarded — storage may be blocked or empty.
 */
export function useVisibleColumns() {
  // Server render and first client render both use the defaults; the stored
  // preference is applied once the component has mounted (avoids a hydration
  // mismatch without calling setState synchronously inside the effect body).
  const [stored, setStored] = useState<UserColumnKey[] | null>(null);
  useEffect(() => {
    const handle = window.setTimeout(() => setStored(readStoredColumns()), 0);
    return () => window.clearTimeout(handle);
  }, []);

  const visible = stored ?? DEFAULT_VISIBLE;
  const update = (next: UserColumnKey[]) => {
    setStored(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore — preference simply won't survive a reload
    }
  };

  return { visible, setVisible: update, isVisible: (key: UserColumnKey) => visible.includes(key) };
}

function readStoredColumns(): UserColumnKey[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE;
    const known = USER_COLUMNS.map((column) => column.key as string);
    const next = parsed.filter((key): key is UserColumnKey => typeof key === "string" && known.includes(key));
    return next.includes("name") ? next : ["name", ...next];
  } catch {
    return DEFAULT_VISIBLE;
  }
}

export function SelectColumnsButton({ visible, onChange }: { visible: UserColumnKey[]; onChange: (next: UserColumnKey[]) => void }) {
  const toggle = (key: UserColumnKey, checked: boolean) => {
    const ordered = USER_COLUMNS.map((column) => column.key).filter((k) => (k === key ? checked : visible.includes(k)));
    onChange(ordered);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Columns3 className="size-4" />
          Select Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <p className="text-muted-foreground mb-2 text-xs">Choose which columns the table shows. This doesn&apos;t change or filter any user data.</p>
        <div className="space-y-2">
          {USER_COLUMNS.map((column) => {
            const id = `users-column-${column.key}`;
            const locked = "locked" in column && column.locked;
            return (
              <div key={column.key} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={visible.includes(column.key)}
                  disabled={locked}
                  onCheckedChange={(checked) => toggle(column.key, checked === true)}
                />
                <Label htmlFor={id} className={locked ? "text-muted-foreground" : ""}>
                  {column.label}
                  {locked && <span className="text-muted-foreground text-[10px] uppercase">always shown</span>}
                </Label>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
