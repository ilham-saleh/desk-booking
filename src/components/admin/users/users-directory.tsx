"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, UserMinus, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

import { Role } from "@/generated/prisma/enums";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/roles";
import type { UserStatusFilter } from "@/lib/schemas/user";
import { api } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SelectColumnsButton, USER_COLUMNS, useVisibleColumns, type UserColumnKey } from "@/components/admin/users/select-columns";

type DirectoryRow = RouterOutputs["user"]["listDirectory"]["items"][number];
type SortField = "name" | "role" | "email" | "lastLoginAt";

const ALL_ROLES = "__all__";
const PAGE_SIZES = [10, 25, 50, 100];

const roleBadgeClass: Record<Role, string> = {
  [Role.PLATFORM_ADMIN]: "bg-red-100 text-red-900 border-red-200",
  [Role.ORG_SUPER_ADMIN]: "bg-purple-100 text-purple-900 border-purple-200",
  [Role.SITE_ADMIN]: "bg-blue-100 text-blue-900 border-blue-200",
  [Role.BOOKING_MANAGER]: "bg-emerald-100 text-emerald-900 border-emerald-200",
  [Role.STANDARD_USER]: "bg-gray-100 text-gray-800 border-gray-200",
};

/**
 * Users → searchable, paginated employee directory with Select Columns
 * (visibility only) and Edit Users mode (bulk removal). All filtering, sorting
 * and paging happen on the server so the page stays light with thousands of
 * HRIS-synced employees.
 */
export function UsersDirectory() {
  const utils = api.useUtils();
  const { visible, setVisible, isVisible } = useVisibleColumns();

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [status, setStatus] = useState<UserStatusFilter>("active");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState(false);

  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  // Any change to the record filters restarts from page 1 — derived, not effect-driven.
  const [filterKey, setFilterKey] = useState(() => filterSignature(debouncedSearch, role, status, pageSize));
  const currentKey = filterSignature(debouncedSearch, role, status, pageSize);
  if (currentKey !== filterKey) {
    setFilterKey(currentKey);
    setPage(1);
  }

  const directory = api.user.listDirectory.useQuery(
    { search: debouncedSearch, role: role ?? undefined, status, sortBy, sortDir, page, pageSize },
    { placeholderData: (prev) => prev },
  );

  const rows = useMemo(() => directory.data?.items ?? [], [directory.data]);
  const total = directory.data?.total ?? 0;
  const pageCount = directory.data?.pageCount ?? 1;
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastIndex = Math.min(page * pageSize, total);

  const removeMutation = api.user.deactivateMany.useMutation({
    onSuccess: (result) => {
      toast.success(result.deactivated === 1 ? "1 user removed" : `${result.deactivated} users removed`);
      setSelected(new Set());
      setConfirmRemove(false);
      void utils.user.listDirectory.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
      setConfirmRemove(false);
    },
  });

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const selectableRows = useMemo(() => rows.filter((row) => row.isActive), [rows]);
  const allOnPageSelected = selectableRows.length > 0 && selectableRows.every((row) => selected.has(row.id));
  const toggleAll = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of selectableRows) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const leaveEditMode = () => {
    setEditMode(false);
    setSelected(new Set());
  };

  const selectedNames = rows.filter((row) => selected.has(row.id)).map((row) => row.name);

  return (
    <div className="space-y-4">
      {/* Toolbar: record filters on the left/middle, table controls on the right */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid min-w-64 flex-1 gap-1.5">
          <Label htmlFor="users-search">Search users</Label>
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              id="users-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="pl-8"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="users-role-filter">Role</Label>
          <Select value={role ?? ALL_ROLES} onValueChange={(value) => setRole(value === ALL_ROLES ? null : (value as Role))}>
            <SelectTrigger id="users-role-filter" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ROLES}>All Roles</SelectItem>
              {ASSIGNABLE_ROLES.map((value) => (
                <SelectItem key={value} value={value}>
                  {roleLabel(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="users-status-filter">Status</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as UserStatusFilter)}>
            <SelectTrigger id="users-status-filter" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SelectColumnsButton visible={visible} onChange={setVisible} />
          {editMode ? (
            <Button variant="secondary" className="gap-2" onClick={leaveEditMode}>
              <X className="size-4" />
              Done Editing
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setEditMode(true)}>
              Edit Users
            </Button>
          )}
        </div>
        {editMode && (
          <div className="flex items-center gap-3" role="status">
            <span className="text-muted-foreground text-sm">{selected.size === 0 ? "Select users to remove" : `${selected.size} selected`}</span>
            <Button variant="destructive" className="gap-2" disabled={selected.size === 0} onClick={() => setConfirmRemove(true)}>
              <UserMinus className="size-4" />
              Remove Users
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {editMode && (
                <TableHead className="w-10">
                  <Checkbox aria-label="Select all users on this page" checked={allOnPageSelected} onCheckedChange={(checked) => toggleAll(checked === true)} />
                </TableHead>
              )}
              {USER_COLUMNS.filter((column) => isVisible(column.key)).map((column) => {
                const field = SORTABLE[column.key];
                const active = field !== undefined && sortBy === field;
                return (
                  <TableHead key={column.key} aria-sort={field ? (active ? (sortDir === "asc" ? "ascending" : "descending") : "none") : undefined}>
                    <ColumnHeader columnKey={column.key} label={column.label} sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {directory.isPending ? (
              <TableRow>
                <TableCell colSpan={visible.length + 1} className="text-muted-foreground py-10 text-center">
                  Loading users…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visible.length + 1} className="text-muted-foreground py-10 text-center">
                  {debouncedSearch || role || status !== "active" ? "No users match these filters." : "No users yet."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined} className={!row.isActive ? "text-muted-foreground" : undefined}>
                  {editMode && (
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${row.name}`}
                        checked={selected.has(row.id)}
                        disabled={!row.isActive}
                        onCheckedChange={(checked) => toggleOne(row.id, checked === true)}
                      />
                    </TableCell>
                  )}
                  {isVisible("name") && (
                    <TableCell className="font-medium">
                      <Link href={`/admin/users/${row.id}`} className="text-primary hover:underline">
                        {row.name}
                      </Link>
                    </TableCell>
                  )}
                  {isVisible("email") && <TableCell className="max-w-64 truncate text-sm">{row.email}</TableCell>}
                  {isVisible("title") && <TableCell className="text-sm">{row.title ?? <Empty />}</TableCell>}
                  {isVisible("department") && <TableCell className="text-sm">{row.department ?? <Empty />}</TableCell>}
                  {isVisible("role") && (
                    <TableCell>
                      <Badge variant="outline" className={roleBadgeClass[row.role]}>
                        {row.roleLabel}
                      </Badge>
                    </TableCell>
                  )}
                  {isVisible("permissions") && <TableCell className="text-sm"><PermissionsCell row={row} /></TableCell>}
                  {isVisible("location") && <TableCell className="text-sm">{row.location ?? <Empty />}</TableCell>}
                  {isVisible("lastActivity") && (
                    <TableCell className="text-sm">{row.lastLoginAt ? `Logged in ${formatDistanceToNow(new Date(row.lastLoginAt), { addSuffix: true })}` : "Never logged in"}</TableCell>
                  )}
                  {isVisible("status") && (
                    <TableCell>
                      <Badge variant={row.isActive ? "secondary" : "outline"}>{row.isActive ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Label htmlFor="users-page-size" className="text-muted-foreground">
            Rows per page
          </Label>
          <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
            <SelectTrigger id="users-page-size" size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground" role="status">
            {total === 0 ? "0 users" : `${firstIndex}–${lastIndex} of ${total}`}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft className="size-4" />
            </Button>
            {pageNumbers(page, pageCount).map((item, index) =>
              item === "…" ? (
                <span key={`gap-${index}`} className="text-muted-foreground px-1">
                  …
                </span>
              ) : (
                <Button key={item} variant={item === page ? "secondary" : "ghost"} size="sm" aria-current={item === page ? "page" : undefined} onClick={() => setPage(item)}>
                  {item}
                </Button>
              ),
            )}
            <Button variant="ghost" size="icon" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {selected.size === 1 ? "1 user" : `${selected.size} users`}?</DialogTitle>
            <DialogDescription>
              These users will no longer be able to sign in or use the desk-booking system. Their booking history is kept, and an admin can reactivate them later from their details page.
            </DialogDescription>
          </DialogHeader>
          {selectedNames.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-md border p-3 text-sm">
              {selectedNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
              {selected.size > selectedNames.length && <li className="text-muted-foreground">…and {selected.size - selectedNames.length} more on other pages</li>}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate({ userIds: [...selected] })}>
              {removeMutation.isPending ? "Removing…" : "Remove Users"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function filterSignature(search: string, role: Role | null, status: UserStatusFilter, pageSize: number): string {
  return `${search}|${role ?? ""}|${status}|${pageSize}`;
}

const SORTABLE: Partial<Record<UserColumnKey, SortField>> = { name: "name", email: "email", role: "role", lastActivity: "lastLoginAt" };

function ColumnHeader({
  columnKey,
  label,
  sortBy,
  sortDir,
  onSort,
}: {
  columnKey: UserColumnKey;
  label: string;
  sortBy: SortField;
  sortDir: "asc" | "desc";
  onSort: (field: SortField) => void;
}) {
  const field = SORTABLE[columnKey];
  if (!field) return <>{label}</>;
  const active = sortBy === field;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1 font-medium hover:underline" aria-label={`Sort by ${label}`}>
      {label}
      <Icon className={active ? "size-3.5" : "size-3.5 opacity-40"} />
    </button>
  );
}

function PermissionsCell({ row }: { row: DirectoryRow }) {
  if (row.permissionSites.length <= 2) return <span>{row.permissionSummary}</span>;
  const prefix = row.permissionSummary.split(":")[0];
  return (
    <span title={row.permissionSites.join(", ")}>
      {prefix}: {row.permissionSites.slice(0, 2).join(", ")} +{row.permissionSites.length - 2} more
    </span>
  );
}

function Empty() {
  return <span className="text-muted-foreground">—</span>;
}

/** 1 … 4 5 [6] 7 8 … 76 */
function pageNumbers(current: number, count: number): Array<number | "…"> {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set<number>([1, count, current - 1, current, current + 1].filter((p) => p >= 1 && p <= count));
  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | "…"> = [];
  for (const [index, pageNumber] of sorted.entries()) {
    if (index > 0 && pageNumber - sorted[index - 1]! > 1) result.push("…");
    result.push(pageNumber);
  }
  return result;
}
