"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/trpc/client";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  RULE_FIELD_LABELS,
  RULE_FIELD_TYPES,
  RULE_OPERATOR_LABELS,
  RULE_OPERATORS,
  type RuleConnector,
  type RuleFieldType,
  type RuleOperator,
} from "@/lib/restrictions";
import { restrictionCreateInputSchema, type RestrictionRuleInput } from "@/lib/schemas/restriction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MultiCombobox, type ComboboxOption } from "@/components/ui/combobox";

export interface EditableRestriction {
  id: string;
  name: string;
  color: string | null;
  deskCount?: number;
  floorCount?: number;
  rules: Array<{ fieldType: RuleFieldType; operator: RuleOperator; value: unknown; connector: RuleConnector; sortOrder: number }>;
}

interface RuleDraft {
  key: number;
  fieldType: RuleFieldType;
  operator: RuleOperator;
  value: string[];
  connector: RuleConnector;
}

const COLOR_PRESETS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];
const isMulti = (operator: RuleOperator) => operator === "IS_ANY_OF" || operator === "IS_NOT_ANY_OF";
const needsValue = (operator: RuleOperator) => operator !== "IS_EMPTY" && operator !== "IS_NOT_EMPTY";
const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

let nextKey = 1;
const toDraft = (rule: EditableRestriction["rules"][number]): RuleDraft => ({
  key: nextKey++,
  fieldType: rule.fieldType,
  operator: rule.operator,
  value: Array.isArray(rule.value) ? rule.value.filter((v): v is string => typeof v === "string") : typeof rule.value === "string" ? [rule.value] : [],
  connector: rule.connector,
});
const emptyDraft = (): RuleDraft => ({ key: nextKey++, fieldType: "DEPARTMENT", operator: "IS_ANY_OF", value: [], connector: "OR" });

/**
 * Create / edit a reusable custom restriction: name, colour and the rule
 * builder (field · operator · searchable values, joined by AND/OR). Shows a
 * live count of real employee records that match.
 */
export function RestrictionEditorDialog({
  open,
  onOpenChange,
  restriction,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates a new restriction. */
  restriction: EditableRestriction | null;
  onSaved: (restriction: { id: string; name: string }) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl" onInteractOutside={(e) => e.preventDefault()}>
        {open && <RestrictionEditorForm key={restriction?.id ?? "new"} restriction={restriction} onSaved={onSaved} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RestrictionEditorForm({
  restriction,
  onSaved,
  onCancel,
}: {
  restriction: EditableRestriction | null;
  onSaved: (restriction: { id: string; name: string }) => void;
  onCancel: () => void;
}) {
  const utils = api.useUtils();
  const [name, setName] = useState(restriction?.name ?? "");
  const [color, setColor] = useState(restriction?.color ?? COLOR_PRESETS[0]!);
  const [rules, setRules] = useState<RuleDraft[]>(() => (restriction ? [...restriction.rules].sort((a, b) => a.sortOrder - b.sortOrder).map(toDraft) : [emptyDraft()]));
  const [error, setError] = useState<string | null>(null);

  const payloadRules: RestrictionRuleInput[] = useMemo(
    () => rules.map((r) => ({ fieldType: r.fieldType, operator: r.operator, value: needsValue(r.operator) ? r.value : [], connector: r.connector })),
    [rules],
  );
  const validation = useMemo(() => restrictionCreateInputSchema.safeParse({ name, color, rules: payloadRules }), [name, color, payloadRules]);
  const debouncedRules = useDebouncedValue(payloadRules, 300);
  const rulesValid = useMemo(() => restrictionCreateInputSchema.shape.rules.safeParse(debouncedRules).success, [debouncedRules]);
  const matchCount = api.restriction.previewMatchCount.useQuery({ rules: debouncedRules }, { enabled: rulesValid, placeholderData: (prev) => prev });

  const afterSave = (saved: { id: string; name: string }) => {
    void utils.restriction.listRestrictions.invalidate();
    void utils.desk.invalidate();
    onSaved(saved);
  };
  const create = api.restriction.createRestriction.useMutation({
    onSuccess: (saved) => {
      toast.success(`Restriction "${saved.name}" created`);
      afterSave(saved);
    },
    onError: (err) => setError(err.message),
  });
  const update = api.restriction.updateRestriction.useMutation({
    onSuccess: (saved) => {
      toast.success(`Restriction "${saved.name}" updated`);
      afterSave(saved);
    },
    onError: (err) => setError(err.message),
  });
  const saving = create.isPending || update.isPending;

  const updateRule = (key: number, patch: Partial<RuleDraft>) =>
    setRules((current) =>
      current.map((rule) => {
        if (rule.key !== key) return rule;
        const next = { ...rule, ...patch };
        // Switching field type or between single/multi operators resets values that no longer fit.
        if (patch.fieldType && patch.fieldType !== rule.fieldType) next.value = [];
        if (patch.operator && !isMulti(patch.operator) && next.value.length > 1) next.value = next.value.slice(0, 1);
        return next;
      }),
    );

  const submit = () => {
    setError(null);
    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Check the form");
      return;
    }
    if (restriction) update.mutate({ restrictionId: restriction.id, ...validation.data });
    else create.mutate(validation.data);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{restriction ? `Edit “${restriction.name}”` : "Create custom restriction"}</DialogTitle>
        <DialogDescription>
          {restriction && (restriction.deskCount ?? 0) > 0
            ? `This custom restriction is currently assigned to ${restriction.deskCount} bookable desk${restriction.deskCount === 1 ? "" : "s"} on ${restriction.floorCount} floor${restriction.floorCount === 1 ? "" : "s"}. Changes apply to all of them.`
            : "Employees matching these rules can book any desk this restriction is assigned to."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-1.5">
            <Label htmlFor="restriction-name">Name (shown on the Floor Map)</Label>
            <Input id="restriction-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Technology, Product & R&D" maxLength={120} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="restriction-color">Colour</Label>
            <div className="flex items-center gap-1.5">
              <input
                id="restriction-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="size-9 cursor-pointer rounded-md border p-0.5"
                aria-label="Restriction colour"
              />
              <div className="flex flex-wrap gap-1">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-label={`Use colour ${preset}`}
                    aria-pressed={color === preset}
                    onClick={() => setColor(preset)}
                    className={`size-5 rounded-full border-2 ${color === preset ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: preset }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Rules</Label>
          {rules.length === 0 && <p className="text-muted-foreground text-sm">No rules — this restriction would match everyone. Add a rule.</p>}
          <div className="grid gap-2">
            {rules.map((rule, index) => (
              <div key={rule.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-2 sm:grid-cols-[5.5rem_9rem_9rem_minmax(0,1fr)_auto]">
                {index === 0 ? (
                  <span className="text-muted-foreground self-center text-sm">Where</span>
                ) : (
                  <Select value={rule.connector} onValueChange={(v) => updateRule(rule.key, { connector: v as RuleConnector })}>
                    <SelectTrigger aria-label="Connector" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AND">and</SelectItem>
                      <SelectItem value="OR">or</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <div className="col-span-1 grid grid-cols-2 gap-2 sm:col-span-2 sm:contents">
                  <Select value={rule.fieldType} onValueChange={(v) => updateRule(rule.key, { fieldType: v as RuleFieldType })}>
                    <SelectTrigger aria-label="Employee field" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_FIELD_TYPES.map((field) => (
                        <SelectItem key={field} value={field}>
                          {RULE_FIELD_LABELS[field]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={rule.operator} onValueChange={(v) => updateRule(rule.key, { operator: v as RuleOperator })}>
                    <SelectTrigger aria-label="Operator" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_OPERATORS.map((operator) => (
                        <SelectItem key={operator} value={operator}>
                          {RULE_OPERATOR_LABELS[operator]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  {needsValue(rule.operator) ? (
                    <RuleValuePicker rule={rule} onChange={(value) => updateRule(rule.key, { value })} />
                  ) : (
                    <p className="text-muted-foreground self-center py-2 text-sm">No value needed</p>
                  )}
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove rule" className="col-start-3 row-start-1 sm:col-start-5" onClick={() => setRules((c) => c.filter((r) => r.key !== rule.key))}>
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setRules((c) => [...c, emptyDraft()])}>
              <Plus className="size-4" /> Add rule
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">Rules joined by “and” must all match; “or” starts a new alternative.</p>
        </div>

        <p className="text-sm" role="status">
          {!rulesValid
            ? "Complete the rules to see how many employees match."
            : matchCount.data
              ? `${matchCount.data.matching} of ${matchCount.data.total} employee records match these rules`
              : "Counting matching employees…"}
        </p>

        {error && (
          <p role="alert" className="rounded-md border border-danger/25 bg-danger-soft p-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !validation.success}>
          {saving ? "Saving…" : restriction ? "Save restriction" : "Create restriction"}
        </Button>
      </DialogFooter>
    </>
  );
}

const PLACEHOLDERS: Record<RuleFieldType, string> = {
  DEPARTMENT: "Choose department(s)…",
  JOB_TITLE: "Choose job title(s)…",
  EMAIL: "Search by name or email…",
  USER: "Search employees…",
};

/** Searchable value picker: departments and job titles from real records, users/emails via server-side search. */
function RuleValuePicker({ rule, onChange }: { rule: RuleDraft; onChange: (value: string[]) => void }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);
  const multi = isMulti(rule.operator);
  const fixedList = rule.fieldType === "DEPARTMENT" || rule.fieldType === "JOB_TITLE";

  const departments = api.restriction.listDepartmentOptions.useQuery(undefined, { enabled: rule.fieldType === "DEPARTMENT" });
  const jobTitles = api.restriction.listJobTitleOptions.useQuery(undefined, { enabled: rule.fieldType === "JOB_TITLE" });
  const userSearch = api.user.search.useQuery({ query: debouncedQuery, limit: 20 }, { enabled: !fixedList, placeholderData: (prev) => prev });
  const selectedUsers = api.user.search.useQuery({ ids: rule.value }, { enabled: rule.fieldType === "USER" && rule.value.length > 0 });

  const options: ComboboxOption[] = useMemo(() => {
    if (rule.fieldType === "DEPARTMENT") return (departments.data ?? []).map((name) => ({ value: name, label: name }));
    if (rule.fieldType === "JOB_TITLE") {
      // Keep saved titles selectable even if nobody holds them any more.
      const titles = new Set([...(jobTitles.data ?? []), ...rule.value]);
      return [...titles].map((title) => ({ value: title, label: title }));
    }
    const users = userSearch.data ?? [];
    if (rule.fieldType === "EMAIL") {
      const byEmail = new Map<string, ComboboxOption>();
      for (const u of users) byEmail.set(u.email, { value: u.email, label: u.email, description: u.name });
      for (const email of rule.value) if (!byEmail.has(email)) byEmail.set(email, { value: email, label: email });
      return [...byEmail.values()];
    }
    const byId = new Map<string, ComboboxOption>();
    for (const u of [...(selectedUsers.data ?? []), ...users]) byId.set(u.id, { value: u.id, label: u.name, description: u.email });
    return [...byId.values()];
  }, [rule.fieldType, rule.value, departments.data, jobTitles.data, userSearch.data, selectedUsers.data]);

  const handleChange = (values: string[]) => onChange(multi ? values : values.slice(-1));

  return (
    <MultiCombobox
      aria-label="Rule values"
      values={rule.value}
      onChange={handleChange}
      options={options}
      placeholder={PLACEHOLDERS[rule.fieldType]}
      onSearchChange={fixedList ? undefined : setQuery}
      loading={fixedList ? departments.isFetching || jobTitles.isFetching : userSearch.isFetching}
      allowCustomValue={rule.fieldType === "EMAIL" ? looksLikeEmail : undefined}
      emptyText={
        rule.fieldType === "DEPARTMENT" ? "No departments found" : rule.fieldType === "JOB_TITLE" ? "No job titles found" : query ? "No employees match" : "Type to search employees"
      }
    />
  );
}
