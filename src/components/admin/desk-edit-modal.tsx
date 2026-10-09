"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type { RouterOutputs } from "@/lib/trpc/types";
import {
  DESK_RESTRICTION_MODES,
  DESK_RESTRICTION_MODE_LABELS,
  describeRules,
  findOverlappingDays,
  formatDays,
  type DeskRestrictionMode,
} from "@/lib/restrictions";
import { DESK_ATTRIBUTE_OPTIONS, MAX_BLOCK_OCCUPANTS, deskSaveInputSchema, type DeskSaveInput } from "@/lib/schemas/desk";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, MultiCombobox, Swatch, type ComboboxOption } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ManageRestrictionsDialog } from "@/components/admin/restrictions/manage-restrictions-dialog";
import { RestrictionEditorDialog } from "@/components/admin/restrictions/restriction-editor-dialog";
import { ManageShiftsDialog } from "@/components/admin/restrictions/shift-editor-dialog";

type DeskDetail = RouterOutputs["desk"]["get"];

interface BlockDraft {
  key: number;
  restrictionMode: DeskRestrictionMode;
  restrictionId: string | null;
  occupantUserIds: string[];
  /** Names for the occupant chips (ids → labels), kept locally so chips render before a search runs. */
  occupantLabels: Record<string, { name: string; email?: string }>;
  departmentNames: string[];
  shiftId: string | null;
  advanceBookingWindowDays: number | null;
}

let nextBlockKey = 1;

/**
 * The large "Editing Desk: 4.45" modal. Everything here is real form state
 * written back with one desk.save call — details, status, booking
 * configuration, attributes and any number of restriction + shift blocks.
 */
export function DeskEditModal({
  deskId,
  open,
  onOpenChange,
  onSaved,
}: {
  deskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (desk: DeskDetail) => void;
}) {
  const desk = api.desk.get.useQuery({ deskId: deskId! }, { enabled: open && !!deskId });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] w-[min(96vw,72rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl"
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {desk.isPending || !desk.data ? (
          <div className="p-8">
            <DialogHeader>
              <DialogTitle>{desk.isError ? "Desk not found" : "Loading desk…"}</DialogTitle>
              <DialogDescription>{desk.isError ? desk.error.message : "Fetching desk details, restrictions and shifts."}</DialogDescription>
            </DialogHeader>
            {desk.isError && (
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </DialogFooter>
            )}
          </div>
        ) : (
          <DeskEditForm
            key={`${desk.data.id}:${desk.data.updatedAt.toString()}`}
            desk={desk.data}
            onCancel={() => onOpenChange(false)}
            onSaved={(saved) => {
              onSaved?.(saved);
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeskEditForm({ desk, onCancel, onSaved }: { desk: DeskDetail; onCancel: () => void; onSaved: (desk: DeskDetail) => void }) {
  const utils = api.useUtils();

  // ---- form state, initialised from the loaded desk ----
  const [number, setNumber] = useState(desk.number);
  const [description, setDescription] = useState(desk.description ?? "");
  const [spaceType, setSpaceType] = useState(desk.spaceType ?? "");
  const [isActive, setIsActive] = useState(desk.isActive);
  const [requiresCheckIn, setRequiresCheckIn] = useState(desk.requiresCheckIn);
  const [assignmentMode, setAssignmentMode] = useState<"BOOKABLE" | "ASSIGNED">(desk.assignmentMode);
  const [assignedOccupantId, setAssignedOccupantId] = useState<string | null>(desk.assignedOccupantId);
  const [attributes, setAttributes] = useState<string[]>(desk.attributes.map((a) => a.type));
  const [customAttribute, setCustomAttribute] = useState("");
  const [blocks, setBlocks] = useState<BlockDraft[]>(() =>
    desk.restrictionAssignments.map((a) => ({
      key: nextBlockKey++,
      restrictionMode: a.restrictionMode,
      restrictionId: a.restrictionId,
      occupantUserIds: a.occupants.map((o) => o.userId),
      occupantLabels: Object.fromEntries(a.occupants.map((o) => [o.userId, { name: o.user.name, email: o.user.email }])),
      departmentNames: a.departmentNames,
      shiftId: a.shiftId,
      advanceBookingWindowDays: a.advanceBookingWindowDays,
    })),
  );
  const [error, setError] = useState<string | null>(null);

  // ---- nested dialogs ----
  const [manageOpen, setManageOpen] = useState(false);
  const [creatingRestrictionFor, setCreatingRestrictionFor] = useState<number | null>(null);
  /** Which block (if any) should pick up a shift created in the Manage shifts dialog; -1 = just managing. */
  const [shiftsDialogFor, setShiftsDialogFor] = useState<number | null>(null);
  const [windowFor, setWindowFor] = useState<number | null>(null);

  // ---- reference data ----
  const shifts = api.shift.list.useQuery();
  const restrictions = api.restriction.listRestrictions.useQuery();
  const departmentOptions = api.restriction.listDepartmentOptions.useQuery();
  const [occupantQuery, setOccupantQuery] = useState("");
  const debouncedOccupantQuery = useDebouncedValue(occupantQuery, 200);
  const occupantSearch = api.user.search.useQuery({ query: debouncedOccupantQuery, limit: 20 }, { enabled: assignmentMode === "ASSIGNED", placeholderData: (prev) => prev });

  const shiftById = useMemo(() => new Map((shifts.data ?? []).map((s) => [s.id, s])), [shifts.data]);
  const shiftOptions: ComboboxOption[] = useMemo(() => (shifts.data ?? []).map((s) => ({ value: s.id, label: s.name, description: formatDays(s.daysOfWeek) })), [shifts.data]);
  const restrictionOptions: ComboboxOption[] = useMemo(
    () => (restrictions.data ?? []).map((r) => ({ value: r.id, label: r.name, description: describeRules(r.rules, { maxValues: 4 }), color: r.color ?? "#9ca3af" })),
    [restrictions.data],
  );
  const occupantOptions: ComboboxOption[] = useMemo(() => {
    const list = [...(occupantSearch.data ?? [])];
    if (desk.assignedOccupant && !list.some((u) => u.id === desk.assignedOccupant!.id)) list.unshift({ ...desk.assignedOccupant, department: null });
    return list.map((u) => ({ value: u.id, label: u.name, description: u.email }));
  }, [occupantSearch.data, desk.assignedOccupant]);

  const overlappingDays = useMemo(
    () => findOverlappingDays(blocks.filter((b) => b.shiftId && shiftById.has(b.shiftId)).map((b) => ({ daysOfWeek: shiftById.get(b.shiftId!)!.daysOfWeek }))),
    [blocks, shiftById],
  );

  const updateBlock = (key: number, patch: Partial<BlockDraft>) => setBlocks((c) => c.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  const addBlock = () =>
    setBlocks((c) => [
      ...c,
      { key: nextBlockKey++, restrictionMode: "ANYONE", restrictionId: null, occupantUserIds: [], occupantLabels: {}, departmentNames: [], shiftId: null, advanceBookingWindowDays: null },
    ]);

  const save = api.desk.save.useMutation({
    onSuccess: (saved) => {
      toast.success(`Desk ${saved.number} saved`);
      utils.desk.get.setData({ deskId: saved.id }, saved);
      void utils.desk.listForFloor.invalidate();
      void utils.restriction.listRestrictions.invalidate();
      void utils.shift.list.invalidate();
      onSaved(saved);
    },
    onError: (err) => setError(err.message),
  });

  const submit = () => {
    setError(null);
    const payload: DeskSaveInput = {
      deskId: desk.id,
      number: number.trim(),
      description: description.trim() || null,
      spaceType: spaceType.trim() || null,
      isActive,
      requiresCheckIn,
      assignmentMode,
      assignedOccupantId: assignmentMode === "ASSIGNED" ? assignedOccupantId : null,
      attributes,
      assignments: blocks.map((b) => ({
        restrictionMode: b.restrictionMode,
        restrictionId: b.restrictionMode === "CUSTOM" ? b.restrictionId : null,
        occupantUserIds: b.restrictionMode === "ASSIGNED_OCCUPANTS" ? b.occupantUserIds : [],
        departmentNames: b.restrictionMode === "DEPARTMENT" ? b.departmentNames : [],
        shiftId: b.shiftId ?? "",
        advanceBookingWindowDays: b.advanceBookingWindowDays,
      })),
    };
    const parsed = deskSaveInputSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const blockIndex = issue?.path[0] === "assignments" && typeof issue.path[1] === "number" ? issue.path[1] + 1 : null;
      setError(blockIndex ? `Restriction block ${blockIndex}: ${issue?.message}` : (issue?.message ?? "Please check the form."));
      return;
    }
    if (overlappingDays.length > 0) {
      setError(`${formatDays(overlappingDays)} ${overlappingDays.length === 1 ? "is" : "are"} covered by more than one restriction block. Each day can only have one.`);
      return;
    }
    save.mutate(parsed.data);
  };

  const attributeOptions = useMemo(() => {
    const known = new Map(DESK_ATTRIBUTE_OPTIONS.map((o) => [o.key, o.label]));
    for (const key of attributes) if (!known.has(key)) known.set(key, key.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()));
    return [...known.entries()].map(([key, label]) => ({ key, label }));
  }, [attributes]);

  const windowBlock = blocks.find((b) => b.key === windowFor) ?? null;

  return (
    <>
      <DialogHeader className="bg-navy px-6 py-4 text-white">
        <DialogTitle className="text-xl text-white">Editing Desk: {desk.number}</DialogTitle>
        <DialogDescription className="text-light-blue/80">
          {desk.floor.site.name} · {desk.floor.name}
          {desk.restrictionAssignments.length > 0 && ` · ${desk.restrictionAssignments.length} restriction block${desk.restrictionAssignments.length === 1 ? "" : "s"}`}
        </DialogDescription>
      </DialogHeader>

      <div className="grid flex-1 gap-0 overflow-y-auto lg:grid-cols-[1.1fr_1.3fr_1fr] lg:overflow-hidden">
        {/* ---- Details ---- */}
        <section className="space-y-4 border-b p-6 lg:overflow-y-auto lg:border-r lg:border-b-0" aria-labelledby="desk-details-heading">
          <h3 id="desk-details-heading" className="text-base font-semibold">
            Details
          </h3>
          <div className="grid gap-1.5">
            <Label htmlFor="desk-number">Desk name</Label>
            <Input id="desk-number" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={60} required aria-invalid={number.trim().length === 0} />
            <p className="text-muted-foreground text-xs">Must be unique on {desk.floor.name}.</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Current occupant</Label>
            <p className="text-sm">{desk.assignedOccupant ? `${desk.assignedOccupant.name} (${desk.assignedOccupant.email})` : "Vacant desk"}</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="desk-space-type">Space type</Label>
            <Input id="desk-space-type" value={spaceType} onChange={(e) => setSpaceType(e.target.value)} placeholder="Desk" maxLength={60} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="desk-description">Description</Label>
            <Textarea id="desk-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add a description for this desk" maxLength={1000} rows={3} />
          </div>
          <div className="grid gap-1.5">
            <Label>Position</Label>
            <p className="text-muted-foreground text-xs">
              x {Math.round(desk.x)}, y {Math.round(desk.y)} on the floor plan — drag the desk on the map to move it.
            </p>
          </div>
        </section>

        {/* ---- Configuration + restriction blocks ---- */}
        <section className="space-y-5 border-b p-6 lg:overflow-y-auto lg:border-r lg:border-b-0" aria-labelledby="desk-config-heading">
          <h3 id="desk-config-heading" className="sr-only">
            Booking configuration
          </h3>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="desk-active" className="text-sm">
              Desk status: <span className={isActive ? "font-semibold text-success" : "font-semibold text-muted-foreground"}>{isActive ? "Active" : "Inactive"}</span>
            </Label>
            <Switch id="desk-active" checked={isActive} onCheckedChange={setIsActive} aria-label="Desk active" />
          </div>
          {!isActive && <p className="text-muted-foreground -mt-3 text-xs">Inactive desks stay on the Editing Platform but show as unavailable on the Floor Map and can&apos;t be booked.</p>}

          <div className="grid gap-1.5">
            <Label htmlFor="desk-assign-mode">Assign mode</Label>
            <Select value={assignmentMode} onValueChange={(v) => setAssignmentMode(v as "BOOKABLE" | "ASSIGNED")}>
              <SelectTrigger id="desk-assign-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOOKABLE">Bookable Desk (Self-service)</SelectItem>
                <SelectItem value="ASSIGNED">Assigned Desk (permanent occupant)</SelectItem>
              </SelectContent>
            </Select>
            {assignmentMode === "ASSIGNED" && (
              <div className="grid gap-1.5 pt-1">
                <Label htmlFor="desk-occupant">Assigned occupant</Label>
                <Combobox
                  id="desk-occupant"
                  value={assignedOccupantId}
                  onChange={setAssignedOccupantId}
                  options={occupantOptions}
                  onSearchChange={setOccupantQuery}
                  loading={occupantSearch.isFetching}
                  placeholder="Search employees…"
                  emptyText={occupantQuery ? "No employees match" : "Type to search employees"}
                />
              </div>
            )}
            <label className="flex items-center gap-2 pt-1 text-sm">
              <Checkbox checked={requiresCheckIn} onCheckedChange={(v) => setRequiresCheckIn(v === true)} />
              Require check-in
            </label>
          </div>

          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bookings restricted to</h4>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShiftsDialogFor(-1)}>
                  Manage shifts
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setManageOpen(true)}>
                  Manage restrictions
                </Button>
              </div>
            </div>

            {blocks.length === 0 && (
              <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
                No restriction blocks — anyone can book this desk on any working day. Add a block to limit who can book on which days.
              </p>
            )}

            {blocks.map((block, index) => {
              const shift = block.shiftId ? shiftById.get(block.shiftId) : undefined;
              const restriction = block.restrictionId ? restrictions.data?.find((r) => r.id === block.restrictionId) : undefined;
              const blockOverlaps = shift ? shift.daysOfWeek.some((d) => overlappingDays.includes(d)) : false;
              return (
                <fieldset key={block.key} className={`space-y-3 rounded-lg border p-3 ${blockOverlaps ? "border-[#f5d2b3] bg-warning-soft/50" : "bg-surface-muted"}`}>
                  <legend className="sr-only">Restriction block {index + 1}</legend>
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 gap-1.5">
                      <Label htmlFor={`block-mode-${block.key}`} className="text-xs text-muted-foreground">
                        Restriction {index + 1}
                      </Label>
                      <Select
                        value={block.restrictionMode}
                        onValueChange={(v) => updateBlock(block.key, { restrictionMode: v as DeskRestrictionMode, restrictionId: v === "CUSTOM" ? block.restrictionId : null })}
                      >
                        <SelectTrigger id={`block-mode-${block.key}`} className="w-full bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DESK_RESTRICTION_MODES.map((mode) => (
                            <SelectItem key={mode} value={mode}>
                              {DESK_RESTRICTION_MODE_LABELS[mode]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="mt-5" aria-label={`Remove restriction block ${index + 1}`} onClick={() => setBlocks((c) => c.filter((b) => b.key !== block.key))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {block.restrictionMode === "CUSTOM" && (
                    <div className="grid gap-1.5">
                      <Combobox
                        aria-label="Custom restriction"
                        value={block.restrictionId}
                        onChange={(v) => updateBlock(block.key, { restrictionId: v })}
                        options={restrictionOptions}
                        placeholder="Choose a restriction…"
                        searchPlaceholder="Search restrictions…"
                        emptyText="No restrictions match"
                        className="bg-white"
                        footer={(close) => (
                          <div className="grid gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="justify-start"
                              onClick={() => {
                                close();
                                setCreatingRestrictionFor(block.key);
                              }}
                            >
                              <Plus className="size-4" /> Create new restriction
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="justify-start"
                              onClick={() => {
                                close();
                                setManageOpen(true);
                              }}
                            >
                              See rules for all restrictions / manage
                            </Button>
                          </div>
                        )}
                      />
                      {restriction && (
                        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                          <Swatch color={restriction.color ?? "#9ca3af"} className="mt-1" />
                          <span>{describeRules(restriction.rules, { maxValues: 6 })}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {block.restrictionMode === "ASSIGNED_OCCUPANTS" && (
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground">Occupants who can book (up to {MAX_BLOCK_OCCUPANTS})</Label>
                      <BlockOccupantPicker
                        values={block.occupantUserIds}
                        labels={block.occupantLabels}
                        onChange={(ids, labels) => updateBlock(block.key, { occupantUserIds: ids, occupantLabels: { ...block.occupantLabels, ...labels } })}
                      />
                      {block.occupantUserIds.length === 0 && <p className="text-xs text-[#6b3608]">Type a name or email and pick at least one occupant.</p>}
                    </div>
                  )}
                  {block.restrictionMode === "DEPARTMENT" && (
                    <div className="grid gap-1.5">
                      <Label className="text-xs text-muted-foreground">Departments whose people can book</Label>
                      <MultiCombobox
                        aria-label="Departments"
                        values={block.departmentNames}
                        onChange={(names) => updateBlock(block.key, { departmentNames: names })}
                        options={(departmentOptions.data ?? []).map((name) => ({ value: name, label: name }))}
                        placeholder="Type a department name…"
                        searchPlaceholder="Search departments…"
                        emptyText="No department with that name on any employee record"
                        className="bg-white"
                      />
                      {block.departmentNames.length === 0 && <p className="text-xs text-[#6b3608]">Pick at least one department.</p>}
                    </div>
                  )}

                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Availability (shifts)</Label>
                    <Combobox
                      aria-label="Availability shift"
                      value={block.shiftId}
                      onChange={(v) => updateBlock(block.key, { shiftId: v })}
                      options={shiftOptions}
                      placeholder="Choose a shift…"
                      searchPlaceholder="Search shifts…"
                      className="bg-white"
                      footer={(close) => (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => {
                            close();
                            setShiftsDialogFor(block.key);
                          }}
                        >
                          <Plus className="size-4" /> Create or manage shifts
                        </Button>
                      )}
                    />
                    {shift && <p className="text-muted-foreground text-xs">{formatDays(shift.daysOfWeek)}</p>}
                    {blockOverlaps && <p className="text-xs text-[#6b3608]">Overlaps another block on {formatDays(shift!.daysOfWeek.filter((d) => overlappingDays.includes(d)))}.</p>}
                  </div>

                  <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs font-semibold tracking-wide uppercase" onClick={() => setWindowFor(block.key)}>
                    <CalendarClock className="size-4" />
                    {block.advanceBookingWindowDays ? `Advance booking window: ${block.advanceBookingWindowDays} days` : "Set advance booking window"}
                  </Button>
                </fieldset>
              );
            })}

            <Button type="button" variant="outline" size="sm" onClick={addBlock}>
              <Plus className="size-4" /> Add booking restriction
            </Button>
          </div>
        </section>

        {/* ---- Attributes ---- */}
        <section className="p-6 lg:overflow-y-auto" aria-labelledby="desk-attributes-heading">
          <Tabs defaultValue="attributes">
            <TabsList className="w-full">
              <TabsTrigger value="attributes" className="flex-1">
                Attributes
              </TabsTrigger>
            </TabsList>
            <TabsContent value="attributes" className="space-y-3 pt-2">
              <h3 id="desk-attributes-heading" className="sr-only">
                Attributes
              </h3>
              <p className="text-muted-foreground text-xs">Features employees can filter by when finding a desk.</p>
              <ul className="grid gap-2">
                {attributeOptions.map((option) => (
                  <li key={option.key}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={attributes.includes(option.key)}
                        onCheckedChange={(v) => setAttributes((c) => (v === true ? [...c, option.key] : c.filter((k) => k !== option.key)))}
                      />
                      {option.label}
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex gap-2 pt-2">
                <Input
                  value={customAttribute}
                  onChange={(e) => setCustomAttribute(e.target.value)}
                  placeholder="Other attribute…"
                  aria-label="Custom attribute"
                  maxLength={60}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomAttribute();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addCustomAttribute} disabled={!customAttribute.trim()}>
                  Add
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <DialogFooter className="items-center border-t bg-white px-6 py-4 sm:justify-between">
        <p role={error ? "alert" : undefined} className={`text-sm ${error ? "text-danger" : "text-muted-foreground"}`}>
          {error ?? (overlappingDays.length > 0 ? `Fix the overlap on ${formatDays(overlappingDays)} before saving.` : "Changes are saved when you press Save.")}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={save.isPending || number.trim().length === 0}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogFooter>

      {/* ---- nested dialogs ---- */}
      <ManageRestrictionsDialog open={manageOpen} onOpenChange={setManageOpen} />
      <RestrictionEditorDialog
        open={creatingRestrictionFor !== null}
        onOpenChange={(next) => !next && setCreatingRestrictionFor(null)}
        restriction={null}
        onSaved={(saved) => {
          if (creatingRestrictionFor !== null) updateBlock(creatingRestrictionFor, { restrictionMode: "CUSTOM", restrictionId: saved.id });
          setCreatingRestrictionFor(null);
        }}
      />
      <ManageShiftsDialog
        open={shiftsDialogFor !== null}
        onOpenChange={(next) => !next && setShiftsDialogFor(null)}
        onCreated={(shift) => {
          if (shiftsDialogFor !== null && shiftsDialogFor >= 0) updateBlock(shiftsDialogFor, { shiftId: shift.id });
          setShiftsDialogFor(null);
        }}
      />
      <AdvanceWindowDialog
        open={windowBlock !== null}
        value={windowBlock?.advanceBookingWindowDays ?? null}
        onOpenChange={(next) => !next && setWindowFor(null)}
        onSave={(days) => {
          if (windowFor !== null) updateBlock(windowFor, { advanceBookingWindowDays: days });
          setWindowFor(null);
        }}
      />
    </>
  );

  function addCustomAttribute() {
    const key = customAttribute
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    if (!key) return;
    setAttributes((c) => (c.includes(key) ? c : [...c, key]));
    setCustomAttribute("");
  }
}

function AdvanceWindowDialog({
  open,
  value,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  value: number | null;
  onOpenChange: (open: boolean) => void;
  onSave: (days: number | null) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">{open && <AdvanceWindowForm initial={value} onSave={onSave} onCancel={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function AdvanceWindowForm({ initial, onSave, onCancel }: { initial: number | null; onSave: (days: number | null) => void; onCancel: () => void }) {
  const [days, setDays] = useState(initial ? String(initial) : "");
  const parsed = Number(days);
  const valid = days === "" || (Number.isInteger(parsed) && parsed >= 1 && parsed <= 730);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Advance booking window</DialogTitle>
        <DialogDescription>How far ahead this desk can be booked on the days covered by this restriction block. Leave empty for no limit.</DialogDescription>
      </DialogHeader>
      <div className="flex items-center gap-2">
        <Label htmlFor="advance-days" className="whitespace-nowrap">
          Users can book this desk up to
        </Label>
        <Input id="advance-days" type="number" min={1} max={730} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} className="w-24" aria-invalid={!valid} />
        <span className="text-sm">days in advance</span>
      </div>
      {!valid && (
        <p role="alert" className="text-sm text-danger">
          Enter a whole number between 1 and 730.
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {initial !== null && (
          <Button type="button" variant="ghost" onClick={() => onSave(null)}>
            Clear
          </Button>
        )}
        <Button type="button" disabled={!valid} onClick={() => onSave(days === "" ? null : parsed)}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

/** Searchable multi-select of employees (by name or email) for an assigned-occupants block. */
function BlockOccupantPicker({
  values,
  labels,
  onChange,
}: {
  values: string[];
  labels: Record<string, { name: string; email?: string }>;
  onChange: (ids: string[], labels: Record<string, { name: string; email?: string }>) => void;
}) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);
  const search = api.user.search.useQuery({ query: debouncedQuery, limit: 20 }, { placeholderData: (prev) => prev });

  const options: ComboboxOption[] = useMemo(() => {
    const byId = new Map<string, ComboboxOption>();
    for (const id of values) byId.set(id, { value: id, label: labels[id]?.name ?? id, description: labels[id]?.email });
    for (const u of search.data ?? []) byId.set(u.id, { value: u.id, label: u.name, description: u.email });
    return [...byId.values()];
  }, [values, labels, search.data]);

  return (
    <MultiCombobox
      aria-label="Occupants"
      values={values}
      onChange={(ids) => {
        if (ids.length > MAX_BLOCK_OCCUPANTS) {
          toast.error(`Up to ${MAX_BLOCK_OCCUPANTS} occupants per restriction block`);
          return;
        }
        const newLabels: Record<string, { name: string; email?: string }> = {};
        for (const u of search.data ?? []) if (ids.includes(u.id)) newLabels[u.id] = { name: u.name, email: u.email };
        onChange(ids, newLabels);
      }}
      options={options}
      onSearchChange={setQuery}
      loading={search.isFetching}
      placeholder="Type a name or email…"
      searchPlaceholder="Search employees…"
      emptyText={query ? "No employees match" : "Type to search employees"}
      className="bg-white"
    />
  );
}
